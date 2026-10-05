/* Da Frota Veículos — configuração e camada de dados compartilhada.
 *
 * Com o site hospedado (Hostinger), tudo fica no servidor: api/index.php + banco SQLite.
 * Sem servidor (abrindo os arquivos direto ou na prévia), o site continua funcionando
 * com os dados guardados só no navegador.
 */
(function () {
  "use strict";

  const DEFAULTS = {
    whatsapp: "5561986030907",
    instagram: "dafrotaveiculos",
    cidade: "Brasília – DF",
  };
  const API = "api/index.php";

  const SEED_VEHICLES = [
    {
      id: "porsche-cayenne", title: "Porsche Cayenne", brand: "Porsche", category: "SUV",
      year: null, mileage: null, price: null, transmission: "Automático", fuel: "Híbrido", color: "",
      description: "Um SUV de presença, conforto e performance para quem quer dirigir em outro nível.",
      coverImage: "img/porsche-cayenne.jpeg", gallery: ["img/porsche-cayenne.jpeg"],
      featured: true, status: "disponivel", createdAt: "2026-09-01T12:00:00.000Z",
    },
    {
      id: "bmw-serie-3", title: "BMW Série 3", brand: "BMW", category: "Sedã",
      year: null, mileage: null, price: null, transmission: "Automático", fuel: "Gasolina", color: "",
      description: "Design esportivo e tecnologia reunidos em um sedã feito para aproveitar cada trajeto.",
      coverImage: "img/bmw-serie-3.jpeg", gallery: ["img/bmw-serie-3.jpeg"],
      featured: false, status: "disponivel", createdAt: "2026-09-01T12:00:00.000Z",
    },
  ];

  const KEY = (k) => "dafrota:v2:" + k;
  function read(k, fallback) {
    try { const v = localStorage.getItem(KEY(k)); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function write(k, v) {
    try { localStorage.setItem(KEY(k), JSON.stringify(v)); return true; }
    catch (e) { console.warn("Falha ao salvar", k, e); return false; }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- Servidor ---------- */
  let online = false;           // true quando api/index.php responde
  let serverSettings = {};

  async function call(route, { method = "GET", body, query = "" } = {}) {
    const real = method === "PATCH" || method === "DELETE" ? "POST" : method;
    const url = `${API}?r=${route}${query ? "&" + query : ""}${real !== method ? "&m=" + method : ""}`;
    const opts = { method: real, credentials: "same-origin", headers: { Accept: "application/json" } };
    if (real !== "GET") { opts.headers["Content-Type"] = "application/json"; opts.headers["X-DF"] = "1"; opts.body = JSON.stringify(body || {}); }
    let r;
    try { r = await fetch(url, opts); }
    catch { const e = new Error("Sem conexão com o servidor. Confira a internet e tente de novo."); e.status = 0; throw e; }
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(data?.error || `Erro ${r.status}`); e.status = r.status; throw e; }
    return data;
  }

  const ready = (async () => {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
      const r = await fetch(`${API}?r=ping`, { signal: ctl.signal, headers: { Accept: "application/json" } });
      clearTimeout(t);
      const ct = r.headers.get("content-type") || "";
      if (r.ok && ct.includes("json") && (await r.json())?.ok) {
        online = true;
        serverSettings = (await call("settings")).settings || {};
      }
    } catch { online = false; }
    return online;
  })();

  const settings = () => (online ? { ...DEFAULTS, ...serverSettings } : { ...DEFAULTS, ...read("settings", {}) });
  async function saveSettings(s) {
    if (online) { serverSettings = (await call("settings", { method: "POST", body: s })).settings || serverSettings; return; }
    write("settings", { ...read("settings", {}), ...s });
  }

  /* ---------- Veículos ---------- */
  function localVehicles() {
    const v = read("vehicles", null);
    if (v) return v;
    write("vehicles", SEED_VEHICLES);
    return SEED_VEHICLES.slice();
  }
  async function getVehicles({ includeSold = false } = {}) {
    await ready;
    let list;
    if (online) {
      try { list = (await call("vehicles", { query: includeSold ? "all=1" : "" })).vehicles || []; }
      catch { list = []; }
    } else list = localVehicles();
    list.sort((a, b) => (b.featured - a.featured) || String(b.createdAt).localeCompare(String(a.createdAt)));
    return includeSold ? list : list.filter((v) => v.status !== "vendido");
  }
  async function saveVehicle(v) {
    if (online) return (await call("vehicles", { method: "POST", body: { vehicle: v } })).vehicle;
    const list = localVehicles();
    if (!v.id) { v.id = uid(); v.createdAt = new Date().toISOString(); }
    v.updatedAt = new Date().toISOString();
    const i = list.findIndex((x) => x.id === v.id);
    if (i >= 0) list[i] = v; else list.unshift(v);
    if (!write("vehicles", list)) throw new Error("Sem espaço para salvar. Use fotos menores ou remova veículos antigos.");
    return v;
  }
  async function deleteVehicle(id) {
    if (online) { await call("vehicles", { method: "DELETE", query: "id=" + encodeURIComponent(id) }); return; }
    write("vehicles", localVehicles().filter((v) => v.id !== id));
  }

  /* ---------- Leads ---------- */
  const localLeads = () => read("leads", []);
  // Envia um lead (formulário, chat ou ficha). Com servidor, nada fica guardado no aparelho do cliente.
  async function addLead(lead) {
    await ready;
    if (online) {
      try {
        const r = await call("leads", { method: "POST", body: { ...lead, website: lead.website || "" } });
        return { ...lead, id: r.id, delivered: true };
      } catch (e) { return { ...lead, delivered: false, error: e.message }; }
    }
    const full = { id: uid(), createdAt: new Date().toISOString(), status: "novo", notes: "", historico: [], ...lead };
    const list = localLeads(); list.unshift(full); write("leads", list);
    return { ...full, delivered: false };
  }
  async function getLeads() {
    await ready;
    const list = online ? (await call("leads")).leads || [] : localLeads();
    return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
  // patch: { status?, responsavel?, notes?, acao? } — "acao" entra no histórico
  async function updateLead(id, patch, me) {
    if (online) return (await call("leads", { method: "PATCH", query: "id=" + encodeURIComponent(id), body: patch })).lead;
    const list = localLeads(); const i = list.findIndex((l) => l.id === id);
    if (i < 0) return null;
    const l = { ...list[i] };
    if ("status" in patch) l.status = patch.status;
    if ("responsavel" in patch) l.responsavel = patch.responsavel;
    if ("notes" in patch) l.notes = patch.notes;
    if (patch.acao) l.historico = [...(l.historico || []), { u: me, a: patch.acao, t: new Date().toISOString() }].slice(-50);
    l.updatedAt = new Date().toISOString();
    list[i] = l; write("leads", list); return l;
  }
  async function deleteLead(id) {
    if (online) { await call("leads", { method: "DELETE", query: "id=" + encodeURIComponent(id) }); return; }
    write("leads", localLeads().filter((l) => l.id !== id));
  }

  /* ---------- Financeiro (só na Área do Consultor, exige login) ---------- */
  async function getFin() {
    await ready;
    if (online) { const r = await call("fin"); return { cars: r.cars || [], expenses: r.expenses || [] }; }
    return { cars: read("fin-cars", []), expenses: read("fin-expenses", []) };
  }
  function saveLocal(key, item) {
    const list = read(key, []);
    const now = new Date().toISOString();
    if (!item.id) { item.id = uid(); item.createdAt = now; }
    item.updatedAt = now;
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item; else list.unshift(item);
    if (!write(key, list)) throw new Error("Sem espaço para salvar neste navegador.");
    return item;
  }
  async function saveFinCar(car) {
    if (online) return (await call("fincar", { method: "POST", body: { car } })).car;
    return saveLocal("fin-cars", { ...car });
  }
  async function deleteFinCar(id) {
    if (online) { await call("fincar", { method: "DELETE", query: "id=" + encodeURIComponent(id) }); return; }
    write("fin-cars", read("fin-cars", []).filter((c) => c.id !== id));
  }
  async function saveFinExpense(expense) {
    if (online) return (await call("finexp", { method: "POST", body: { expense } })).expense;
    return saveLocal("fin-expenses", { ...expense });
  }
  async function deleteFinExpense(id) {
    if (online) { await call("finexp", { method: "DELETE", query: "id=" + encodeURIComponent(id) }); return; }
    write("fin-expenses", read("fin-expenses", []).filter((e) => e.id !== id));
  }

  /* ---------- Financiamento (Tabela Price) ---------- */
  function pmt(principal, taxaMensalPct, n) {
    const i = taxaMensalPct / 100;
    if (principal <= 0 || n <= 0) return 0;
    if (i === 0) return principal / n;
    return (principal * i) / (1 - Math.pow(1 + i, -n));
  }
  const taxaAnual = (m) => (Math.pow(1 + m / 100, 12) - 1) * 100;

  /* ---------- Utilidades ---------- */
  const brl = (n, dec = 0) => (n == null || isNaN(n)) ? "" :
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: dec, maximumFractionDigits: dec });
  const num = (s) => { if (typeof s === "number") return s; const d = String(s || "").replace(/[^\d,]/g, "").replace(",", "."); return d ? parseFloat(d) : 0; };
  const wa = (text, phone) => `https://wa.me/${phone || settings().whatsapp}?text=${encodeURIComponent(text)}`;
  const maskPhone = (v) => {
    const d = String(v).replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d ? "(" + d : "";
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };
  const maskCPF = (v) => String(v).replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  function validCPF(v) {
    const c = String(v).replace(/\D/g, "");
    if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
    let d1 = (s * 10) % 11; if (d1 === 10) d1 = 0; if (d1 !== +c[9]) return false;
    s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
    let d2 = (s * 10) % 11; if (d2 === 10) d2 = 0; return d2 === +c[10];
  }
  const maskMoney = (v) => { const d = String(v).replace(/\D/g, ""); return d ? Number(d).toLocaleString("pt-BR") : ""; };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));


  /* ---------- Ficha de financiamento: texto do WhatsApp (ida e volta) ---------- */
  function fichaTexto(f) {
    const d = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "");
    const L = [
      "*FICHA DE FINANCIAMENTO — site Da Frota*", "§",
      "*Dados pessoais*", `Nome: ${f.nome}`, `CPF: ${f.cpf}`, `Nascimento: ${d(f.nascimento)}`, f.rg && `RG: ${f.rg}`,
      `Estado civil: ${f.estadoCivil}`, `Mãe: ${f.mae}`, `WhatsApp: ${f.whatsapp}`, f.email && `E-mail: ${f.email}`, `CNH: ${f.cnh}`, "§",
      "*Endereço*", `${f.endereco}, ${f.numero}${f.complemento ? " – " + f.complemento : ""}`, `${f.bairro} – ${f.cidade}`, `CEP: ${f.cep}`,
      `Moradia: ${f.moradia}${f.tempoResidencia ? " (" + f.tempoResidencia + ")" : ""}`, "§",
      "*Renda*", `Ocupação: ${f.ocupacao}`, f.empresa && `Empresa: ${f.empresa}`, f.cargo && `Cargo: ${f.cargo}`, f.tempoEmprego && `Tempo no trabalho: ${f.tempoEmprego}`,
      `Renda mensal: ${brl(f.renda)}`, f.outraRenda && `Outras rendas: ${brl(f.outraRenda)}`, "§",
      "*Veículo*", `Interesse: ${f.veiculo}`, f.valorVeiculo && `Valor: ${brl(f.valorVeiculo)}`, f.entrada && `Entrada: ${brl(f.entrada)}`,
      f.prazo && `Prazo: ${f.prazo}`, `Troca: ${f.troca === "Sim" ? f.trocaModelo || "sim" : "não"}`, f.obs && `Obs.: ${f.obs}`,
    ];
    return L.filter(Boolean).map((x) => (x === "§" ? "" : x)).join("\n");
  }


  // Lê de volta uma ficha colada do WhatsApp (formato gerado por fichaTexto)
  function parseFicha(text) {
    const t = String(text || "").replace(/\*/g, "").replace(/\r/g, "");
    const get = (label) => { const m = t.match(new RegExp("^\\s*" + label + ":\\s*(.+)$", "mi")); return m ? m[1].trim() : ""; };
    const money = (s) => (s ? num(s.replace(/R\$\s?/, "").replace(/\./g, "")) : null);
    const nascBR = get("Nascimento"); const nm = nascBR.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    const lines = t.split("\n").map((x) => x.trim());
    const iEnd = lines.findIndex((x) => /^Endereço$/i.test(x));
    let endereco = "", numero = "", complemento = "", bairro = "", cidade = "";
    if (iEnd >= 0) {
      const l1 = lines[iEnd + 1] || "", l2 = lines[iEnd + 2] || "";
      const m1 = l1.match(/^(.*),\s*([^,–]+?)(?:\s*–\s*(.+))?$/); if (m1) { endereco = m1[1]; numero = m1[2]; complemento = m1[3] || ""; } else endereco = l1;
      const m2 = l2.split(" – "); bairro = m2[0] || ""; cidade = m2.slice(1).join(" – ");
    }
    const mor = get("Moradia").match(/^([^(]+?)(?:\s*\((.+)\))?$/) || [];
    const troca = get("Troca");
    const f = {
      nome: get("Nome"), cpf: get("CPF"), nascimento: nm ? `${nm[3]}-${nm[2]}-${nm[1]}` : "", rg: get("RG"), estadoCivil: get("Estado civil"),
      mae: get("Mãe"), whatsapp: get("WhatsApp"), email: get("E-mail"), cnh: get("CNH"),
      cep: get("CEP"), endereco, numero, complemento, bairro, cidade, moradia: (mor[1] || "").trim(), tempoResidencia: mor[2] || "",
      ocupacao: get("Ocupação"), empresa: get("Empresa"), cargo: get("Cargo"), tempoEmprego: get("Tempo no trabalho"),
      renda: money(get("Renda mensal")), outraRenda: money(get("Outras rendas")),
      veiculo: get("Interesse"), valorVeiculo: money(get("Valor")), entrada: money(get("Entrada")), prazo: get("Prazo"),
      troca: /^n[ãa]o$/i.test(troca) || !troca ? "Não" : "Sim", trocaModelo: /^(n[ãa]o|sim)$/i.test(troca) ? "" : troca, obs: get("Obs\\."),
    };
    return f.nome && (f.cpf || f.whatsapp) ? f : null;
  }

  function toast(msg, type = "") {
    let stack = document.querySelector(".toast-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; stack.setAttribute("role", "status"); document.body.appendChild(stack); }
    const t = document.createElement("div"); t.className = "toast " + type; t.textContent = msg; stack.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, 3600);
  }

  window.DF = {
    DEFAULTS, ready, isOnline: () => online, call, settings, saveSettings,
    read, write, uid,
    getVehicles, saveVehicle, deleteVehicle, localVehicles,
    addLead, getLeads, updateLead, deleteLead,
    getFin, saveFinCar, deleteFinCar, saveFinExpense, deleteFinExpense,
    pmt, taxaAnual, fichaTexto, parseFicha, brl, num, wa, maskPhone, maskCPF, validCPF, maskMoney, esc, toast,
  };
})();
