/* Da Frota Veículos — ficha de financiamento (o cliente envia os dados, a loja faz a análise nos bancos) */
window.DF.ready.then(function () {
  "use strict";
  const { settings, getVehicles, addLead, fichaTexto, brl, num, wa, maskPhone, maskCPF, validCPF, maskMoney, esc, toast } = window.DF;
  const S = settings();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Cabeçalho e menu ---------- */
  $$("[data-wa]").forEach((a) => (a.href = wa(a.dataset.wa)));
  $$("[data-ig]").forEach((a) => (a.href = "https://instagram.com/" + S.instagram));
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
  const header = $(".site-header"), bar = $(".scroll-progress");
  addEventListener("scroll", () => {
    header.classList.toggle("scrolled", scrollY > 40);
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? scrollY / h : 0})`;
  }, { passive: true });
  const toggle = $(".menu-toggle");
  toggle.addEventListener("click", () => { const o = document.body.classList.toggle("menu-open"); toggle.setAttribute("aria-expanded", o); });

  /* ---------- Estado ---------- */
  const st = { step: 1, vehicleId: null, cnh: "Sim", troca: "Não" };
  let vehicles = [];
  const val = (id) => ($("#" + id)?.value || "").trim();

  /* ---------- Máscaras ---------- */
  $("#cpf").addEventListener("input", (e) => (e.target.value = maskCPF(e.target.value)));
  $("#whats").addEventListener("input", (e) => (e.target.value = maskPhone(e.target.value)));
  ["renda", "outra-renda", "valor", "entrada"].forEach((id) => $("#" + id).addEventListener("input", (e) => (e.target.value = maskMoney(e.target.value))));
  $("#cep").addEventListener("input", (e) => {
    const d = e.target.value.replace(/\D/g, "").slice(0, 8);
    e.target.value = d.length > 5 ? d.slice(0, 5) + "-" + d.slice(5) : d;
    if (d.length === 8) buscaCEP(d);
  });

  // Preenche o endereço pelo CEP (ViaCEP). Se não conseguir, o cliente digita.
  async function buscaCEP(cep) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (j.erro) { setErr("f-cep", "CEP não encontrado. Confira ou preencha o endereço."); return; }
      setErr("f-cep", "");
      if (j.logradouro && !val("rua")) $("#rua").value = j.logradouro;
      if (j.bairro && !val("bairro")) $("#bairro").value = j.bairro;
      if (j.localidade) $("#cidade").value = `${j.localidade} / ${j.uf}`;
      (val("rua") ? $("#numero") : $("#rua")).focus();
      progress();
    } catch { /* sem internet ou bloqueado: preenchimento manual */ }
  }

  /* ---------- Chips ---------- */
  $$("[data-chipgroup]").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest("[data-val]"); if (!b) return;
    $$("[data-val]", g).forEach((x) => x.setAttribute("aria-pressed", x === b));
    st[g.dataset.chipgroup] = b.dataset.val;
    if (g.dataset.chipgroup === "troca") $("#f-troca").hidden = b.dataset.val !== "Sim";
  }));

  /* ---------- Escolha do veículo ---------- */
  function renderPick() {
    $("#vehicle-pick").innerHTML = vehicles.map((v) => `<button type="button" data-v="${esc(v.id)}" aria-pressed="${st.vehicleId === v.id}">
        <img src="${esc(v.coverImage)}" alt="" loading="lazy"><span>${esc(v.title)}<small>${v.price ? brl(v.price) : "Valor sob consulta"}</small></span></button>`).join("") +
      `<button type="button" class="other" data-v="" aria-pressed="${st.vehicleId === null}"><i>+</i><span>Outro veículo<small>Digito o modelo</small></span></button>`;
  }
  $("#vehicle-pick").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (b) selectVehicle(b.dataset.v || null); });
  function selectVehicle(id) {
    st.vehicleId = id;
    const v = vehicles.find((x) => x.id === id);
    if (v) { $("#modelo").value = [v.title, v.year].filter(Boolean).join(" "); $("#valor").value = v.price ? maskMoney(Math.round(v.price)) : ""; }
    else if (vehicles.some((x) => val("modelo").startsWith(x.title))) { $("#modelo").value = ""; $("#valor").value = ""; $("#modelo").focus(); }
    renderPick(); progress();
  }
  $("#modelo").addEventListener("input", () => { if (st.vehicleId) { st.vehicleId = null; renderPick(); } });

  /* ---------- Progresso da ficha ---------- */
  const REQUIRED = ["nome", "cpf", "nasc", "civil", "mae", "whats", "cep", "moradia", "rua", "numero", "bairro", "cidade", "ocupacao", "renda", "modelo"];
  function progress() {
    const done = REQUIRED.filter((id) => val(id)).length;
    const p = Math.round((done / REQUIRED.length) * 100);
    $("#progress-txt").textContent = p + "%";
    const b = $("#progress-bar"); b.style.width = p + "%"; b.style.background = p === 100 ? "var(--ok)" : "var(--orange)";
  }
  $("#ficha").addEventListener("input", progress);
  $("#ficha").addEventListener("change", progress);

  /* ---------- Validação ---------- */
  function setErr(id, msg) {
    const f = $("#" + id); if (!f) return !msg;
    f.classList.remove("invalid"); void f.offsetWidth;
    const e = $(".error", f); if (e) e.textContent = msg || "";
    if (msg) f.classList.add("invalid");
    return !msg;
  }
  function age(iso) { if (!iso) return null; const b = new Date(iso + "T12:00:00"), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; }
  const fullName = (s) => s.split(/\s+/).filter(Boolean).length >= 2;
  function validate(step) {
    const checks = {
      1: [
        ["f-nome", fullName(val("nome")) ? "" : "Informe nome e sobrenome."],
        ["f-cpf", validCPF(val("cpf")) ? "" : "CPF inválido."],
        ["f-nasc", (() => { const a = age(val("nasc")); return a == null ? "Informe a data de nascimento." : a < 18 ? "É preciso ter 18 anos ou mais." : a > 100 ? "Confira a data." : ""; })()],
        ["f-civil", val("civil") ? "" : "Selecione o estado civil."],
        ["f-mae", fullName(val("mae")) ? "" : "Informe o nome completo da mãe."],
        ["f-whats", val("whats").replace(/\D/g, "").length >= 10 ? "" : "WhatsApp com DDD."],
        ["f-email", !val("email") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val("email")) ? "" : "E-mail inválido."],
      ],
      2: [
        ["f-cep", val("cep").replace(/\D/g, "").length === 8 ? "" : "CEP com 8 números."],
        ["f-moradia", val("moradia") ? "" : "Selecione o tipo de moradia."],
        ["f-rua", val("rua").length >= 3 ? "" : "Informe o endereço."],
        ["f-numero", val("numero") ? "" : "Informe o número."],
        ["f-bairro", val("bairro") ? "" : "Informe o bairro."],
        ["f-cidade", val("cidade") ? "" : "Informe cidade e UF."],
        ["f-ocup", val("ocupacao") ? "" : "Selecione sua ocupação."],
        ["f-renda", num(val("renda")) > 0 ? "" : "Informe sua renda mensal."],
      ],
      3: [
        ["f-modelo", val("modelo").length >= 2 ? "" : "Informe o veículo ou escolha um acima."],
        ["f-entrada", !val("valor") || num(val("entrada")) <= num(val("valor")) ? "" : "A entrada não pode ser maior que o valor do veículo."],
      ],
    }[step];
    let ok = true;
    checks.forEach(([id, msg]) => { ok = setErr(id, msg) && ok; });
    if (!ok) { $(".invalid input, .invalid select")?.focus(); toast("Confira os campos destacados.", "err"); }
    return ok;
  }

  /* ---------- Etapas ---------- */
  function go(step) {
    if (step > st.step) for (let s = st.step; s < step; s++) if (!validate(s)) { show(s); return; }
    show(step);
  }
  function show(step) {
    st.step = step;
    $$("[data-step]").forEach((p) => (p.hidden = +p.dataset.step !== step));
    $$(".stepper li").forEach((li, i) => { li.classList.toggle("current", i + 1 === step); li.classList.toggle("done", i + 1 < step); });
    const top = $("#ficha").getBoundingClientRect().top + scrollY - 110;
    if (scrollY > top) scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  }
  $$("[data-next]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.next)));
  $$("[data-goto]").forEach((b) => b.addEventListener("click", () => go(+b.dataset.goto)));

  /* ---------- Envio ---------- */
  function ficha() {
    return {
      nome: val("nome"), cpf: val("cpf"), nascimento: val("nasc"), rg: val("rg"), estadoCivil: val("civil"), mae: val("mae"),
      whatsapp: val("whats"), email: val("email"), cnh: st.cnh,
      cep: val("cep"), endereco: val("rua"), numero: val("numero"), complemento: val("compl"), bairro: val("bairro"), cidade: val("cidade"),
      moradia: val("moradia"), tempoResidencia: val("tempo-res"),
      ocupacao: val("ocupacao"), empresa: val("empresa"), cargo: val("cargo"), tempoEmprego: val("tempo-emp"),
      renda: num(val("renda")), outraRenda: num(val("outra-renda")) || null,
      veiculo: val("modelo"), valorVeiculo: num(val("valor")) || null, entrada: num(val("entrada")) || null, prazo: val("prazo"),
      troca: st.troca, trocaModelo: val("troca-modelo"), obs: val("obs"),
    };
  }

  $("#ficha").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (st.step !== 3) { go(st.step + 1); return; }
    for (const s of [1, 2, 3]) if (!validate(s)) { show(s); return; }
    if (!$("#lgpd").checked) { setErr("f-lgpd", "x"); toast("Marque a autorização para podermos enviar sua ficha aos bancos.", "err"); return; }
    const btn = $("button[type=submit]", e.target); btn.disabled = true; btn.textContent = "Enviando…";
    const f = ficha();
    const res = await addLead({
      name: f.nome, phone: f.whatsapp, email: f.email, vehicle: f.veiculo, vehicleId: st.vehicleId,
      source: "ficha", message: "Ficha de financiamento enviada pelo site.", ficha: f,
    });
    btn.disabled = false; btn.textContent = "Enviar minha ficha";
    $$("[data-step]").forEach((p) => (p.hidden = true));
    $(".stepper").hidden = true;
    $("#done").hidden = false;
    if (res.delivered) {
      // A loja já recebeu a ficha pelo servidor: o WhatsApp é só um aviso
      $("#done-title").innerHTML = "Ficha <em>recebida!</em>";
      $("#done-txt").textContent = "Vamos analisar nos bancos e falar com você pelo WhatsApp. Já vá separando os documentos da lista ao lado.";
      $("#done-wa").textContent = "Avisar no WhatsApp ↗";
      $("#done-wa").href = wa(`Olá! Sou ${f.nome} e acabei de enviar minha ficha de financiamento pelo site para o ${f.veiculo}.`);
    } else {
      // Sem servidor: a ficha completa vai pelo WhatsApp da loja
      $("#done-title").innerHTML = "Falta só <em>um toque.</em>";
      $("#done-txt").textContent = "Toque no botão abaixo para enviar sua ficha para a nossa equipe pelo WhatsApp. A mensagem já vai preenchida, é só enviar.";
      $("#done-wa").textContent = "Enviar ficha pelo WhatsApp ↗";
      $("#done-wa").href = wa(fichaTexto(f));
    }
    $("#done").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  });

  /* ---------- Início ---------- */
  getVehicles().then((list) => {
    vehicles = list;
    const pre = new URLSearchParams(location.search).get("v");
    if (pre && vehicles.some((v) => v.id === pre)) selectVehicle(pre); else renderPick();
  });
  progress();
});
