/* Da Frota Veículos — Área do Consultor */
window.DF.ready.then(function () {
  "use strict";
  const DF = window.DF;
  const { settings, saveSettings, getVehicles, saveVehicle, deleteVehicle, getLeads, updateLead, deleteLead, brl, num, maskMoney, maskPhone, esc, toast, read, write } = DF;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  const STATUS = [
    ["novo", "Novo"], ["contato", "Em contato"], ["negociacao", "Negociação"], ["vendido", "Vendido"], ["perdido", "Perdido"],
  ];
  const STATUS_LABEL = Object.fromEntries(STATUS);
  const SOURCE_LABEL = { ficha: "Ficha de financiamento", formulario: "Formulário", assistente: "Chat do site", whatsapp: "WhatsApp", site: "Site" };
  const V_STATUS = [["disponivel", "Disponível"], ["reservado", "Reservado"], ["vendido", "Vendido"]];
  const CATS = ["SUV", "Sedã", "Hatch", "Picape", "Outros"];

  /* =========================================================
     Autenticação (uma senha por consultor, guardada como hash SHA-256)
     ========================================================= */
  const SESSION_KEY = "df-consultor-session";
  async function hash(text) {
    const data = new TextEncoder().encode("dafrota::" + text);
    if (window.crypto?.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    }
    let h = 5381; for (const b of data) h = ((h << 5) + h + b) | 0; return "f" + (h >>> 0).toString(16);
  }
  // Contas da equipe. Para incluir alguém, acrescente uma linha aqui.
  const USERS = [
    { id: "murilo", name: "Murilo Gabriel" },
    { id: "emerson", name: "Emerson Da Frota" },
  ];
  const userName = (id) => USERS.find((u) => u.id === id)?.name || id || "";
  const hashes = () => read("users", {});
  const hashOf = (id) => hashes()[id] || null;
  let me = null; // consultor logado
  const ONLINE = DF.isOnline();

  function readSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      return s && USERS.some((u) => u.id === s.u) && s.h === hashOf(s.u) && s.exp > Date.now() ? s.u : null;
    } catch { return null; }
  }
  function startLocalSession(id) {
    me = id;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ u: id, h: hashOf(id), exp: Date.now() + 8 * 3600e3 })); } catch {}
  }

  /* Com servidor (Hostinger) o login é feito em api/index.php; sem servidor, fica no navegador. */
  let serverUsers = {};
  const Auth = {
    async current() {
      if (!ONLINE) return readSession();
      const r = await DF.call("me");
      serverUsers = Object.fromEntries((r.users || []).map((u) => [u.id, u]));
      return r.user;
    },
    hasPassword: (id) => (ONLINE ? !!serverUsers[id]?.hasPassword : !!hashOf(id)),
    async login(id, pass, pass2, code) {
      if (ONLINE) { await DF.call("login", { method: "POST", body: { user: id, password: pass, password2: pass2, code } }); me = id; return; }
      if (!hashOf(id)) {
        if (pass.length < 8) throw new Error("Use pelo menos 8 caracteres.");
        if (pass !== pass2) throw new Error("As senhas não conferem.");
        write("users", { ...hashes(), [id]: await hash(id + "::" + pass) });
      } else if ((await hash(id + "::" + pass)) !== hashOf(id)) { const e = new Error("Senha incorreta."); e.status = 401; throw e; }
      startLocalSession(id);
    },
    async logout() {
      if (ONLINE) { try { await DF.call("logout", { method: "POST" }); } catch {} }
      try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    },
    async changePassword(old, nova) {
      if (ONLINE) { await DF.call("password", { method: "POST", body: { old, new: nova } }); return; }
      if ((await hash(me + "::" + old)) !== hashOf(me)) throw new Error("Senha atual incorreta.");
      write("users", { ...hashes(), [me]: await hash(me + "::" + nova) }); startLocalSession(me);
    },
    async reset(id) {
      if (ONLINE) { await DF.call("reset", { method: "POST", body: { user: id } }); return; }
      const h = hashes(); delete h[id]; write("users", h);
    },
  };

  const login = $("#login"), app = $("#app");
  let pick = null;
  $("#user-pick").innerHTML = USERS.map((u) => `<button type="button" class="chip" data-user="${u.id}" aria-pressed="false">${esc(u.name)}</button>`).join("");
  function selectUser(id) {
    pick = id;
    $$("#user-pick [data-user]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.user === id));
    const first = !Auth.hasPassword(id);
    $("#pass-field").hidden = false;
    $("#login-title").textContent = first ? "Primeiro acesso" : "Entrar";
    $("#login-sub").textContent = first
      ? `${userName(id).split(" ")[0]}, crie sua senha pessoal (mínimo 8 caracteres).`
      : `Olá, ${userName(id).split(" ")[0]}! Digite sua senha.`;
    $("#pass2-field").hidden = !first;
    $("#code-field").hidden = !(first && ONLINE);
    $("#login-btn").textContent = first ? "Criar senha e entrar" : "Entrar";
    $("#pass").autocomplete = first ? "new-password" : "current-password";
    $("#pass").value = ""; $("#pass2").value = ""; $("#login-error").textContent = "";
    $("#pass").focus();
    try { localStorage.setItem("df-last-user", id); } catch {}
  }
  $("#user-pick").addEventListener("click", (e) => { const b = e.target.closest("[data-user]"); if (b) selectUser(b.dataset.user); });
  function showLogin() {
    login.hidden = false; app.hidden = true;
    let last = null; try { last = localStorage.getItem("df-last-user"); } catch {}
    if (USERS.some((u) => u.id === last)) selectUser(last);
  }
  $("#show-pass").addEventListener("click", (e) => {
    const p = $("#pass"); const show = p.type === "password"; p.type = show ? "text" : "password"; $("#pass2").type = p.type;
    e.target.textContent = show ? "Ocultar" : "Mostrar";
  });
  let fails = 0, lockUntil = 0;
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error"); err.textContent = "";
    if (!pick) { err.textContent = "Escolha quem está entrando."; return; }
    if (Date.now() < lockUntil) { err.textContent = `Muitas tentativas. Aguarde ${Math.ceil((lockUntil - Date.now()) / 1000)} s.`; return; }
    const first = !Auth.hasPassword(pick);
    const btn = $("#login-btn"); btn.disabled = true;
    try {
      await Auth.login(pick, $("#pass").value, $("#pass2").value, $("#code")?.value || "");
      fails = 0; me = pick; enter();
      if (first) toast(`Senha criada. Bem-vindo, ${userName(pick).split(" ")[0]}!`, "ok");
    } catch (ex) {
      if (ex.status === 401) { fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; } }
      err.textContent = ex.message;
      const f = $("#pass").closest(".field"); f.classList.remove("invalid"); void f.offsetWidth; f.classList.add("invalid");
    } finally { btn.disabled = false; }
  });
  $("#logout").addEventListener("click", async () => { await Auth.logout(); location.hash = ""; location.reload(); });

  /* =========================================================
     Estrutura e navegação
     ========================================================= */
  let leads = [], vehicles = [], view = "painel", openLeadId = null;
  const VIEWS = { painel: "Painel", leads: "Leads", financiamento: "Fichas de financiamento", estoque: "Estoque", financeiro: "Financeiro", config: "Configurações" };

  async function load() {
    try { [leads, vehicles] = await Promise.all([getLeads(), getVehicles({ includeSold: true })]); }
    catch (e) { if (e.status === 401) { toast("Sua sessão expirou. Entre de novo.", "err"); setTimeout(() => location.reload(), 1200); } else toast(e.message, "err"); }
    updateBadge();
  }
  const fail = (e) => { if (e?.status === 401) { toast("Sua sessão expirou. Entre de novo.", "err"); setTimeout(() => location.reload(), 1200); } else toast(e?.message || "Não deu certo. Tente de novo.", "err"); };
  // Atualiza um lead no servidor/navegador e troca a cópia da lista
  async function patchLead(id, patch) {
    try { const l = await updateLead(id, patch, me); const i = leads.findIndex((x) => x.id === id); if (l && i >= 0) leads[i] = l; return l; }
    catch (e) { fail(e); return null; }
  }
  function updateBadge() { const n = leads.filter((l) => l.status === "novo").length; const b = $("#badge-leads"); b.hidden = !n; b.textContent = n; }

  async function enter() {
    login.hidden = true; app.hidden = false;
    $("#today").textContent = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    $("#me-name").textContent = userName(me);
    $("#me-avatar").textContent = userName(me).split(" ").map((w) => w[0]).slice(0, 2).join("");
    await load();
    const h = location.hash.slice(1);
    go(VIEWS[h] ? h : "painel");
  }
  function go(v) {
    view = v;
    $$(".side-link[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    $("#view-title").textContent = VIEWS[v];
    if (location.hash.slice(1) !== v) history.replaceState(null, "", "#" + v);
    document.body.classList.remove("side-open"); $(".scrim")?.remove();
    render();
    scrollTo(0, 0);
  }
  function render() {
    const el = $("#view");
    el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    ({ painel: renderPainel, leads: renderLeads, financiamento: renderFichas, estoque: renderEstoque, financeiro: renderFinanceiro, config: renderConfig })[view](el);
  }
  $$(".side-link[data-view]").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  $("#top-new").addEventListener("click", () => openDrawer());
  $("#side-toggle").addEventListener("click", () => {
    document.body.classList.add("side-open");
    const s = document.createElement("div"); s.className = "scrim"; s.onclick = () => { document.body.classList.remove("side-open"); s.remove(); }; document.body.appendChild(s);
  });

  /* ---------- Utilidades de exibição ---------- */
  const fmtDate = (iso, withTime = true) => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + (withTime ? " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""); };
  const ago = (iso) => {
    const m = Math.round((Date.now() - new Date(iso)) / 60000);
    if (m < 1) return "agora"; if (m < 60) return `há ${m} min`; const h = Math.round(m / 60); if (h < 24) return `há ${h} h`; const d = Math.round(h / 24); return d < 7 ? `há ${d} d` : fmtDate(iso, false);
  };
  const pill = (s, map = STATUS_LABEL) => `<span class="pill s-${s}">${esc(map[s] || s)}</span>`;
  const phoneLink = (l, text) => `https://wa.me/55${String(l.phone || "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "")}?text=${encodeURIComponent(text || `Olá, ${(l.name || "").split(" ")[0]}! Aqui é da Da Frota Veículos.`)}`;
  const within = (iso, days) => Date.now() - new Date(iso) < days * 864e5;
  const pct = (n, d = 1) => (n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: d }) + "%";
  function countUp(el) {
    const to = +el.dataset.to, fmt = el.dataset.fmt === "brl" ? (v) => brl(v) : (v) => Math.round(v).toLocaleString("pt-BR");
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / 900); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  function compClass(c) { return c == null ? "" : c <= 30 ? "comp-ok" : c <= 40 ? "comp-warn" : "comp-bad"; }

  /* =========================================================
     Painel
     ========================================================= */
  function renderPainel(el) {
    const novos = leads.filter((l) => l.status === "novo").length;
    const semana = leads.filter((l) => within(l.createdAt, 7)).length;
    const sims = leads.filter((l) => l.ficha && within(l.createdAt, 30)).length;
    const disp = vehicles.filter((v) => v.status !== "vendido");
    const valor = disp.reduce((s, v) => s + (+v.price || 0), 0);
    const kpis = [
      ["Leads novos", novos, "aguardando primeiro contato", true],
      ["Leads em 7 dias", semana, `${leads.length} no total`],
      ["Fichas (30 dias)", sims, "pedidos de financiamento"],
      ["Veículos à venda", disp.length, `${vehicles.filter((v) => v.status === "reservado").length} reservados`],
      ["Valor em estoque", valor, disp.some((v) => !v.price) ? "alguns sem preço cadastrado" : "soma dos preços", false, "brl"],
    ];
    const recent = leads.slice(0, 6);
    const maxF = Math.max(1, ...STATUS.map(([s]) => leads.filter((l) => l.status === s).length));
    const colors = { novo: "var(--orange-light)", contato: "#7cc4ff", negociacao: "var(--warn)", vendido: "var(--ok)", perdido: "var(--muted)" };
    const sources = Object.entries(leads.reduce((a, l) => ((a[l.source || "site"] = (a[l.source || "site"] || 0) + 1), a), {}));
    const maxS = Math.max(1, ...sources.map(([, n]) => n));

    el.innerHTML = `
      <div class="kpis">${kpis.map(([k, v, s, hot, fmt], i) => `<div class="kpi${hot && v ? " hot" : ""}" style="animation-delay:${i * 60}ms"><span>${k}</span><strong data-to="${v}" data-fmt="${fmt || ""}">0</strong><small>${s}</small></div>`).join("")}</div>
      <div class="two-col">
        <section class="panel">
          <div class="panel-head"><h2>Últimos leads</h2><button class="mini-btn" data-go="leads">Ver todos →</button></div>
          ${recent.length ? `<div class="lead-list">${recent.map((l, i) => leadRow(l, i)).join("")}</div>` :
            `<div class="empty">Ainda não há leads.<br>Eles aparecem aqui quando alguém usa o formulário, o chat ou a ficha de financiamento do site.</div>`}
        </section>
        <div style="display:grid;gap:20px">
          <section class="panel">
            <div class="panel-head"><h2>Funil de vendas</h2></div>
            <div class="panel-body funnel">${STATUS.map(([s, label]) => { const n = leads.filter((l) => l.status === s).length; return `<div class="funnel-row"><span>${label}</span><span class="track"><i data-w="${(n / maxF) * 100}" style="background:${colors[s]}"></i></span><b>${n}</b></div>`; }).join("")}</div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Por consultor</h2></div>
            <div class="panel-body funnel">${[...USERS.map((u) => [u.name, leads.filter((l) => l.responsavel === u.id && !["vendido", "perdido"].includes(l.status)).length, leads.filter((l) => l.responsavel === u.id && l.status === "vendido").length]), ["Sem responsável", leads.filter((l) => !l.responsavel).length, null]].map(([n, a, v]) => `<div class="funnel-row"><span>${esc(n.split(" ")[0])}</span><span class="src">${a} em aberto${v != null ? ` · ${v} vendido${v === 1 ? "" : "s"}` : ""}</span><b></b></div>`).join("")}</div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Origem dos leads</h2></div>
            <div class="panel-body funnel">${sources.length ? sources.map(([s, n]) => `<div class="funnel-row"><span>${esc(SOURCE_LABEL[s] || s)}</span><span class="track"><i data-w="${(n / maxS) * 100}" style="background:var(--orange)"></i></span><b>${n}</b></div>`).join("") : `<p class="src" style="margin:0">Sem dados ainda.</p>`}</div>
          </section>
        </div>
      </div>`;
    $$("[data-to]", el).forEach(countUp);
    requestAnimationFrame(() => setTimeout(() => $$("[data-w]", el).forEach((i) => (i.style.width = i.dataset.w + "%")), 60));
    $$("[data-go]", el).forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
    $$(".lead-row", el).forEach((r) => r.addEventListener("click", () => { openLeadId = r.dataset.id; go("leads"); }));
  }

  /* =========================================================
     Leads
     ========================================================= */
  const lf = { q: "", status: "", source: "", owner: "" };
  function leadRow(l, i = 0) {
    return `<div class="lead-row${openLeadId === l.id ? " open" : ""}" data-id="${esc(l.id)}" style="animation-delay:${Math.min(i, 12) * 35}ms" tabindex="0" role="button" aria-expanded="${openLeadId === l.id}">
      <div style="min-width:0"><div class="name">${esc(l.name || "Sem nome")}</div><div class="sub">${esc(l.phone || "")} · <span class="src">${esc(SOURCE_LABEL[l.source] || l.source || "Site")}</span>${l.responsavel ? ` · <span class="owner">${esc(userName(l.responsavel).split(" ")[0])}</span>` : ""}</div></div>
      <div class="sub hide-sm">${esc(l.vehicle || l.message || "—")}</div>
      ${pill(l.status || "novo")}
      <time class="hide-sm" datetime="${esc(l.createdAt)}">${ago(l.createdAt)}</time>
    </div>`;
  }
  const dmy = (iso) => (iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR") : "");
  function fichaSections(f) {
    return [
      ["Dados pessoais", [["Nome", f.nome], ["CPF", f.cpf], ["Nascimento", dmy(f.nascimento)], ["RG", f.rg], ["Estado civil", f.estadoCivil], ["Mãe", f.mae], ["WhatsApp", f.whatsapp], ["E-mail", f.email], ["CNH", f.cnh]]],
      ["Endereço", [["Endereço", [f.endereco, f.numero].filter(Boolean).join(", ") + (f.complemento ? " – " + f.complemento : "")], ["Bairro", f.bairro], ["Cidade / UF", f.cidade], ["CEP", f.cep], ["Moradia", f.moradia], ["Tempo no endereço", f.tempoResidencia]]],
      ["Trabalho e renda", [["Ocupação", f.ocupacao], ["Empresa", f.empresa], ["Cargo", f.cargo], ["Tempo no trabalho", f.tempoEmprego], ["Renda mensal", f.renda ? brl(f.renda) : ""], ["Outras rendas", f.outraRenda ? brl(f.outraRenda) : ""]]],
      ["Veículo", [["Interesse", f.veiculo], ["Valor", f.valorVeiculo ? brl(f.valorVeiculo) : ""], ["Entrada", f.entrada ? brl(f.entrada) : ""], ["Prazo", f.prazo], ["Troca", f.troca === "Sim" ? (f.trocaModelo || "Sim") : "Não"], ["Observações", f.obs]]],
    ].map(([t, rows]) => [t, rows.filter(([, v]) => v)]);
  }
  function leadDetail(l) {
    const rows = [
      ["WhatsApp", l.phone], ["E-mail", l.email], ["Veículo", l.vehicle], ["Origem", SOURCE_LABEL[l.source] || l.source], ["Recebido em", fmtDate(l.createdAt)], ["Mensagem", l.message],
    ].filter(([, v]) => v);
    const dl = (arr) => `<dl class="detail-grid">${arr.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>`;
    return `<div class="lead-detail" data-detail="${esc(l.id)}">
      ${l.ficha ? fichaSections(l.ficha).map(([t, r]) => `<div><p class="compare-title">${t}</p>${dl(r)}</div>`).join("") : dl(rows)}
      <div class="owner-row"><p class="compare-title" style="margin:0">Consultor responsável</p>
        <div class="status-steps">${USERS.map((u) => `<button type="button" data-owner="${u.id}" aria-pressed="${l.responsavel === u.id}">${esc(u.name)}</button>`).join("")}</div>
        ${l.historico?.length ? `<ul class="history">${l.historico.slice(-4).reverse().map((h) => `<li><b>${esc(userName(h.u).split(" ")[0])}</b> ${esc(h.a)} <time>${fmtDate(h.t)}</time></li>`).join("")}</ul>` : ""}
      </div>
      <div><p class="compare-title">Status</p><div class="status-steps">${STATUS.map(([k, lab]) => `<button type="button" class="s-${k}" data-status="${k}" aria-pressed="${(l.status || "novo") === k}">${lab}</button>`).join("")}</div></div>
      <label class="field"><span>Anotações do consultor</span><textarea data-notes rows="3" placeholder="Ex.: aprovado no banco X com 40% de entrada…">${esc(l.notes || "")}</textarea></label>
      <div class="row-actions">
        <a class="button button-small" href="${phoneLink(l)}" target="_blank" rel="noreferrer">Responder no WhatsApp ↗</a>
        ${l.ficha ? `<button class="mini-btn" type="button" data-copy-ficha>Copiar ficha</button>` : ""}
        <button class="mini-btn" type="button" data-copy="${esc(l.phone || "")}">Copiar telefone</button>
        <button class="btn-danger" type="button" data-del-lead>Excluir</button>
      </div>
    </div>`;
  }
  function filteredLeads() {
    const q = lf.q.toLowerCase();
    return leads.filter((l) => (!lf.status || (l.status || "novo") === lf.status) && (!lf.source || l.source === lf.source) &&
      (!lf.owner || (lf.owner === "sem" ? !l.responsavel : l.responsavel === lf.owner)) &&
      (!q || [l.name, l.phone, l.vehicle, l.message, l.email].join(" ").toLowerCase().includes(q)));
  }
  function renderLeads(el) {
    el.innerHTML = `<section class="panel">
      <div class="panel-head">
        <div class="toolbar" style="flex:1">
          <input class="input" id="lq" type="search" placeholder="Buscar por nome, telefone ou veículo" value="${esc(lf.q)}" aria-label="Buscar leads">
          <select class="input" id="ls" aria-label="Filtrar por status"><option value="">Todos os status</option>${STATUS.map(([k, v]) => `<option value="${k}"${lf.status === k ? " selected" : ""}>${v}</option>`).join("")}</select>
          <select class="input" id="lw" aria-label="Filtrar por consultor"><option value="">Todos os consultores</option>${USERS.map((u) => `<option value="${u.id}"${lf.owner === u.id ? " selected" : ""}>${esc(u.name)}</option>`).join("")}<option value="sem"${lf.owner === "sem" ? " selected" : ""}>Sem responsável</option></select>
          <select class="input" id="lo" aria-label="Filtrar por origem"><option value="">Todas as origens</option>${Object.entries(SOURCE_LABEL).slice(0, 4).map(([k, v]) => `<option value="${k}"${lf.source === k ? " selected" : ""}>${v}</option>`).join("")}</select>
        </div>
        <button class="mini-btn" id="csv">Exportar CSV</button>
      </div>
      <div class="lead-list" id="lead-list"></div>
    </section>`;
    paintLeadList();
    $("#lq").addEventListener("input", (e) => { lf.q = e.target.value; paintLeadList(); });
    $("#ls").addEventListener("change", (e) => { lf.status = e.target.value; paintLeadList(); });
    $("#lo").addEventListener("change", (e) => { lf.source = e.target.value; paintLeadList(); });
    $("#lw").addEventListener("change", (e) => { lf.owner = e.target.value; paintLeadList(); });
    $("#csv").addEventListener("click", exportCSV);
  }
  function paintLeadList() {
    const box = $("#lead-list"), list = filteredLeads();
    box.innerHTML = list.length ? list.map((l, i) => leadRow(l, i) + (openLeadId === l.id ? leadDetail(l) : "")).join("")
      : `<div class="empty">${leads.length ? "Nenhum lead com esses filtros." : "Nenhum lead ainda. Teste o formulário ou a ficha de financiamento do site para ver como chegam aqui."}</div>`;
    const open = $(".lead-detail", box); if (open) open.previousElementSibling?.scrollIntoView({ block: "nearest" });
  }
  document.addEventListener("click", async (e) => {
    if (view !== "leads" && view !== "painel") return;
    const row = e.target.closest("#lead-list .lead-row");
    if (row) { openLeadId = openLeadId === row.dataset.id ? null : row.dataset.id; paintLeadList(); return; }
    const det = e.target.closest(".lead-detail"); if (!det) return;
    const id = det.dataset.detail;
    const sb = e.target.closest("[data-status]");
    if (sb) {
      const l = leads.find((x) => x.id === id), st = sb.dataset.status;
      const patch = { status: st, acao: `mudou para ${STATUS_LABEL[st]}` };
      if (!l.responsavel) patch.responsavel = me;
      if (await patchLead(id, patch)) { paintLeadList(); updateBadge(); toast(`Status: ${STATUS_LABEL[st]}`, "ok"); }
      return;
    }
    if (e.target.closest("[data-copy-ficha]")) {
      const l = leads.find((x) => x.id === id);
      const txt = DF.fichaTexto(l.ficha).replace(/\*/g, "");
      try { await navigator.clipboard.writeText(txt); toast("Ficha copiada. É só colar no sistema do banco.", "ok"); }
      catch { toast("Não consegui copiar automaticamente neste navegador.", "err"); }
      return;
    }
    const ob = e.target.closest("[data-owner]");
    if (ob) {
      const who = ob.dataset.owner;
      if (await patchLead(id, { responsavel: who, acao: `passou para ${userName(who).split(" ")[0]}` })) { paintLeadList(); toast(`Lead com ${userName(who)}.`, "ok"); }
      return;
    }
    const cp = e.target.closest("[data-copy]");
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); toast("Telefone copiado.", "ok"); } catch { toast(cp.dataset.copy); } }
    const del = e.target.closest("[data-del-lead]");
    if (del) {
      del.outerHTML = `<span class="confirm-inline">Excluir este lead? <button class="btn-danger" type="button" data-del-yes>Sim, excluir</button><button class="mini-btn" type="button" data-del-no>Cancelar</button></span>`;
    }
    if (e.target.closest("[data-del-yes]")) {
      try { await deleteLead(id); leads = leads.filter((l) => l.id !== id); openLeadId = null; updateBadge(); paintLeadList(); toast("Lead excluído."); } catch (ex) { fail(ex); }
    }
    if (e.target.closest("[data-del-no]")) paintLeadList();
  });
  document.addEventListener("keydown", (e) => {
    const row = e.target.closest?.(".lead-row"); if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); row.click(); }
  });
  document.addEventListener("change", async (e) => {
    if (!e.target.matches("[data-notes]")) return;
    const id = e.target.closest(".lead-detail").dataset.detail;
    if (await patchLead(id, { notes: e.target.value, acao: "editou a anotação" })) toast("Anotação salva.", "ok");
  });
  function download(name, content, type) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([content], { type })); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCSV() {
    const cols = ["Data", "Nome", "WhatsApp", "E-mail", "Veículo", "Origem", "Status", "Mensagem", "CPF", "Nascimento", "Estado civil", "Mãe", "CEP", "Endereço", "Bairro", "Cidade/UF", "Moradia", "Ocupação", "Empresa", "Renda", "Valor do veículo", "Entrada", "Prazo", "Troca", "Responsável", "Anotações"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filteredLeads().map((l) => { const f = l.ficha || {}; return [fmtDate(l.createdAt), l.name, l.phone, l.email, l.vehicle, SOURCE_LABEL[l.source] || l.source, STATUS_LABEL[l.status] || l.status, l.message,
      f.cpf, dmy(f.nascimento), f.estadoCivil, f.mae, f.cep, [f.endereco, f.numero, f.complemento].filter(Boolean).join(", "), f.bairro, f.cidade, f.moradia, f.ocupacao, f.empresa, f.renda, f.valorVeiculo, f.entrada, f.prazo, f.troca === "Sim" ? (f.trocaModelo || "Sim") : f.troca, userName(l.responsavel), l.notes].map(q).join(";"); });
    download(`leads-dafrota-${new Date().toISOString().slice(0, 10)}.csv`, "﻿" + [cols.join(";"), ...rows].join("\n"), "text/csv;charset=utf-8");
  }

  /* =========================================================
     Fichas de financiamento
     ========================================================= */
  function renderFichas(el) {
    const fichas = leads.filter((l) => l.ficha);
    const aberto = fichas.filter((l) => !["vendido", "perdido"].includes(l.status || "novo")).length;
    const comEntrada = fichas.filter((l) => l.ficha.entrada);
    const avgEnt = comEntrada.length ? comEntrada.reduce((s, l) => s + l.ficha.entrada, 0) / comEntrada.length : 0;
    el.innerHTML = `
      <div class="kpis">
        <div class="kpi hot"><span>Fichas em análise</span><strong data-to="${aberto}">0</strong><small>ainda sem resposta final</small></div>
        <div class="kpi"><span>Fichas recebidas</span><strong data-to="${fichas.length}">0</strong><small>no total</small></div>
        <div class="kpi"><span>Entrada média</span><strong data-to="${avgEnt}" data-fmt="brl">0</strong><small>quando informada</small></div>
        <div class="kpi"><span>Financiamentos fechados</span><strong data-to="${fichas.filter((l) => l.status === "vendido").length}">0</strong><small>marcados como vendido</small></div>
      </div>
      <section class="panel">
        <div class="panel-head"><h2>Colar ficha do WhatsApp</h2><button class="mini-btn" type="button" id="imp-toggle">Abrir</button></div>
        <div class="panel-body" id="imp-box" hidden style="display:grid;gap:14px">
          <p class="src" style="margin:0">Quando o cliente envia a ficha pelo WhatsApp, copie a mensagem inteira e cole aqui. Ela vira um lead com todos os campos organizados.</p>
          <label class="field"><span>Mensagem da ficha</span><textarea id="imp-text" rows="8" placeholder="FICHA DE FINANCIAMENTO — site Da Frota…"></textarea></label>
          <button class="button button-small" type="button" id="imp-go" style="justify-self:start">Importar ficha</button>
        </div>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Fichas recebidas</h2><span class="src">Clique numa linha para ver a ficha completa</span></div>
        ${fichas.length ? `<div class="table-wrap"><table class="sims"><thead><tr><th>Data</th><th>Cliente</th><th>CPF</th><th>Veículo</th><th>Valor</th><th>Entrada</th><th>Renda</th><th>Ocupação</th><th>Status</th></tr></thead><tbody>
          ${fichas.map((l) => { const f = l.ficha; return `<tr data-lead="${esc(l.id)}"><td>${fmtDate(l.createdAt)}</td><td>${esc(f.nome)}</td><td>${esc(f.cpf)}</td><td>${esc(f.veiculo)}</td><td>${f.valorVeiculo ? brl(f.valorVeiculo) : "—"}</td><td>${f.entrada ? brl(f.entrada) : "—"}</td><td>${f.renda ? brl(f.renda) : "—"}</td><td>${esc(f.ocupacao)}</td><td>${pill(l.status || "novo")}</td></tr>`; }).join("")}
        </tbody></table></div>` : `<div class="empty">Nenhuma ficha ainda. <a class="text-link" href="financiamento.html" target="_blank" rel="noreferrer">Abrir a página de financiamento ↗</a></div>`}
      </section>`;
    $$("[data-to]", el).forEach(countUp);
    $$("tr[data-lead]", el).forEach((tr) => tr.addEventListener("click", () => { openLeadId = tr.dataset.lead; go("leads"); }));
    $("#imp-toggle").addEventListener("click", (e) => { const b = $("#imp-box"); b.hidden = !b.hidden; e.target.textContent = b.hidden ? "Abrir" : "Fechar"; if (!b.hidden) $("#imp-text").focus(); });
    $("#imp-go").addEventListener("click", async () => {
      const f = DF.parseFicha($("#imp-text").value);
      if (!f) { toast("Não reconheci a ficha. Cole a mensagem inteira, do título até o fim.", "err"); return; }
      const dup = leads.find((l) => l.ficha && l.ficha.cpf && l.ficha.cpf === f.cpf && within(l.createdAt, 1));
      if (dup) { toast("Essa ficha já foi importada hoje.", "err"); openLeadId = dup.id; go("leads"); return; }
      const res = await DF.addLead({ name: f.nome, phone: f.whatsapp, email: f.email, vehicle: f.veiculo, source: "whatsapp", message: "Ficha recebida pelo WhatsApp.", ficha: f });
      if (ONLINE && !res.delivered) { toast(res.error || "Não consegui salvar a ficha.", "err"); return; }
      await load(); openLeadId = res.id; toast(`Ficha de ${f.nome.split(" ")[0]} importada.`, "ok"); go("leads");
    });
  }

  /* =========================================================
     Estoque
     ========================================================= */
  let stockFilter = "";
  function renderEstoque(el) {
    const list = vehicles.filter((v) => !stockFilter || v.status === stockFilter);
    el.innerHTML = `
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Filtrar estoque">
          <button class="chip" data-sf="" aria-pressed="${!stockFilter}">Todos (${vehicles.length})</button>
          ${V_STATUS.map(([k, v]) => `<button class="chip" data-sf="${k}" aria-pressed="${stockFilter === k}">${v} (${vehicles.filter((x) => x.status === k).length})</button>`).join("")}
        </div>
        <span style="flex:1"></span>
        <button class="button button-small" data-new>+ Novo veículo</button>
      </div>
      <div class="stock-grid">${list.length ? list.map((v, i) => `
        <article class="stock-card" style="animation-delay:${i * 50}ms">
          <div class="thumb"><img src="${esc(v.coverImage)}" alt="" loading="lazy">${pill(v.status, Object.fromEntries(V_STATUS))}${v.featured ? `<span class="star">Destaque</span>` : ""}</div>
          <div class="body">
            <h3>${esc(v.title)}</h3>
            <div class="price">${v.price ? brl(v.price) : "Sem preço (consulte)"}</div>
            <div class="meta">${esc([v.category, v.year, v.mileage != null ? Number(v.mileage).toLocaleString("pt-BR") + " km" : null, v.transmission].filter(Boolean).join(" · "))}</div>
            <div class="acts" data-vid="${esc(v.id)}">
              <button class="mini-btn" data-edit>Editar</button>
              ${v.status !== "vendido" ? `<button class="mini-btn" data-sold>Marcar vendido</button>` : `<button class="mini-btn" data-back>Voltar à venda</button>`}
              <button class="mini-btn" data-del style="color:var(--danger)">Excluir</button>
            </div>
          </div>
        </article>`).join("") : `<div class="empty" style="grid-column:1/-1">Nenhum veículo nesta lista.</div>`}
      </div>`;
    $$("[data-sf]", el).forEach((b) => b.addEventListener("click", () => { stockFilter = b.dataset.sf; renderEstoque(el); }));
    $("[data-new]", el).addEventListener("click", () => openDrawer());
    async function setStatus(v, status, msg) {
      try { const saved = await saveVehicle({ ...v, status }); Object.assign(v, saved); toast(msg, "ok"); renderEstoque(el); } catch (ex) { fail(ex); }
    }
    $$("[data-vid]", el).forEach((box) => box.addEventListener("click", async (e) => {
      const id = box.dataset.vid, v = vehicles.find((x) => x.id === id);
      if (e.target.closest("[data-edit]")) openDrawer(v);
      if (e.target.closest("[data-sold]")) setStatus(v, "vendido", `${v.title} marcado como vendido.`);
      if (e.target.closest("[data-back]")) setStatus(v, "disponivel", `${v.title} voltou para o estoque.`);
      if (e.target.closest("[data-del]")) box.innerHTML = `<span class="confirm-inline">Excluir? <button class="btn-danger" data-del-ok>Sim</button><button class="mini-btn" data-del-cancel>Não</button></span>`;
      if (e.target.closest("[data-del-ok]")) { try { await deleteVehicle(id); vehicles = vehicles.filter((x) => x.id !== id); toast("Veículo excluído."); renderEstoque(el); } catch (ex) { fail(ex); } }
      if (e.target.closest("[data-del-cancel]")) renderEstoque(el);
    }));
  }

  /* ---------- Gaveta de cadastro/edição ---------- */
  function compress(file, max = 1600, q = 0.82) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL("image/jpeg", q));
        };
        img.onerror = rej; img.src = r.result;
      };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function openDrawer(v) {
    const editing = !!v;
    const d = { title: "", brand: "", category: "SUV", year: "", mileage: "", price: "", transmission: "Automático", fuel: "Flex", color: "", status: "disponivel", featured: false, description: "", gallery: [], ...(v ? structuredClone(v) : {}) };
    if (!d.gallery?.length && d.coverImage) d.gallery = [d.coverImage];
    const scrim = document.createElement("div"); scrim.className = "drawer-scrim";
    const dr = document.createElement("aside"); dr.className = "drawer"; dr.setAttribute("role", "dialog"); dr.setAttribute("aria-modal", "true"); dr.setAttribute("aria-label", editing ? "Editar veículo" : "Novo veículo");
    const opt = (arr, cur) => arr.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(cur) === String(val) ? " selected" : ""}>${esc(lab)}</option>`; }).join("");
    dr.innerHTML = `
      <div class="drawer-head"><h2>${editing ? "Editar <em>veículo</em>" : "Novo <em>veículo</em>"}</h2><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
      <form class="drawer-body" id="vform" novalidate>
        <label class="field" id="vf-title"><span>Nome do anúncio *</span><input id="v-title" value="${esc(d.title)}" placeholder="Ex.: Toyota Hilux SRX 2.8 Diesel"><small class="error"></small></label>
        <div class="field-row">
          <label class="field"><span>Marca</span><input id="v-brand" value="${esc(d.brand)}" placeholder="Toyota"></label>
          <label class="field"><span>Categoria</span><select id="v-category">${opt(CATS, d.category)}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Ano</span><input id="v-year" inputmode="numeric" maxlength="9" value="${esc(d.year ?? "")}" placeholder="2022/2023"></label>
          <label class="field"><span>Quilometragem</span><input id="v-mileage" inputmode="numeric" value="${d.mileage != null && d.mileage !== "" ? maskMoney(d.mileage) : ""}" placeholder="35.000"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Preço</span><div class="money"><input id="v-price" inputmode="numeric" value="${d.price ? maskMoney(Math.round(d.price)) : ""}" placeholder="Deixe vazio para “consulte”"></div></label>
          <label class="field"><span>Cor</span><input id="v-color" value="${esc(d.color)}" placeholder="Branco"></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Câmbio</span><select id="v-transmission">${opt(["Automático", "Manual", "CVT", "Automatizado"], d.transmission)}</select></label>
          <label class="field"><span>Combustível</span><select id="v-fuel">${opt(["Flex", "Gasolina", "Diesel", "Híbrido", "Elétrico"], d.fuel)}</select></label>
        </div>
        <div class="field-row">
          <label class="field"><span>Situação</span><select id="v-status">${opt(V_STATUS, d.status)}</select></label>
          <div class="field"><span class="field-label">Vitrine</span><label class="switch"><input type="checkbox" id="v-featured"${d.featured ? " checked" : ""}>Destaque no site</label></div>
        </div>
        <label class="field"><span>Descrição</span><textarea id="v-desc" rows="4" placeholder="Opcionais, revisões, estado de conservação…">${esc(d.description)}</textarea></label>
        <div class="field" id="vf-photos">
          <span class="field-label">Fotos * <small style="text-transform:none;letter-spacing:0">(a primeira é a capa)</small></span>
          <label class="dropzone" id="drop"><b>Clique para escolher</b> ou arraste as fotos aqui<small>JPG ou PNG. As fotos são otimizadas automaticamente.</small><input type="file" id="v-files" accept="image/*" multiple hidden></label>
          <div class="photo-list" id="photos"></div>
          <small class="error"></small>
        </div>
      </form>
      <div class="drawer-foot"><button class="button button-ghost button-small" type="button" data-close>Cancelar</button><button class="button button-small" type="button" id="v-save">${editing ? "Salvar alterações" : "Cadastrar veículo"}</button></div>`;
    document.body.append(scrim, dr);
    document.body.style.overflow = "hidden";
    $("#v-title", dr).focus();

    const paintPhotos = () => {
      $("#photos", dr).innerHTML = d.gallery.map((src, i) => `<div class="photo${i ? "" : " cover"}"><img src="${esc(src)}" alt="">${i ? "" : `<span class="tag">Capa</span>`}
        <div class="ctrls">${i ? `<button type="button" data-cover="${i}" title="Usar como capa" aria-label="Usar como capa">★</button><button type="button" data-left="${i}" title="Mover para a esquerda" aria-label="Mover para a esquerda">←</button>` : ""}<button type="button" data-rm="${i}" title="Remover" aria-label="Remover foto">×</button></div></div>`).join("");
    };
    paintPhotos();
    $("#photos", dr).addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.cover) { const [x] = d.gallery.splice(+b.dataset.cover, 1); d.gallery.unshift(x); }
      if (b.dataset.left) { const i = +b.dataset.left; [d.gallery[i - 1], d.gallery[i]] = [d.gallery[i], d.gallery[i - 1]]; }
      if (b.dataset.rm) d.gallery.splice(+b.dataset.rm, 1);
      paintPhotos();
    });
    async function addFiles(files) {
      const imgs = [...files].filter((f) => f.type.startsWith("image/"));
      if (!imgs.length) return;
      toast(`Otimizando ${imgs.length} foto(s)…`);
      for (const f of imgs) { try { d.gallery.push(await compress(f)); paintPhotos(); } catch { toast(`Não consegui ler ${f.name}.`, "err"); } }
    }
    $("#v-files", dr).addEventListener("change", (e) => addFiles(e.target.files));
    const drop = $("#drop", dr);
    ["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
    drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    $("#v-mileage", dr).addEventListener("input", (e) => (e.target.value = maskMoney(e.target.value)));
    $("#v-price", dr).addEventListener("input", (e) => (e.target.value = maskMoney(e.target.value)));

    const close = () => {
      dr.classList.add("closing"); scrim.style.opacity = "0"; scrim.style.transition = "opacity .3s";
      setTimeout(() => { dr.remove(); scrim.remove(); document.body.style.overflow = ""; }, reduce ? 0 : 300);
      removeEventListener("keydown", onKey);
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    scrim.addEventListener("click", close);
    $$("[data-close]", dr).forEach((b) => b.addEventListener("click", close));

    $("#v-save", dr).addEventListener("click", async () => {
      const title = $("#v-title", dr).value.trim();
      let ok = true;
      const fT = $("#vf-title", dr), fP = $("#vf-photos", dr);
      [fT, fP].forEach((f) => { f.classList.remove("invalid"); $(".error", f).textContent = ""; });
      if (title.length < 3) { fT.classList.add("invalid"); $(".error", fT).textContent = "Informe o nome do anúncio."; ok = false; }
      if (!d.gallery.length) { fP.classList.add("invalid"); $(".error", fP).textContent = "Adicione pelo menos uma foto."; ok = false; }
      if (!ok) return;
      const km = $("#v-mileage", dr).value, pr = $("#v-price", dr).value;
      const out = {
        ...(v || {}), title, brand: $("#v-brand", dr).value.trim(), category: $("#v-category", dr).value,
        year: $("#v-year", dr).value.trim() || null, mileage: km ? num(km.replace(/\./g, "")) : null, price: pr ? num(pr.replace(/\./g, "")) : null,
        color: $("#v-color", dr).value.trim(), transmission: $("#v-transmission", dr).value, fuel: $("#v-fuel", dr).value,
        status: $("#v-status", dr).value, featured: $("#v-featured", dr).checked, description: $("#v-desc", dr).value.trim(),
        gallery: d.gallery.slice(), coverImage: d.gallery[0],
      };
      const sb = $("#v-save", dr); sb.disabled = true; sb.textContent = "Salvando…";
      try {
        const saved = await saveVehicle(out);
        const i = vehicles.findIndex((x) => x.id === saved.id);
        if (i >= 0) vehicles[i] = saved; else vehicles.unshift(saved);
        toast(editing ? "Alterações salvas." : "Veículo cadastrado e publicado no site.", "ok");
        close(); if (view === "estoque" || view === "painel") render(); else go("estoque");
      } catch (err) { fail(err); sb.disabled = false; sb.textContent = editing ? "Salvar alterações" : "Cadastrar veículo"; }
    });
  }

  /* =========================================================
     Financeiro (custos por carro, despesas da loja, fechamento do mês)
     ========================================================= */
  const F = window.DFFin;
  let fin = null, finTab = "carros", finMonth = F.monthOf(F.todayISO()), finFilter = "estoque", finQ = "";
  async function loadFin() {
    try { fin = await DF.getFin(); } catch (e) { fin = null; fail(e); }
    return fin;
  }
  // Valores: inteiros sem centavos, quebrados com centavos
  const money = (n) => (n == null || isNaN(n) ? "—" : brl(n, Number.isInteger(+n) ? 0 : 2));
  const cents = (n) => (n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const maskCents = (v) => { const d = String(v).replace(/\D/g, "").replace(/^0+(?=\d)/, ""); return d ? cents(+d / 100) : ""; };
  const readMoney = (v) => (String(v || "").trim() ? DF.num(v) : null);
  const signClass = (n) => (n == null ? "" : n < 0 ? "comp-bad" : "comp-ok");
  const pctOrDash = (n) => (n == null ? "—" : pct(n));
  const normPlaca = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
  const fmtPlaca = (p) => (p && p.length === 7 && /^[A-Z]{3}\d{4}$/.test(p) ? p.slice(0, 3) + "-" + p.slice(3) : p || "—");
  const monthNav = () => `<div class="month-nav" role="group" aria-label="Escolher mês"><button class="mini-btn" type="button" data-mon="-1" aria-label="Mês anterior">‹</button><b>${esc(F.monthLabel(finMonth))}</b><button class="mini-btn" type="button" data-mon="1" aria-label="Próximo mês">›</button></div>`;

  function renderFinanceiro(el) {
    if (!fin) {
      el.innerHTML = `<div class="empty">Carregando financeiro…</div>`;
      loadFin().then((ok) => { if (ok && view === "financeiro") renderFinanceiro(el); else if (!ok) el.innerHTML = `<div class="empty">Não consegui carregar o financeiro. <button class="mini-btn" type="button" data-retry>Tentar de novo</button></div>`; $("[data-retry]", el)?.addEventListener("click", () => renderFinanceiro(el)); });
      return;
    }
    const TABS = [["carros", "Carros"], ["despesas", "Despesas da loja"], ["fechamento", "Fechamento do mês"]];
    el.innerHTML = `
      <div class="toolbar fin-head">
        <div class="chips" role="tablist" aria-label="Seções do financeiro">${TABS.map(([k, t]) => `<button class="chip" type="button" role="tab" data-ftab="${k}" aria-pressed="${finTab === k}" aria-selected="${finTab === k}">${t}</button>`).join("")}</div>
        <span style="flex:1"></span>
        ${finTab === "carros" ? `<button class="button button-small" type="button" data-fnew>+ Lançar compra</button>` : monthNav()}
      </div>
      <div id="fin-body"></div>`;
    $$("[data-ftab]", el).forEach((b) => b.addEventListener("click", () => { finTab = b.dataset.ftab; renderFinanceiro(el); }));
    $$("[data-mon]", el).forEach((b) => b.addEventListener("click", () => { finMonth = F.addMonths(finMonth, +b.dataset.mon); renderFinanceiro(el); }));
    $("[data-fnew]", el)?.addEventListener("click", () => openFinDrawer());
    const body = $("#fin-body", el);
    ({ carros: finCarros, despesas: finDespesas, fechamento: finFechamento })[finTab](body, el);
    $$("[data-to]", el).forEach(countUp);
    requestAnimationFrame(() => setTimeout(() => $$("[data-w]", el).forEach((i) => (i.style.width = i.dataset.w + "%")), 60));
  }

  /* ---------- Carros ---------- */
  function finCarros(body, el) {
    const cars = fin.cars;
    const st = F.stock(cars);
    const mes = F.monthClose(cars, fin.expenses, F.monthOf(F.todayISO()));
    const groups = { estoque: cars.filter((c) => !F.isSold(c)), vendidos: cars.filter(F.isSold), todos: cars };
    const q = finQ.trim().toLowerCase(), qp = normPlaca(finQ);
    const list = groups[finFilter].filter((c) => !q || (c.modelo || "").toLowerCase().includes(q) || (qp && (c.placa || "").includes(qp)))
      .sort((a, b) => String((F.isSold(b) && b.vendaData) || b.compraData).localeCompare(String((F.isSold(a) && a.vendaData) || a.compraData)));
    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Carros em estoque</span><strong data-to="${st.qtd}">0</strong><small>${st.diasMedios != null ? `parados em média há ${Math.round(st.diasMedios)} dias` : "nenhum carro lançado"}</small></div>
        <div class="kpi"><span>Dinheiro no estoque</span><strong data-to="${st.capital}" data-fmt="brl">0</strong><small>compra + gastos dos carros não vendidos</small></div>
        <div class="kpi"><span>Vendidos neste mês</span><strong data-to="${mes.qtd}">0</strong><small>${mes.qtd ? `faturamento de ${money(mes.faturamento)}` : "nenhuma venda ainda"}</small></div>
        <div class="kpi hot"><span>Lucro bruto do mês</span><strong data-to="${mes.lucroBruto}" data-fmt="brl">0</strong><small>${mes.margem != null ? `margem de ${pct(mes.margem)}` : "carros vendidos no mês"}</small></div>
      </div>
      <section class="panel">
        <div class="panel-head">
          <div class="chips" role="group" aria-label="Filtrar carros">
            ${[["estoque", "Em estoque"], ["vendidos", "Vendidos"], ["todos", "Todos"]].map(([k, t]) => `<button class="chip" type="button" data-ff="${k}" aria-pressed="${finFilter === k}">${t} (${groups[k].length})</button>`).join("")}
          </div>
          <input class="input" type="search" id="fin-q" value="${esc(finQ)}" placeholder="Buscar por placa ou modelo" aria-label="Buscar carro" style="flex:0 1 260px">
        </div>
        ${list.length ? `<div class="table-wrap"><table class="sims fin-table"><thead><tr><th>Placa</th><th>Veículo</th><th>Compra</th><th class="num">Valor pago</th><th class="num">Gastos</th><th class="num">Custo total</th><th class="num">Venda</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Dias</th></tr></thead><tbody>
          ${list.map((c) => { const l = F.lucro(c); return `<tr data-fcar="${esc(c.id)}" tabindex="0"><td><b>${esc(fmtPlaca(c.placa))}</b></td><td>${esc(c.modelo)}${c.ano ? ` <span class="src">${esc(c.ano)}</span>` : ""}</td><td>${dmy(c.compraData)}</td><td class="num">${money(c.compraValor)}</td><td class="num">${money(F.gastosTotal(c))}</td><td class="num">${money(F.custoTotal(c))}</td><td class="num">${F.isSold(c) ? `${money(c.vendaValor)}<br><small class="src">${dmy(c.vendaData)}</small>` : `<span class="pill s-disponivel">Em estoque</span>`}</td><td class="num ${signClass(l)}">${l == null ? "—" : money(l)}</td><td class="num ${signClass(l)}">${pctOrDash(F.margem(c))}</td><td class="num">${F.dias(c) ?? "—"}</td></tr>`; }).join("")}
        </tbody></table></div>` : `<div class="empty">${cars.length ? "Nenhum carro nesta lista." : `Nenhum carro lançado ainda.<br>Clique em <b>+ Lançar compra</b> para registrar o primeiro.`}</div>`}
      </section>`;
    $$("[data-ff]", body).forEach((b) => b.addEventListener("click", () => { finFilter = b.dataset.ff; renderFinanceiro(el); }));
    const qi = $("#fin-q", body);
    qi.addEventListener("input", () => { finQ = qi.value; const pos = qi.selectionStart; renderFinanceiro(el); const n = $("#fin-q"); n.focus(); n.setSelectionRange(pos, pos); });
    $$("tr[data-fcar]", body).forEach((tr) => {
      const open = () => openFinDrawer(fin.cars.find((c) => c.id === tr.dataset.fcar));
      tr.addEventListener("click", open);
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") open(); });
    });
  }

  /* ---------- Gaveta: lançar/editar carro ---------- */
  function openFinDrawer(car) {
    const editing = !!car;
    const d = { modelo: "", placa: "", ano: "", cor: "", vehicleId: "", compraData: F.todayISO(), compraValor: null, fornecedor: "", gastos: [], vendaData: "", vendaValor: null, comprador: "", obs: "", ...(car ? structuredClone(car) : {}) };
    d.gastos = (d.gastos || []).map((g) => ({ ...g }));
    const scrim = document.createElement("div"); scrim.className = "drawer-scrim";
    const dr = document.createElement("aside"); dr.className = "drawer"; dr.setAttribute("role", "dialog"); dr.setAttribute("aria-modal", "true"); dr.setAttribute("aria-label", editing ? "Editar carro" : "Lançar compra");
    const opt = (arr, cur) => arr.map((o) => { const [val, lab] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(cur) === String(val) ? " selected" : ""}>${esc(lab)}</option>`; }).join("");
    const anuncios = [["", "— Nenhum —"], ...vehicles.map((v) => [v.id, `${v.title}${v.status === "vendido" ? " (vendido)" : ""}`])];
    dr.innerHTML = `
      <div class="drawer-head"><h2>${editing ? `${esc(fmtPlaca(d.placa))} · <em>${esc(d.modelo)}</em>` : "Lançar <em>compra</em>"}</h2><button class="icon-btn" type="button" data-close aria-label="Fechar">×</button></div>
      <form class="drawer-body" id="fform" novalidate>
        <p class="fin-sec">Veículo</p>
        <label class="field"><span>Anúncio no site (opcional)</span><select id="f-vehicle">${opt(anuncios, d.vehicleId || "")}</select><small class="src">Ao registrar a venda, o anúncio vinculado sai do site automaticamente.</small></label>
        <label class="field" id="ff-modelo"><span>Veículo *</span><input id="f-modelo" value="${esc(d.modelo)}" placeholder="Ex.: Porsche Cayenne S"><small class="error"></small></label>
        <div class="field-row">
          <label class="field" id="ff-placa"><span>Placa *</span><input id="f-placa" value="${esc(d.placa)}" placeholder="ABC1D23" maxlength="8" autocapitalize="characters" style="text-transform:uppercase"><small class="error"></small></label>
          <label class="field"><span>Ano</span><input id="f-ano" value="${esc(d.ano)}" placeholder="2023/2024" maxlength="9" inputmode="numeric"></label>
          <label class="field"><span>Cor</span><input id="f-cor" value="${esc(d.cor)}" placeholder="Branco"></label>
        </div>
        <p class="fin-sec">Compra</p>
        <div class="field-row">
          <label class="field" id="ff-cdata"><span>Data da compra *</span><input id="f-cdata" type="date" value="${esc(d.compraData)}"><small class="error"></small></label>
          <label class="field" id="ff-cvalor"><span>Valor pago *</span><div class="money"><input id="f-cvalor" inputmode="numeric" value="${cents(d.compraValor)}" placeholder="0,00"></div><small class="error"></small></label>
        </div>
        <label class="field"><span>Comprado de</span><input id="f-forn" value="${esc(d.fornecedor)}" placeholder="Nome do vendedor, leilão, troca…"></label>
        <p class="fin-sec">Gastos com o carro <small>documentação, preparação, comissão…</small></p>
        <div id="f-gastos" class="gasto-list"></div>
        <button class="mini-btn" type="button" id="f-addg" style="justify-self:start">+ Adicionar gasto</button>
        <p class="fin-sec">Venda <small>deixe em branco enquanto o carro estiver à venda</small></p>
        <div class="field-row">
          <label class="field" id="ff-vdata"><span>Data da venda</span><input id="f-vdata" type="date" value="${esc(d.vendaData || "")}"><small class="error"></small></label>
          <label class="field" id="ff-vvalor"><span>Valor de venda</span><div class="money"><input id="f-vvalor" inputmode="numeric" value="${cents(d.vendaValor)}" placeholder="0,00"></div><small class="error"></small></label>
        </div>
        <label class="field"><span>Vendido para</span><input id="f-comprador" value="${esc(d.comprador)}" placeholder="Nome do cliente"></label>
        <div class="fin-sum" id="f-sum" aria-live="polite"></div>
        <label class="field"><span>Observações</span><textarea id="f-obs" rows="3" placeholder="Pendências, combinados, histórico…">${esc(d.obs)}</textarea></label>
      </form>
      <div class="drawer-foot">${editing ? `<span id="f-delwrap" style="margin-right:auto"><button class="btn-danger" type="button" id="f-del">Excluir</button></span>` : ""}<button class="button button-ghost button-small" type="button" data-close>Cancelar</button><button class="button button-small" type="button" id="f-save">${editing ? "Salvar alterações" : "Lançar compra"}</button></div>`;
    document.body.append(scrim, dr);
    document.body.style.overflow = "hidden";
    $(editing ? "#f-addg" : "#f-vehicle", dr).focus();

    const paintGastos = () => {
      $("#f-gastos", dr).innerHTML = d.gastos.length ? d.gastos.map((g, i) => `
        <div class="gasto-row" data-gi="${i}">
          <input class="input" type="date" data-g="data" value="${esc(g.data || "")}" aria-label="Data do gasto">
          <select class="input" data-g="tipo" aria-label="Tipo de gasto">${opt(F.GASTO_TIPOS, g.tipo || "Documentação")}</select>
          <input class="input" data-g="desc" value="${esc(g.desc || "")}" placeholder="Descrição" aria-label="Descrição do gasto">
          <div class="money"><input class="input" data-g="valor" inputmode="numeric" value="${cents(g.valor)}" placeholder="0,00" aria-label="Valor do gasto"></div>
          <button class="icon-btn" type="button" data-grm aria-label="Remover gasto">×</button>
        </div>`).join("") : `<p class="src" style="margin:0">Nenhum gasto lançado.</p>`;
    };
    const paintSum = () => {
      const c = collect();
      const sold = F.isSold(c), l = F.lucro(c);
      $("#f-sum", dr).innerHTML = `
        <div><span>Valor pago</span><b>${money(c.compraValor || 0)}</b></div>
        <div><span>Gastos</span><b>${money(F.gastosTotal(c))}</b></div>
        <div><span>Custo total</span><b>${money(F.custoTotal(c))}</b></div>
        ${sold ? `<div><span>Venda</span><b>${money(c.vendaValor)}</b></div>
        <div class="big ${signClass(l)}"><span>${l < 0 ? "Prejuízo" : "Lucro"}</span><b>${money(l)}</b><small>margem ${pctOrDash(F.margem(c))} · ${F.dias(c)} dias em estoque</small></div>`
        : `<div class="big"><span>Para ter lucro, venda acima de</span><b>${money(F.custoTotal(c))}</b><small>${F.dias(c) ?? 0} dias em estoque</small></div>`}`;
    };
    function collect() {
      return {
        ...d, modelo: $("#f-modelo", dr).value.trim(), placa: normPlaca($("#f-placa", dr).value), ano: $("#f-ano", dr).value.trim(), cor: $("#f-cor", dr).value.trim(),
        vehicleId: $("#f-vehicle", dr).value || null, compraData: $("#f-cdata", dr).value, compraValor: readMoney($("#f-cvalor", dr).value), fornecedor: $("#f-forn", dr).value.trim(),
        gastos: d.gastos.filter((g) => g.valor > 0).map((g) => ({ ...g, data: g.data || $("#f-cdata", dr).value })),
        vendaData: $("#f-vdata", dr).value || null, vendaValor: readMoney($("#f-vvalor", dr).value), comprador: $("#f-comprador", dr).value.trim(), obs: $("#f-obs", dr).value.trim(),
      };
    }
    paintGastos(); paintSum();

    $("#f-vehicle", dr).addEventListener("change", (e) => {
      const v = vehicles.find((x) => x.id === e.target.value); if (!v) return;
      if (!$("#f-modelo", dr).value.trim()) $("#f-modelo", dr).value = v.title;
      if (!$("#f-ano", dr).value.trim() && v.year) $("#f-ano", dr).value = v.year;
      if (!$("#f-cor", dr).value.trim() && v.color) $("#f-cor", dr).value = v.color;
    });
    $("#f-placa", dr).addEventListener("input", (e) => (e.target.value = normPlaca(e.target.value)));
    ["#f-cvalor", "#f-vvalor"].forEach((s) => $(s, dr).addEventListener("input", (e) => { e.target.value = maskCents(e.target.value); paintSum(); }));
    ["#f-cdata", "#f-vdata"].forEach((s) => $(s, dr).addEventListener("change", paintSum));
    $("#f-addg", dr).addEventListener("click", () => {
      d.gastos.push({ id: DF.uid(), data: F.todayISO(), tipo: "Documentação", desc: "", valor: null });
      paintGastos(); $(`[data-gi="${d.gastos.length - 1}"] [data-g="desc"]`, dr).focus();
    });
    const gl = $("#f-gastos", dr);
    gl.addEventListener("input", (e) => {
      const row = e.target.closest("[data-gi]"); if (!row) return;
      const g = d.gastos[+row.dataset.gi], k = e.target.dataset.g;
      if (k === "valor") { e.target.value = maskCents(e.target.value); g.valor = readMoney(e.target.value); paintSum(); } else g[k] = e.target.value;
    });
    gl.addEventListener("change", (e) => { const row = e.target.closest("[data-gi]"); if (row && e.target.dataset.g) d.gastos[+row.dataset.gi][e.target.dataset.g] = e.target.dataset.g === "valor" ? readMoney(e.target.value) : e.target.value; });
    gl.addEventListener("click", (e) => { const b = e.target.closest("[data-grm]"); if (!b) return; d.gastos.splice(+b.closest("[data-gi]").dataset.gi, 1); paintGastos(); paintSum(); });

    const close = () => {
      dr.classList.add("closing"); scrim.style.opacity = "0"; scrim.style.transition = "opacity .3s";
      setTimeout(() => { dr.remove(); scrim.remove(); document.body.style.overflow = ""; }, reduce ? 0 : 300);
      removeEventListener("keydown", onKey);
    };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    scrim.addEventListener("click", close);
    $$("[data-close]", dr).forEach((b) => b.addEventListener("click", close));

    $("#f-delwrap", dr)?.addEventListener("click", async (e) => {
      const w = e.currentTarget;
      if (e.target.closest("#f-del")) w.innerHTML = `<span class="confirm-inline">Excluir do financeiro? <button class="btn-danger" type="button" data-yes>Sim</button><button class="mini-btn" type="button" data-no>Não</button></span>`;
      if (e.target.closest("[data-no]")) w.innerHTML = `<button class="btn-danger" type="button" id="f-del">Excluir</button>`;
      if (e.target.closest("[data-yes]")) {
        try { await DF.deleteFinCar(car.id); fin.cars = fin.cars.filter((x) => x.id !== car.id); toast("Carro excluído do financeiro."); close(); render(); } catch (ex) { fail(ex); }
      }
    });

    $("#f-save", dr).addEventListener("click", async () => {
      const c = collect();
      const fields = { modelo: "#ff-modelo", placa: "#ff-placa", cdata: "#ff-cdata", cvalor: "#ff-cvalor", vdata: "#ff-vdata", vvalor: "#ff-vvalor" };
      Object.values(fields).forEach((s) => { const f = $(s, dr); f.classList.remove("invalid"); $(".error", f).textContent = ""; });
      const errs = [];
      if (c.modelo.length < 2) errs.push(["modelo", "Informe o veículo."]);
      if (!/^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(c.placa)) errs.push(["placa", "Placa inválida. Ex.: ABC1234 ou ABC1D23."]);
      if (!c.compraData) errs.push(["cdata", "Informe a data."]);
      if (c.compraValor == null) errs.push(["cvalor", "Informe o valor pago."]);
      if (c.vendaData && c.vendaValor == null) errs.push(["vvalor", "Informe o valor de venda."]);
      if (!c.vendaData && c.vendaValor != null) errs.push(["vdata", "Informe a data da venda."]);
      if (c.vendaData && c.compraData && c.vendaData < c.compraData) errs.push(["vdata", "A venda não pode ser antes da compra."]);
      const dup = fin.cars.find((x) => x.placa === c.placa && x.id !== c.id && !F.isSold(x));
      if (dup && !errs.length) errs.push(["placa", `Essa placa já está no estoque (${dup.modelo}).`]);
      if (errs.length) {
        errs.forEach(([k, m]) => { const f = $(fields[k], dr); f.classList.add("invalid"); $(".error", f).textContent = m; });
        $(fields[errs[0][0]] + " input", dr)?.focus();
        return;
      }
      const sb = $("#f-save", dr); sb.disabled = true; sb.textContent = "Salvando…";
      try {
        const saved = await DF.saveFinCar(c);
        const i = fin.cars.findIndex((x) => x.id === saved.id);
        if (i >= 0) fin.cars[i] = saved; else fin.cars.unshift(saved);
        const justSold = F.isSold(saved) && !(car && F.isSold(car));
        toast(justSold ? `Venda registrada: ${F.lucro(saved) < 0 ? "prejuízo" : "lucro"} de ${money(F.lucro(saved))}.` : editing ? "Alterações salvas." : "Compra lançada.", "ok");
        // Carro vendido → anúncio vinculado sai do site
        const v = F.isSold(saved) && saved.vehicleId && vehicles.find((x) => x.id === saved.vehicleId);
        if (v && v.status !== "vendido") {
          try { Object.assign(v, await saveVehicle({ ...v, status: "vendido" })); toast(`Anúncio “${v.title}” marcado como vendido e retirado do site.`); }
          catch (ex) { toast("A venda foi salva, mas não consegui tirar o anúncio do site. Marque como vendido no Estoque.", "err"); }
        }
        if (justSold) finFilter = "vendidos";
        close(); if (view === "financeiro") render(); else go("financeiro");
      } catch (err) { fail(err); sb.disabled = false; sb.textContent = editing ? "Salvar alterações" : "Lançar compra"; }
    });
  }

  /* ---------- Despesas da loja ---------- */
  function finDespesas(body, el) {
    const list = fin.expenses.filter((e) => F.monthOf(e.data) === finMonth).sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const total = list.reduce((s, e) => s + e.valor, 0);
    const prevYm = F.addMonths(finMonth, -1);
    const prev = fin.expenses.filter((e) => F.monthOf(e.data) === prevYm);
    const today = F.todayISO();
    const defDate = F.monthOf(today) === finMonth ? today : finMonth + "-01";
    body.innerHTML = `
      <section class="panel">
        <div class="panel-head"><h2>Lançar despesa</h2><span class="src">Aluguel, salários, anúncios, contador…</span></div>
        <form class="panel-body exp-form" id="exp-form" novalidate>
          <label class="field"><span>Data</span><input id="e-data" type="date" value="${defDate}"></label>
          <label class="field"><span>Categoria</span><select id="e-cat">${F.DESP_CATS.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
          <label class="field"><span>Descrição</span><input id="e-desc" placeholder="Ex.: Aluguel do showroom"></label>
          <label class="field"><span>Valor</span><div class="money"><input id="e-valor" inputmode="numeric" placeholder="0,00"></div></label>
          <button class="button button-small" type="submit">Adicionar</button>
        </form>
      </section>
      <section class="panel">
        <div class="panel-head"><h2>Despesas de ${esc(F.monthLabel(finMonth))}</h2><b class="fin-total">${money(F.r2(total))}</b></div>
        ${list.length ? `<div class="table-wrap"><table class="sims fin-table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead><tbody>
          ${list.map((e) => `<tr data-exp="${esc(e.id)}"><td>${dmy(e.data)}</td><td>${esc(e.categoria)}</td><td>${esc(e.desc || "—")}</td><td class="num">${money(e.valor)}</td><td class="num"><button class="mini-btn" type="button" data-edel style="color:var(--danger)">Excluir</button></td></tr>`).join("")}
        </tbody></table></div>` : `<div class="empty">Nenhuma despesa lançada neste mês.${prev.length ? `<br><br><button class="mini-btn" type="button" data-copy>${prev.length === 1 ? "Copiar a despesa" : `Copiar as ${prev.length} despesas`} de ${esc(F.monthLabel(prevYm))}</button><br><small class="src">Útil para aluguel, salários e outros gastos que se repetem. Confira os valores depois.</small>` : ""}</div>`}
      </section>`;
    const vi = $("#e-valor", body);
    vi.addEventListener("input", () => (vi.value = maskCents(vi.value)));
    $("#exp-form", body).addEventListener("submit", async (e) => {
      e.preventDefault();
      const exp = { data: $("#e-data", body).value, categoria: $("#e-cat", body).value, desc: $("#e-desc", body).value.trim(), valor: readMoney(vi.value) };
      if (!exp.data) { toast("Informe a data.", "err"); return; }
      if (!exp.valor) { toast("Informe o valor.", "err"); vi.focus(); return; }
      try {
        const saved = await DF.saveFinExpense(exp); fin.expenses.unshift(saved);
        finMonth = F.monthOf(saved.data); toast("Despesa lançada.", "ok"); renderFinanceiro(el); $("#e-desc")?.focus();
      } catch (ex) { fail(ex); }
    });
    $$("tr[data-exp]", body).forEach((tr) => tr.addEventListener("click", async (e) => {
      const id = tr.dataset.exp;
      if (e.target.closest("[data-edel]")) { e.target.closest("td").innerHTML = `<span class="confirm-inline">Excluir? <button class="btn-danger" type="button" data-eok>Sim</button><button class="mini-btn" type="button" data-eno>Não</button></span>`; return; }
      if (e.target.closest("[data-eno]")) { renderFinanceiro(el); return; }
      if (e.target.closest("[data-eok]")) { try { await DF.deleteFinExpense(id); fin.expenses = fin.expenses.filter((x) => x.id !== id); toast("Despesa excluída."); renderFinanceiro(el); } catch (ex) { fail(ex); } }
    }));
    $("[data-copy]", body)?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      const [y, m] = finMonth.split("-").map(Number), last = new Date(y, m, 0).getDate();
      try {
        for (const p of prev) {
          const day = String(Math.min(+p.data.slice(8, 10), last)).padStart(2, "0");
          fin.expenses.unshift(await DF.saveFinExpense({ data: `${finMonth}-${day}`, categoria: p.categoria, desc: p.desc, valor: p.valor }));
        }
        toast(`${prev.length} despesas copiadas. Confira os valores.`, "ok");
      } catch (ex) { fail(ex); }
      renderFinanceiro(el);
    });
  }

  /* ---------- Fechamento do mês ---------- */
  function finFechamento(body, el) {
    const m = F.monthClose(fin.cars, fin.expenses, finMonth);
    const hist = F.history(fin.cars, fin.expenses, finMonth, 6);
    const compraVendidos = F.r2(m.vendidos.reduce((s, c) => s + (+c.compraValor || 0), 0));
    const saidas = [["Compra dos carros vendidos", compraVendidos], ...Object.entries(m.gastosPorTipo).map(([k, v]) => [`Gastos: ${k}`, v]), ...Object.entries(m.despesasPorCat).map(([k, v]) => [`Loja: ${k}`, v])].filter(([, v]) => v > 0);
    const maxS = Math.max(1, ...saidas.map(([, v]) => v));
    body.innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Faturamento</span><strong data-to="${m.faturamento}" data-fmt="brl">0</strong><small>${m.qtd} carro${m.qtd === 1 ? "" : "s"} vendido${m.qtd === 1 ? "" : "s"}${m.ticketMedio ? ` · ticket médio ${money(m.ticketMedio)}` : ""}</small></div>
        <div class="kpi"><span>Lucro bruto</span><strong class="${signClass(m.lucroBruto)}" data-to="${m.lucroBruto}" data-fmt="brl">0</strong><small>venda − custo dos carros${m.margem != null ? ` · margem ${pct(m.margem)}` : ""}</small></div>
        <div class="kpi"><span>Despesas da loja</span><strong data-to="${m.despesas}" data-fmt="brl">0</strong><small>${m.despesasLista.length} lançamento${m.despesasLista.length === 1 ? "" : "s"}</small></div>
        <div class="kpi hot"><span>Lucro líquido</span><strong class="${m.lucroLiquido < 0 ? "comp-bad" : ""}" data-to="${m.lucroLiquido}" data-fmt="brl">0</strong><small>lucro bruto − despesas da loja</small></div>
      </div>
        <section class="panel">
          <div class="panel-head"><h2>Carros vendidos</h2><button class="mini-btn" type="button" data-csv>Exportar para Excel</button></div>
          ${m.qtd ? `<div class="table-wrap"><table class="sims fin-table"><thead><tr><th>Venda</th><th>Veículo</th><th class="num">Vendido por</th><th class="num">Custo</th><th class="num">Lucro</th><th class="num">Margem</th><th class="num">Dias</th></tr></thead><tbody>
            ${m.vendidos.map((c) => { const l = F.lucro(c); return `<tr data-fcar="${esc(c.id)}"><td>${dmy(c.vendaData)}</td><td><b>${esc(fmtPlaca(c.placa))}</b> ${esc(c.modelo)}</td><td class="num">${money(c.vendaValor)}</td><td class="num">${money(F.custoTotal(c))}</td><td class="num ${signClass(l)}">${money(l)}</td><td class="num ${signClass(l)}">${pctOrDash(F.margem(c))}</td><td class="num">${F.dias(c)}</td></tr>`; }).join("")}
            <tr class="total"><td colspan="2">Total</td><td class="num">${money(m.faturamento)}</td><td class="num">${money(m.custo)}</td><td class="num ${signClass(m.lucroBruto)}">${money(m.lucroBruto)}</td><td class="num">${pctOrDash(m.margem)}</td><td class="num">${m.diasMedios != null ? Math.round(m.diasMedios) : "—"}</td></tr>
          </tbody></table></div>` : `<div class="empty">Nenhum carro vendido em ${esc(F.monthLabel(finMonth))}.<br><small>Registre a venda na aba <b>Carros</b>, abrindo o carro e preenchendo data e valor de venda.</small></div>`}
        </section>
      <div class="two-col">
        <section class="panel">
          <div class="panel-head"><h2>Últimos 6 meses</h2><span class="src">Clique num mês para ver o fechamento</span></div>
          <div class="table-wrap"><table class="sims fin-table"><thead><tr><th>Mês</th><th class="num">Vendidos</th><th class="num">Faturamento</th><th class="num">Lucro bruto</th><th class="num">Despesas</th><th class="num">Lucro líquido</th></tr></thead><tbody>
            ${hist.slice().reverse().map((h) => `<tr data-ym="${h.ym}"${h.ym === finMonth ? ' class="current"' : ""}><td>${esc(F.monthLabel(h.ym))}</td><td class="num">${h.qtd}</td><td class="num">${money(h.faturamento)}</td><td class="num ${signClass(h.qtd ? h.lucroBruto : null)}">${money(h.lucroBruto)}</td><td class="num">${money(h.despesas)}</td><td class="num ${signClass(h.qtd || h.despesas ? h.lucroLiquido : null)}"><b>${money(h.lucroLiquido)}</b></td></tr>`).join("")}
          </tbody></table></div>
        </section>
        <section class="panel">
          <div class="panel-head"><h2>Para onde foi o dinheiro</h2></div>
          <div class="panel-body funnel fin-funnel">${saidas.length ? saidas.map(([k, v]) => `<div class="funnel-row"><span>${esc(k)}</span><span class="track"><i data-w="${(v / maxS) * 100}" style="background:${k.startsWith("Loja") ? "#7cc4ff" : "var(--orange)"}"></i></span><b>${money(v)}</b></div>`).join("") : `<p class="src" style="margin:0">Sem saídas neste mês.</p>`}
            ${m.compras.qtd ? `<p class="src" style="margin:8px 0 0">Também foram comprados ${m.compras.qtd} carro${m.compras.qtd === 1 ? "" : "s"} neste mês (${money(m.compras.valor)}). Esse valor entra no custo quando cada carro for vendido.</p>` : ""}
          </div>
        </section>
      </div>`;
    $$("tr[data-fcar]", body).forEach((tr) => tr.addEventListener("click", () => openFinDrawer(fin.cars.find((c) => c.id === tr.dataset.fcar))));
    $$("tr[data-ym]", body).forEach((tr) => tr.addEventListener("click", () => { finMonth = tr.dataset.ym; renderFinanceiro(el); }));
    $("[data-csv]", body).addEventListener("click", () => exportFechamento(m));
  }
  function exportFechamento(m) {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const n = (v) => (v == null ? "" : String(F.r2(v)).replace(".", ","));
    const row = (...cols) => cols.map(q).join(";");
    const lines = [
      row(`Fechamento Da Frota Veículos — ${F.monthLabel(m.ym)}`), "",
      row("Faturamento", n(m.faturamento)), row("Custo dos carros vendidos", n(m.custo)), row("Lucro bruto", n(m.lucroBruto)),
      row("Margem (%)", n(m.margem)), row("Despesas da loja", n(m.despesas)), row("Lucro líquido", n(m.lucroLiquido)), "",
      row("CARROS VENDIDOS"), row("Data venda", "Placa", "Veículo", "Ano", "Data compra", "Valor pago", "Gastos", "Custo total", "Valor venda", "Lucro", "Margem (%)", "Dias em estoque", "Comprador"),
      ...m.vendidos.map((c) => row(dmy(c.vendaData), fmtPlaca(c.placa), c.modelo, c.ano, dmy(c.compraData), n(c.compraValor), n(F.gastosTotal(c)), n(F.custoTotal(c)), n(c.vendaValor), n(F.lucro(c)), n(F.margem(c)), F.dias(c), c.comprador)), "",
      row("GASTOS DOS CARROS VENDIDOS"), row("Placa", "Data", "Tipo", "Descrição", "Valor"),
      ...m.vendidos.flatMap((c) => (c.gastos || []).map((g) => row(fmtPlaca(c.placa), dmy(g.data), g.tipo, g.desc, n(g.valor)))), "",
      row("DESPESAS DA LOJA"), row("Data", "Categoria", "Descrição", "Valor"),
      ...m.despesasLista.map((e) => row(dmy(e.data), e.categoria, e.desc, n(e.valor))),
    ];
    download(`fechamento-dafrota-${m.ym}.csv`, "﻿" + lines.join("\n"), "text/csv;charset=utf-8");
    toast("Planilha gerada.", "ok");
  }

  /* =========================================================
     Configurações
     ========================================================= */
  function storageUsed() { let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || "").length; } } catch {} return n * 2; }
  function renderConfig(el) {
    const S = settings();
    const used = storageUsed(), cap = 5 * 1024 * 1024;
    const note = ONLINE
      ? `<div class="note ok-note"><b>Conectado ao servidor.</b> Estoque, leads, fichas e senhas ficam salvos na hospedagem e aparecem em qualquer computador ou celular. Mesmo assim, baixe um backup de vez em quando.</div>`
      : `<div class="note"><b>Modo sem servidor:</b> estoque, leads e configurações ficam salvos <b>só neste navegador</b>. Ao subir o site na Hostinger, o painel passa a usar o servidor automaticamente.</div>`;
    el.innerHTML = `
      ${note}
      <div class="settings-grid">
        <section class="panel"><div class="panel-head"><h2>Contato</h2></div>
          <form class="panel-body" id="cfg-contact" style="display:grid;gap:16px" novalidate>
            <label class="field"><span>WhatsApp da loja (com DDI e DDD)</span><input id="c-wa" inputmode="numeric" value="${esc(S.whatsapp)}" placeholder="5561986030907"></label>
            <label class="field"><span>Instagram (sem @)</span><input id="c-ig" value="${esc(S.instagram)}"></label>
            <button class="button button-small" type="submit">Salvar contato</button>
          </form></section>
        <section class="panel"><div class="panel-head"><h2>Minha senha</h2></div>
          <form class="panel-body" id="cfg-pass" style="display:grid;gap:16px" novalidate>
            <label class="field"><span>Senha atual</span><input id="p-old" type="password" autocomplete="current-password"></label>
            <label class="field"><span>Nova senha (mín. 8 caracteres)</span><input id="p-new" type="password" autocomplete="new-password"></label>
            <label class="field"><span>Confirmar nova senha</span><input id="p-new2" type="password" autocomplete="new-password"></label>
            <button class="button button-small" type="submit">Trocar senha</button>
            ${USERS.filter((u) => u.id !== me).map((u) => `<div class="row-actions" data-reset-wrap="${u.id}" style="border-top:1px solid var(--line);padding-top:14px"><span class="src">${esc(u.name)} esqueceu a senha?</span><button class="mini-btn" type="button" data-reset="${u.id}">Liberar nova senha</button></div>`).join("")}
          </form></section>
        <section class="panel"><div class="panel-head"><h2>Backup e dados</h2></div>
          <div class="panel-body" style="display:grid;gap:16px">
            ${ONLINE ? "" : `<div class="field"><div class="range-head"><span class="field-label">Espaço usado</span><b>${(used / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB de ~5 MB</b></div><div class="storage-meter"><i style="width:${Math.min(100, (used / cap) * 100)}%"></i></div><small class="src">Fotos ocupam a maior parte. Exclua veículos vendidos antigos para liberar espaço.</small></div>`}
            <div class="row-actions"><button class="button button-small" id="bk-export" type="button">Baixar backup</button><label class="button button-ghost button-small" style="cursor:pointer">Restaurar backup<input type="file" id="bk-import" accept="application/json" hidden></label></div>
          </div></section>
      </div>`;

    $("#cfg-contact").addEventListener("submit", async (e) => {
      e.preventDefault(); const w = $("#c-wa").value.replace(/\D/g, "");
      if (w.length < 12) { toast("WhatsApp deve ter DDI + DDD + número. Ex.: 5561986030907", "err"); return; }
      try { await saveSettings({ whatsapp: w, instagram: $("#c-ig").value.trim().replace(/^@/, "") }); toast("Contato salvo. Já vale para o site.", "ok"); } catch (ex) { fail(ex); }
    });
    $("#cfg-pass").addEventListener("submit", async (e) => {
      e.preventDefault();
      const n = $("#p-new").value; if (n.length < 8) { toast("A nova senha precisa de 8 caracteres ou mais.", "err"); return; }
      if (n !== $("#p-new2").value) { toast("As senhas novas não conferem.", "err"); return; }
      try { await Auth.changePassword($("#p-old").value, n); e.target.reset(); toast("Sua senha foi alterada.", "ok"); } catch (ex) { toast(ex.message, "err"); }
    });
    $$("[data-reset]", el).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.reset, wrap = b.parentElement;
      wrap.innerHTML = `<span class="confirm-inline">Apagar a senha de ${esc(userName(id).split(" ")[0])}? No próximo acesso ele cria outra. <button class="btn-danger" type="button" data-reset-ok>Sim</button><button class="mini-btn" type="button" data-reset-no>Não</button></span>`;
      $("[data-reset-ok]", wrap).onclick = async () => { try { await Auth.reset(id); toast(`${userName(id).split(" ")[0]} vai criar uma nova senha no próximo acesso${ONLINE ? " (com o código de ativação)" : ""}.`, "ok"); render(); } catch (ex) { fail(ex); } };
      $("[data-reset-no]", wrap).onclick = () => render();
    }));
    $("#bk-export").addEventListener("click", async () => {
      let data;
      try { data = ONLINE ? await DF.call("backup") : { app: "dafrota", version: 2, exportedAt: new Date().toISOString(), vehicles: read("vehicles", []), leads: read("leads", []), settings: read("settings", {}), finCars: read("fin-cars", []), finExpenses: read("fin-expenses", []) }; }
      catch (ex) { fail(ex); return; }
      download(`backup-dafrota-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data), "application/json");
      toast("Backup gerado.", "ok");
    });
    $("#bk-import").addEventListener("change", async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (data.app !== "dafrota") throw new Error();
        if (ONLINE) await DF.call("restore", { method: "POST", body: data });
        else { write("vehicles", data.vehicles || []); write("leads", data.leads || []); write("settings", data.settings || {}); write("fin-cars", data.finCars || []); write("fin-expenses", data.finExpenses || []); }
        fin = null; await load(); toast("Backup restaurado.", "ok"); render();
      } catch { toast("Arquivo de backup inválido.", "err"); }
    });
  }

  /* ---------- Início ---------- */
  addEventListener("hashchange", () => { const h = location.hash.slice(1); if (!app.hidden && VIEWS[h] && h !== view) go(h); });
  Auth.current().then((u) => { if (u) { me = u; enter(); } else showLogin(); })
    .catch(() => { showLogin(); $("#login-error").textContent = "Não consegui falar com o servidor. Confira a internet e recarregue a página."; });
});
