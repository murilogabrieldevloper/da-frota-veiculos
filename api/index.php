<?php
/**
 * Da Frota Veículos — API do site (PHP 8 + SQLite).
 * Funciona em hospedagem compartilhada (Hostinger) sem configurar banco de dados:
 * o arquivo do banco é criado sozinho em api/data/ no primeiro acesso.
 *
 * Rotas: api/index.php?r=<rota>
 *   ping, me, login, logout, password, reset, settings, vehicles, leads, backup, restore
 *   fin, fincar, finexp (financeiro — ver api/financeiro.php)
 */
declare(strict_types=1);
require __DIR__ . '/config.php';

const DF_VERSION = '2.0';
const USERS = [
    'murilo'  => 'Murilo Gabriel',
    'emerson' => 'Emerson Da Frota',
];
const MAX_BODY = 25 * 1024 * 1024;       // 25 MB (veículo com várias fotos)
const MAX_LEAD = 30 * 1024;              // 30 KB por lead público
const DATA_DIR = __DIR__ . '/data';
const DB_FILE = DATA_DIR . '/.ht.dafrota.sqlite'; // ".ht" = o Apache/LiteSpeed nunca serve este arquivo
const UPLOAD_DIR = __DIR__ . '/../uploads/veiculos';
const UPLOAD_URL = 'uploads/veiculos';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
header('Referrer-Policy: same-origin');

set_exception_handler(function (Throwable $e) {
    error_log('[dafrota] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    fail(500, 'Erro no servidor. Tente de novo em instantes.');
});

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
function out($data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(int $code, string $msg): never { out(['error' => $msg], $code); }

function body(): array
{
    $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > MAX_BODY) fail(413, 'Envio grande demais. Use menos fotos ou fotos menores.');
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') return [];
    $j = json_decode($raw, true);
    if (!is_array($j)) fail(400, 'Dados inválidos.');
    return $j;
}

function uid(): string { return base_convert((string)time(), 10, 36) . bin2hex(random_bytes(4)); }
function now(): string { return gmdate('Y-m-d\TH:i:s.v\Z'); }
function clientIp(): string { return substr((string)($_SERVER['REMOTE_ADDR'] ?? '0'), 0, 64); }

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!is_dir(DATA_DIR)) mkdir(DATA_DIR, 0750, true);
    $fresh = !file_exists(DB_FILE);
    $pdo = new PDO('sqlite:' . DB_FILE, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    $pdo->exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, hash TEXT)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS vehicles (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, featured INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS leads (id TEXT PRIMARY KEY, data TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS hits (kind TEXT NOT NULL, ip TEXT NOT NULL, ts INTEGER NOT NULL)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS hits_idx ON hits (kind, ip, ts)');
    foreach (USERS as $id => $name) {
        $pdo->prepare('INSERT OR IGNORE INTO users (id, name) VALUES (?, ?)')->execute([$id, $name]);
    }
    if ($fresh) seed($pdo);
    return $pdo;
}

function seed(PDO $pdo): void
{
    $seed = [
        ['id' => 'porsche-cayenne', 'title' => 'Porsche Cayenne', 'brand' => 'Porsche', 'category' => 'SUV', 'year' => null, 'mileage' => null, 'price' => null,
         'transmission' => 'Automático', 'fuel' => 'Híbrido', 'color' => '', 'description' => 'Um SUV de presença, conforto e performance para quem quer dirigir em outro nível.',
         'coverImage' => 'img/porsche-cayenne.jpeg', 'gallery' => ['img/porsche-cayenne.jpeg'], 'featured' => true, 'status' => 'disponivel'],
        ['id' => 'bmw-serie-3', 'title' => 'BMW Série 3', 'brand' => 'BMW', 'category' => 'Sedã', 'year' => null, 'mileage' => null, 'price' => null,
         'transmission' => 'Automático', 'fuel' => 'Gasolina', 'color' => '', 'description' => 'Design esportivo e tecnologia reunidos em um sedã feito para aproveitar cada trajeto.',
         'coverImage' => 'img/bmw-serie-3.jpeg', 'gallery' => ['img/bmw-serie-3.jpeg'], 'featured' => false, 'status' => 'disponivel'],
    ];
    foreach ($seed as $v) {
        $v['createdAt'] = $v['updatedAt'] = now();
        putVehicle($pdo, $v);
    }
}

/* Limite de tentativas por IP (login e envio público de leads) */
function tooMany(string $kind, int $max, int $windowSec): bool
{
    $pdo = db();
    $pdo->prepare('DELETE FROM hits WHERE ts < ?')->execute([time() - 86400]);
    $st = $pdo->prepare('SELECT COUNT(*) FROM hits WHERE kind = ? AND ip = ? AND ts > ?');
    $st->execute([$kind, clientIp(), time() - $windowSec]);
    return (int)$st->fetchColumn() >= $max;
}
function hit(string $kind): void { db()->prepare('INSERT INTO hits (kind, ip, ts) VALUES (?, ?, ?)')->execute([$kind, clientIp(), time()]); }

/* ------------------------------------------------------------------ */
/* Sessão                                                              */
/* ------------------------------------------------------------------ */
function startSession(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    session_name('dfsess');
    session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'secure' => $https, 'samesite' => 'Lax']);
    session_start();
    // Sessão expira após 8 h
    if (isset($_SESSION['u'], $_SESSION['t']) && time() - $_SESSION['t'] > 8 * 3600) { $_SESSION = []; }
}
function me(): ?string
{
    startSession();
    $u = $_SESSION['u'] ?? null;
    if (!$u || !isset(USERS[$u])) return null;
    // Se a senha foi trocada/liberada, a sessão antiga cai
    $st = db()->prepare('SELECT hash FROM users WHERE id = ?'); $st->execute([$u]);
    $h = $st->fetchColumn();
    if (!$h || !hash_equals((string)($_SESSION['h'] ?? ''), substr((string)$h, -16))) return null;
    return $u;
}
function requireAuth(): string { $u = me(); if (!$u) fail(401, 'Faça login para continuar.'); return $u; }

/* Pedidos que alteram dados precisam vir do próprio site (proteção CSRF) */
function requireJsonWrite(): void
{
    $ct = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (!str_starts_with($ct, 'application/json') || ($_SERVER['HTTP_X_DF'] ?? '') !== '1') fail(400, 'Pedido inválido.');
}

/* ------------------------------------------------------------------ */
/* Veículos                                                            */
/* ------------------------------------------------------------------ */
function putVehicle(PDO $pdo, array $v): void
{
    $pdo->prepare('INSERT INTO vehicles (id, data, status, featured, created_at, updated_at) VALUES (:id, :d, :s, :f, :c, :u)
                   ON CONFLICT(id) DO UPDATE SET data = :d, status = :s, featured = :f, updated_at = :u')
        ->execute([':id' => $v['id'], ':d' => json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':s' => $v['status'],
                   ':f' => !empty($v['featured']) ? 1 : 0, ':c' => $v['createdAt'], ':u' => $v['updatedAt']]);
}
function listVehicles(bool $all): array
{
    $sql = 'SELECT data FROM vehicles' . ($all ? '' : " WHERE status <> 'vendido'") . ' ORDER BY featured DESC, created_at DESC';
    return array_map(fn($r) => json_decode($r['data'], true), db()->query($sql)->fetchAll());
}
function str(mixed $v, int $max = 200): string { return mb_substr(trim((string)($v ?? '')), 0, $max); }
function numOrNull(mixed $v): ?float { return is_numeric($v) && $v >= 0 ? (float)$v : null; }

/* Salva uma foto enviada como data URL; devolve o caminho público */
function saveImage(string $dataUrl, string $vehicleId, int $i): ?string
{
    if (!preg_match('#^data:image/(jpeg|jpg|png|webp);base64,#i', $dataUrl, $m)) return null;
    $bin = base64_decode(substr($dataUrl, strpos($dataUrl, ',') + 1), true);
    if ($bin === false || strlen($bin) > 6 * 1024 * 1024) return null;
    $info = @getimagesizefromstring($bin);
    if (!$info || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG, IMAGETYPE_WEBP], true)) return null;
    if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);
    $name = preg_replace('/[^a-z0-9-]/', '', strtolower($vehicleId)) . '-' . $i . '-' . bin2hex(random_bytes(3)) . '.jpg';
    $dest = UPLOAD_DIR . '/' . $name;
    if (function_exists('imagecreatefromstring')) {
        // Regrava a imagem (remove qualquer conteúdo que não seja a foto)
        $img = @imagecreatefromstring($bin);
        if (!$img) return null;
        imagejpeg($img, $dest, 84);
        imagedestroy($img);
    } else {
        if ($info[2] !== IMAGETYPE_JPEG) return null;
        file_put_contents($dest, $bin);
    }
    return UPLOAD_URL . '/' . $name;
}
function deleteUnusedImages(array $old, array $keep): void
{
    foreach (array_diff($old, $keep) as $p) {
        if (is_string($p) && str_starts_with($p, UPLOAD_URL . '/') && !str_contains($p, '..')) {
            $f = UPLOAD_DIR . '/' . basename($p);
            if (is_file($f)) @unlink($f);
        }
    }
}
function cleanVehicle(array $in, ?array $prev): array
{
    $id = $prev['id'] ?? (preg_match('/^[a-z0-9-]{3,60}$/i', (string)($in['id'] ?? '')) ? $in['id'] : uid());
    $status = in_array($in['status'] ?? '', ['disponivel', 'reservado', 'vendido'], true) ? $in['status'] : 'disponivel';
    $cat = in_array($in['category'] ?? '', ['SUV', 'Sedã', 'Hatch', 'Picape', 'Outros'], true) ? $in['category'] : 'Outros';
    $gallery = [];
    $i = 0;
    foreach (array_slice((array)($in['gallery'] ?? []), 0, 20) as $g) {
        if (!is_string($g)) continue;
        if (str_starts_with($g, 'data:')) { $p = saveImage($g, $id, $i++); if ($p) $gallery[] = $p; }
        elseif (preg_match('#^(img|uploads/veiculos)/[A-Za-z0-9._-]+$#', $g)) $gallery[] = $g;
    }
    if (!$gallery) fail(422, 'Adicione pelo menos uma foto válida (JPG, PNG ou WEBP).');
    if ($prev) deleteUnusedImages((array)($prev['gallery'] ?? []), $gallery);
    $title = str($in['title'] ?? '', 120);
    if (mb_strlen($title) < 3) fail(422, 'Informe o nome do anúncio.');
    return [
        'id' => $id, 'title' => $title, 'brand' => str($in['brand'] ?? '', 60), 'category' => $cat,
        'year' => str($in['year'] ?? '', 12) ?: null, 'mileage' => numOrNull($in['mileage'] ?? null), 'price' => numOrNull($in['price'] ?? null),
        'transmission' => str($in['transmission'] ?? '', 30), 'fuel' => str($in['fuel'] ?? '', 30), 'color' => str($in['color'] ?? '', 40),
        'description' => str($in['description'] ?? '', 3000), 'coverImage' => $gallery[0], 'gallery' => $gallery,
        'featured' => !empty($in['featured']), 'status' => $status,
        'createdAt' => $prev['createdAt'] ?? now(), 'updatedAt' => now(),
    ];
}

/* ------------------------------------------------------------------ */
/* Leads                                                               */
/* ------------------------------------------------------------------ */
const LEAD_STATUS = ['novo', 'contato', 'negociacao', 'vendido', 'perdido'];
function cleanStrings(mixed $v, int $depth = 0): mixed
{
    if ($depth > 3) return null;
    if (is_array($v)) { $o = []; foreach (array_slice($v, 0, 60, true) as $k => $x) $o[str((string)$k, 40)] = cleanStrings($x, $depth + 1); return $o; }
    if (is_string($v)) return str($v, 1000);
    if (is_int($v) || is_float($v) || is_bool($v) || $v === null) return $v;
    return null;
}
function getLead(string $id): ?array
{
    $st = db()->prepare('SELECT data FROM leads WHERE id = ?'); $st->execute([$id]);
    $r = $st->fetchColumn();
    return $r ? json_decode($r, true) : null;
}
function putLead(array $l): void
{
    db()->prepare('INSERT INTO leads (id, data, status, created_at, updated_at) VALUES (:id, :d, :s, :c, :u)
                   ON CONFLICT(id) DO UPDATE SET data = :d, status = :s, updated_at = :u')
        ->execute([':id' => $l['id'], ':d' => json_encode($l, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':s' => $l['status'],
                   ':c' => $l['createdAt'], ':u' => $l['updatedAt'] ?? $l['createdAt']]);
}

/* ------------------------------------------------------------------ */
/* Configurações                                                       */
/* ------------------------------------------------------------------ */
function getSettings(): array
{
    $o = [];
    foreach (db()->query('SELECT k, v FROM settings')->fetchAll() as $r) $o[$r['k']] = json_decode($r['v'], true);
    return $o;
}

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */
$r = preg_replace('/[^a-z]/', '', strtolower((string)($_GET['r'] ?? '')));
$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST' && in_array(strtoupper((string)($_GET['m'] ?? '')), ['PATCH', 'DELETE'], true)) $method = strtoupper($_GET['m']);
if ($method !== 'GET') requireJsonWrite();

switch ($r) {
    case 'ping':
        db();
        out(['ok' => true, 'version' => DF_VERSION]);

    case 'me': {
        $u = me();
        $users = [];
        foreach (db()->query('SELECT id, name, hash FROM users')->fetchAll() as $row) {
            if (isset(USERS[$row['id']])) $users[] = ['id' => $row['id'], 'name' => $row['name'], 'hasPassword' => !empty($row['hash'])];
        }
        out(['user' => $u, 'users' => $users]);
    }

    case 'login': {
        if ($method !== 'POST') fail(405, 'Método não permitido.');
        if (tooMany('login', 8, 15 * 60)) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
        $b = body();
        $id = (string)($b['user'] ?? '');
        $pass = (string)($b['password'] ?? '');
        if (!isset(USERS[$id])) fail(422, 'Escolha quem está entrando.');
        $st = db()->prepare('SELECT hash FROM users WHERE id = ?'); $st->execute([$id]);
        $hash = $st->fetchColumn();
        if (!$hash) {
            // Primeiro acesso: cria a senha
            if (!hash_equals(strtoupper(ACTIVATION_CODE), strtoupper(trim((string)($b['code'] ?? ''))))) { hit('login'); fail(401, 'Código de ativação incorreto.'); }
            if (mb_strlen($pass) < 8) fail(422, 'Use pelo menos 8 caracteres.');
            if ($pass !== (string)($b['password2'] ?? '')) fail(422, 'As senhas não conferem.');
            $hash = password_hash($pass, PASSWORD_DEFAULT);
            db()->prepare('UPDATE users SET hash = ? WHERE id = ?')->execute([$hash, $id]);
            $first = true;
        } elseif (!password_verify($pass, (string)$hash)) {
            hit('login');
            fail(401, 'Senha incorreta.');
        }
        startSession();
        session_regenerate_id(true);
        $_SESSION = ['u' => $id, 'h' => substr((string)$hash, -16), 't' => time()];
        out(['ok' => true, 'user' => $id, 'first' => $first ?? false]);
    }

    case 'logout':
        startSession(); $_SESSION = []; session_destroy();
        out(['ok' => true]);

    case 'password': {
        $u = requireAuth();
        $b = body();
        $st = db()->prepare('SELECT hash FROM users WHERE id = ?'); $st->execute([$u]);
        if (!password_verify((string)($b['old'] ?? ''), (string)$st->fetchColumn())) fail(422, 'Senha atual incorreta.');
        $new = (string)($b['new'] ?? '');
        if (mb_strlen($new) < 8) fail(422, 'A nova senha precisa de 8 caracteres ou mais.');
        $hash = password_hash($new, PASSWORD_DEFAULT);
        db()->prepare('UPDATE users SET hash = ? WHERE id = ?')->execute([$hash, $u]);
        $_SESSION['h'] = substr($hash, -16);
        out(['ok' => true]);
    }

    case 'reset': {
        $u = requireAuth();
        $who = (string)(body()['user'] ?? '');
        if (!isset(USERS[$who]) || $who === $u) fail(422, 'Consultor inválido.');
        db()->prepare('UPDATE users SET hash = NULL WHERE id = ?')->execute([$who]);
        out(['ok' => true]);
    }

    case 'settings':
        if ($method === 'GET') out(['settings' => getSettings()]);
        requireAuth();
        $b = body();
        $allowed = ['whatsapp' => fn($v) => preg_replace('/\D/', '', (string)$v), 'instagram' => fn($v) => ltrim(str($v, 60), '@')];
        foreach ($allowed as $k => $fn) {
            if (array_key_exists($k, $b)) db()->prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
                ->execute([$k, json_encode($fn($b[$k]))]);
        }
        out(['settings' => getSettings()]);

    case 'vehicles': {
        if ($method === 'GET') {
            $all = !empty($_GET['all']) && me();
            out(['vehicles' => listVehicles((bool)$all)]);
        }
        requireAuth();
        if ($method === 'DELETE') {
            $id = (string)($_GET['id'] ?? '');
            $st = db()->prepare('SELECT data FROM vehicles WHERE id = ?'); $st->execute([$id]);
            $prev = $st->fetchColumn();
            if ($prev) { deleteUnusedImages((array)(json_decode($prev, true)['gallery'] ?? []), []); db()->prepare('DELETE FROM vehicles WHERE id = ?')->execute([$id]); }
            out(['ok' => true]);
        }
        $in = body()['vehicle'] ?? null;
        if (!is_array($in)) fail(400, 'Dados do veículo ausentes.');
        $prev = null;
        if (!empty($in['id'])) {
            $st = db()->prepare('SELECT data FROM vehicles WHERE id = ?'); $st->execute([(string)$in['id']]);
            $p = $st->fetchColumn(); $prev = $p ? json_decode($p, true) : null;
        }
        $v = cleanVehicle($in, $prev);
        putVehicle(db(), $v);
        out(['vehicle' => $v]);
    }

    case 'leads': {
        if ($method === 'POST') {
            $raw = file_get_contents('php://input') ?: '';
            if (strlen($raw) > MAX_LEAD) fail(413, 'Dados grandes demais.');
            $b = json_decode($raw, true);
            if (!is_array($b)) fail(400, 'Dados inválidos.');
            $authed = me();
            if (!empty($b['website'])) out(['ok' => true]); // armadilha para robôs
            if (!$authed) {
                if (tooMany('lead', 10, 10 * 60)) fail(429, 'Muitos envios seguidos. Tente de novo em alguns minutos.');
                hit('lead');
            }
            $name = str($b['name'] ?? '', 120);
            $phone = str($b['phone'] ?? '', 30);
            if (mb_strlen($name) < 2 || strlen(preg_replace('/\D/', '', $phone)) < 10) fail(422, 'Informe nome e WhatsApp com DDD.');
            $sources = ['ficha', 'formulario', 'assistente', 'whatsapp'];
            $source = in_array($b['source'] ?? '', $sources, true) ? $b['source'] : 'site';
            if ($source === 'whatsapp' && !$authed) $source = 'site';
            $lead = [
                'id' => uid(), 'createdAt' => now(), 'updatedAt' => now(), 'status' => 'novo', 'notes' => '',
                'name' => $name, 'phone' => $phone, 'email' => str($b['email'] ?? '', 120),
                'vehicle' => str($b['vehicle'] ?? '', 160), 'vehicleId' => str($b['vehicleId'] ?? '', 60) ?: null,
                'message' => str($b['message'] ?? '', 1000), 'source' => $source,
                'ficha' => is_array($b['ficha'] ?? null) ? cleanStrings($b['ficha']) : null,
                'responsavel' => null, 'historico' => [],
            ];
            putLead($lead);
            out(['ok' => true, 'id' => $lead['id']], 201);
        }
        $u = requireAuth();
        if ($method === 'GET') {
            $rows = db()->query('SELECT data FROM leads ORDER BY created_at DESC LIMIT 5000')->fetchAll();
            out(['leads' => array_map(fn($x) => json_decode($x['data'], true), $rows)]);
        }
        $id = (string)($_GET['id'] ?? '');
        $lead = getLead($id);
        if (!$lead) fail(404, 'Lead não encontrado.');
        if ($method === 'DELETE') { db()->prepare('DELETE FROM leads WHERE id = ?')->execute([$id]); out(['ok' => true]); }
        if ($method === 'PATCH') {
            $b = body();
            if (isset($b['status'])) { if (!in_array($b['status'], LEAD_STATUS, true)) fail(422, 'Status inválido.'); $lead['status'] = $b['status']; }
            if (array_key_exists('responsavel', $b)) { $lead['responsavel'] = isset(USERS[(string)$b['responsavel']]) ? $b['responsavel'] : null; }
            if (isset($b['notes'])) $lead['notes'] = str($b['notes'], 4000);
            if (!empty($b['acao'])) {
                $lead['historico'] = array_slice([...($lead['historico'] ?? []), ['u' => $u, 'a' => str($b['acao'], 120), 't' => now()]], -50);
            }
            $lead['updatedAt'] = now();
            putLead($lead);
            out(['lead' => $lead]);
        }
        fail(405, 'Método não permitido.');
    }

    case 'fin':
    case 'fincar':
    case 'finexp':
        require_once __DIR__ . '/financeiro.php';
        finRoute($r, $method);

    case 'backup':
        requireAuth();
        require_once __DIR__ . '/financeiro.php';
        $rows = db()->query('SELECT data FROM leads ORDER BY created_at DESC')->fetchAll();
        out(['app' => 'dafrota', 'version' => 2, 'exportedAt' => now(), 'vehicles' => listVehicles(true),
             'leads' => array_map(fn($x) => json_decode($x['data'], true), $rows), 'settings' => getSettings(),
             'finCars' => finListCars(), 'finExpenses' => finListExpenses()]);

    case 'restore': {
        $u = requireAuth();
        require_once __DIR__ . '/financeiro.php';
        $b = body();
        if (($b['app'] ?? '') !== 'dafrota') fail(422, 'Arquivo de backup inválido.');
        $pdo = db();
        $pdo->beginTransaction();
        foreach ((array)($b['leads'] ?? []) as $l) {
            if (!is_array($l) || empty($l['id']) || empty($l['createdAt'])) continue;
            $l = cleanStrings($l); $l['status'] = in_array($l['status'] ?? '', LEAD_STATUS, true) ? $l['status'] : 'novo';
            putLead($l);
        }
        foreach ((array)($b['vehicles'] ?? []) as $v) {
            if (!is_array($v) || empty($v['id'])) continue;
            $gal = array_values(array_filter((array)($v['gallery'] ?? []), fn($g) => is_string($g) && preg_match('#^(img|uploads/veiculos)/[A-Za-z0-9._-]+$#', $g)));
            if (!$gal) continue;
            $v = cleanStrings($v); $v['gallery'] = $gal; $v['coverImage'] = $gal[0];
            $v['status'] = in_array($v['status'] ?? '', ['disponivel', 'reservado', 'vendido'], true) ? $v['status'] : 'disponivel';
            $v['createdAt'] = $v['createdAt'] ?? now(); $v['updatedAt'] = now();
            putVehicle($pdo, $v);
        }
        finRestore($b, $u);
        $pdo->commit();
        out(['ok' => true]);
    }

    default:
        fail(404, 'Rota não encontrada.');
}
