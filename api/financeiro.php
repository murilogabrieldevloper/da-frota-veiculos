<?php
/**
 * Da Frota Veículos — Financeiro (custos por carro, despesas da loja, fechamento do mês).
 * Carregado por api/index.php só nas rotas fin, fincar e finexp (e no backup).
 * Tudo aqui exige login: valor de compra e placa NUNCA vão para a rota pública "vehicles".
 *
 *   GET    ?r=fin                 → { cars, expenses }
 *   POST   ?r=fincar  {car}       → salva/atualiza um carro   → { car }
 *   DELETE ?r=fincar&id=…         → exclui um carro
 *   POST   ?r=finexp  {expense}   → salva/atualiza uma despesa → { expense }
 *   DELETE ?r=finexp&id=…         → exclui uma despesa
 */
declare(strict_types=1);
if (!defined('DF_VERSION')) { http_response_code(404); exit; } // só funciona via api/index.php

const FIN_GASTO_TIPOS = ['Documentação', 'Preparação', 'Estética', 'Comissão', 'Frete', 'Outros'];
const FIN_DESP_CATS = ['Aluguel', 'Salários', 'Anúncios', 'Contador', 'Água/Luz/Internet', 'Impostos', 'Outros'];

function finDb(): PDO
{
    static $ready = false;
    $pdo = db();
    if ($ready) return $pdo;
    $ready = true;
    $pdo->exec('CREATE TABLE IF NOT EXISTS fin_cars (id TEXT PRIMARY KEY, data TEXT NOT NULL, sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS fin_expenses (id TEXT PRIMARY KEY, data TEXT NOT NULL, dt TEXT NOT NULL, created_at TEXT NOT NULL)');
    return $pdo;
}

function finMoney(mixed $v): ?float { $n = numOrNull($v); return $n === null ? null : round($n, 2); }
function finDate(mixed $v): ?string
{
    $s = (string)($v ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) return null;
    [$y, $m, $d] = array_map('intval', explode('-', $s));
    return checkdate($m, $d, $y) ? $s : null;
}
function finId(mixed $v): string { $s = (string)($v ?? ''); return preg_match('/^[a-z0-9]{6,40}$/i', $s) ? $s : uid(); }

function finListCars(): array
{
    $rows = finDb()->query('SELECT data FROM fin_cars ORDER BY created_at DESC')->fetchAll();
    return array_map(fn($r) => json_decode($r['data'], true), $rows);
}
function finListExpenses(): array
{
    $rows = finDb()->query('SELECT data FROM fin_expenses ORDER BY dt DESC, created_at DESC')->fetchAll();
    return array_map(fn($r) => json_decode($r['data'], true), $rows);
}

/* $strict = false (restauração de backup): devolve null em vez de responder erro e encerrar */
function finCleanCar(array $in, ?array $prev, string $user, bool $strict = true): ?array
{
    $bad = function (string $msg) use ($strict): void { if ($strict) fail(422, $msg); };
    $modelo = str($in['modelo'] ?? '', 120);
    if (mb_strlen($modelo) < 2) { $bad('Informe o veículo (marca e modelo).'); return null; }
    $placa = substr(preg_replace('/[^A-Z0-9]/', '', strtoupper((string)($in['placa'] ?? ''))), 0, 7);
    $compraData = finDate($in['compraData'] ?? null);
    if (!$compraData) { $bad('Informe a data da compra.'); return null; }
    $compraValor = finMoney($in['compraValor'] ?? null);
    if ($compraValor === null) { $bad('Informe o valor pago no carro.'); return null; }

    $gastos = [];
    foreach (array_slice((array)($in['gastos'] ?? []), 0, 200) as $g) {
        if (!is_array($g)) continue;
        $valor = finMoney($g['valor'] ?? null);
        if ($valor === null || $valor == 0.0) continue;
        $gastos[] = [
            'id' => finId($g['id'] ?? null),
            'data' => finDate($g['data'] ?? null) ?? $compraData,
            'tipo' => in_array($g['tipo'] ?? '', FIN_GASTO_TIPOS, true) ? $g['tipo'] : 'Outros',
            'desc' => str($g['desc'] ?? '', 160),
            'valor' => $valor,
        ];
    }

    $vendaData = finDate($in['vendaData'] ?? null);
    $vendaValor = finMoney($in['vendaValor'] ?? null);
    if (($vendaData === null) !== ($vendaValor === null)) { $bad('Para registrar a venda, informe a data e o valor de venda.'); return null; }

    return [
        'id' => $prev['id'] ?? finId($in['id'] ?? null),
        'modelo' => $modelo, 'placa' => $placa,
        'ano' => str($in['ano'] ?? '', 12), 'cor' => str($in['cor'] ?? '', 40),
        'vehicleId' => preg_match('/^[a-z0-9-]{3,60}$/i', (string)($in['vehicleId'] ?? '')) ? $in['vehicleId'] : null,
        'compraData' => $compraData, 'compraValor' => $compraValor, 'fornecedor' => str($in['fornecedor'] ?? '', 120),
        'gastos' => $gastos,
        'vendaData' => $vendaData, 'vendaValor' => $vendaValor, 'comprador' => str($in['comprador'] ?? '', 120),
        'obs' => str($in['obs'] ?? '', 2000),
        'createdAt' => $prev['createdAt'] ?? now(), 'createdBy' => $prev['createdBy'] ?? $user,
        'updatedAt' => now(), 'updatedBy' => $user,
    ];
}
function finPutCar(array $c): void
{
    finDb()->prepare('INSERT INTO fin_cars (id, data, sold_at, created_at, updated_at) VALUES (:id, :d, :s, :c, :u)
                      ON CONFLICT(id) DO UPDATE SET data = :d, sold_at = :s, updated_at = :u')
        ->execute([':id' => $c['id'], ':d' => json_encode($c, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                   ':s' => $c['vendaData'], ':c' => $c['createdAt'], ':u' => $c['updatedAt']]);
}

function finCleanExpense(array $in, ?array $prev, string $user, bool $strict = true): ?array
{
    $bad = function (string $msg) use ($strict): void { if ($strict) fail(422, $msg); };
    $data = finDate($in['data'] ?? null);
    if (!$data) { $bad('Informe a data da despesa.'); return null; }
    $valor = finMoney($in['valor'] ?? null);
    if (!$valor) { $bad('Informe o valor da despesa.'); return null; }
    return [
        'id' => $prev['id'] ?? finId($in['id'] ?? null),
        'data' => $data, 'valor' => $valor,
        'categoria' => in_array($in['categoria'] ?? '', FIN_DESP_CATS, true) ? $in['categoria'] : 'Outros',
        'desc' => str($in['desc'] ?? '', 160),
        'createdAt' => $prev['createdAt'] ?? now(), 'createdBy' => $prev['createdBy'] ?? $user,
    ];
}
function finPutExpense(array $e): void
{
    finDb()->prepare('INSERT INTO fin_expenses (id, data, dt, created_at) VALUES (:id, :d, :dt, :c)
                      ON CONFLICT(id) DO UPDATE SET data = :d, dt = :dt')
        ->execute([':id' => $e['id'], ':d' => json_encode($e, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ':dt' => $e['data'], ':c' => $e['createdAt']]);
}

function finGet(string $table, string $id): ?array
{
    $st = finDb()->prepare("SELECT data FROM $table WHERE id = ?"); $st->execute([$id]);
    $r = $st->fetchColumn();
    return $r ? json_decode($r, true) : null;
}

/* Restaura a parte financeira de um backup (chamado dentro da transação do restore) */
function finRestore(array $b, string $user): void
{
    $prevOf = fn(array $x) => ['id' => finId($x['id']), 'createdAt' => str($x['createdAt'] ?? '', 40) ?: now(), 'createdBy' => str($x['createdBy'] ?? '', 40) ?: $user];
    foreach ((array)($b['finCars'] ?? []) as $c) {
        if (!is_array($c) || empty($c['id'])) continue;
        $clean = finCleanCar($c, $prevOf($c), $user, false);
        if ($clean) finPutCar($clean);
    }
    foreach ((array)($b['finExpenses'] ?? []) as $e) {
        if (!is_array($e) || empty($e['id'])) continue;
        $clean = finCleanExpense($e, $prevOf($e), $user, false);
        if ($clean) finPutExpense($clean);
    }
}

function finRoute(string $r, string $method): never
{
    $u = requireAuth();
    if ($r === 'fin') {
        if ($method !== 'GET') fail(405, 'Método não permitido.');
        out(['cars' => finListCars(), 'expenses' => finListExpenses()]);
    }
    $table = $r === 'fincar' ? 'fin_cars' : 'fin_expenses';
    if ($method === 'DELETE') {
        finDb()->prepare("DELETE FROM $table WHERE id = ?")->execute([(string)($_GET['id'] ?? '')]);
        out(['ok' => true]);
    }
    if ($method !== 'POST') fail(405, 'Método não permitido.');
    $b = body();
    if ($r === 'fincar') {
        $in = $b['car'] ?? null;
        if (!is_array($in)) fail(400, 'Dados do carro ausentes.');
        $prev = !empty($in['id']) ? finGet('fin_cars', (string)$in['id']) : null;
        $c = finCleanCar($in, $prev, $u);
        finPutCar($c);
        out(['car' => $c]);
    }
    $in = $b['expense'] ?? null;
    if (!is_array($in)) fail(400, 'Dados da despesa ausentes.');
    $prev = !empty($in['id']) ? finGet('fin_expenses', (string)$in['id']) : null;
    $e = finCleanExpense($in, $prev, $u);
    finPutExpense($e);
    out(['expense' => $e]);
}
