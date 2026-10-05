/* Da Frota Veículos — página inicial */
window.DF.ready.then(function () {
  "use strict";
  const DF = window.DF;
  const { settings, getVehicles, addLead, brl, wa, maskPhone, esc, toast } = window.DF;
  const S = settings();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- Links dinâmicos ---------- */
  $$("[data-wa]").forEach((a) => (a.href = wa(a.dataset.wa)));
  $$("[data-ig]").forEach((a) => (a.href = "https://instagram.com/" + S.instagram));
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------- Pré-carregamento (só na primeira visita da sessão) ---------- */
  const pre = $(".preloader");
  let seen = false; try { seen = sessionStorage.getItem("df-pre") === "1"; sessionStorage.setItem("df-pre", "1"); } catch {}
  if (pre) {
    if (seen || reduce) pre.remove();
    else {
      const done = () => { pre.classList.add("done"); setTimeout(() => pre.remove(), 950); };
      const t = setTimeout(done, 1100);
      window.addEventListener("load", () => { clearTimeout(t); setTimeout(done, 400); }, { once: true });
    }
  }

  /* ---------- Cabeçalho, progresso e parallax ---------- */
  const header = $(".site-header");
  const bar = $(".scroll-progress");
  const heroBg = $(".hero-backdrop");
  const parallax = $$("[data-parallax]");
  let lastY = 0, ticking = false;
  function onScroll() {
    const y = scrollY;
    header.classList.toggle("scrolled", y > 40);
    header.classList.toggle("hide", y > 500 && y > lastY && !document.body.classList.contains("menu-open"));
    lastY = y;
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${h > 0 ? y / h : 0})`;
    if (!reduce) {
      if (heroBg && y < innerHeight * 1.2) heroBg.style.transform = `translateY(${y * 0.3}px)`;
      parallax.forEach((el) => {
        const r = el.parentElement.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) el.style.transform = `translateY(${(r.top + r.height / 2 - innerHeight / 2) * -(+el.dataset.parallax)}px)`;
      });
    }
    ticking = false;
  }
  addEventListener("scroll", () => { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();

  // Link ativo no menu conforme a seção visível
  const navLinks = $$(".nav-links a[href^='#']");
  const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  $$("main section[id]").forEach((s) => spy.observe(s));

  /* ---------- Menu mobile ---------- */
  const toggle = $(".menu-toggle");
  toggle.addEventListener("click", () => {
    const open = document.body.classList.toggle("menu-open");
    toggle.setAttribute("aria-expanded", open);
    toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  });
  $$(".nav-links a").forEach((a) => a.addEventListener("click", () => { document.body.classList.remove("menu-open"); toggle.setAttribute("aria-expanded", "false"); }));

  /* ---------- Revelação ao rolar (só para o que está fora da tela no carregamento) ---------- */
  const revealIO = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add("in"); revealIO.unobserve(e.target); }
  }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
  function setupReveal(root = document) {
    if (reduce) return;
    $$("[data-reveal]:not(.in)", root).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < innerHeight * 0.92 && r.bottom > 0) { el.classList.add("in"); return; }
      revealIO.observe(el);
    });
  }
  document.documentElement.classList.add("reveal-ready");
  setupReveal();

  /* ---------- Contador animado ---------- */
  function countUp(el, to) {
    if (reduce || !("IntersectionObserver" in window)) { el.textContent = to; return; }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return; io.disconnect();
      const t0 = performance.now(), dur = 1200;
      const step = (t) => { const p = Math.min(1, (t - t0) / dur); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    io.observe(el);
  }

  /* ---------- Estoque ---------- */
  const CATS = ["Todos", "SUV", "Sedã", "Hatch", "Picape", "Outros"];
  let vehicles = [], filter = "Todos";
  const grid = $(".vehicle-grid"), filterRow = $(".filter-row");

  const specLine = (v) => [v.year, v.mileage != null ? Number(v.mileage).toLocaleString("pt-BR") + " km" : null, v.transmission, v.fuel].filter(Boolean).join(" · ") || "Veículo selecionado";

  function renderFilters() {
    const counts = Object.fromEntries(CATS.map((c) => [c, c === "Todos" ? vehicles.length : vehicles.filter((v) => (CATS.includes(v.category) ? v.category : "Outros") === c).length]));
    filterRow.innerHTML = CATS.filter((c) => c === "Todos" || counts[c] > 0 || ["SUV", "Sedã", "Picape"].includes(c))
      .map((c) => `<button class="filter${c === filter ? " active" : ""}" type="button" data-cat="${c}" aria-pressed="${c === filter}">${c}<span class="count">${counts[c]}</span></button>`).join("");
  }

  function cardHTML(v, i) {
    const badge = v.status === "reservado" ? `<span class="badge reserved">Reservado</span>` :
      v.featured ? `<span class="badge">Destaque Da Frota</span>` : `<span class="badge muted">Seleção Da Frota</span>`;
    const price = v.price ? `<div class="vehicle-price">${brl(v.price)}<small>Aceitamos financiamento</small></div>` : `<div class="vehicle-price" style="font-size:18px">Consulte condições</div>`;
    return `<article class="vehicle-card entering" style="animation-delay:${i * 70}ms" data-id="${esc(v.id)}">
      <img src="${esc(v.coverImage)}" alt="${esc(v.title)}" loading="lazy">
      <div class="vehicle-content">
        ${badge}
        <h3>${esc(v.title)}</h3>
        <p class="vehicle-specs">${esc(specLine(v))}</p>
        ${price}
        <div class="vehicle-actions">
          <button class="button button-ghost button-small" type="button" data-open="${esc(v.id)}">Ver anúncio</button>
          <a class="text-link" href="${wa(`Olá! Quero saber mais sobre ${v.title}.`)}" target="_blank" rel="noreferrer">Tenho interesse <span aria-hidden="true">↗</span></a>
        </div>
      </div></article>`;
  }

  function renderGrid(animateOut) {
    const list = filter === "Todos" ? vehicles : vehicles.filter((v) => (CATS.includes(v.category) ? v.category : "Outros") === filter);
    const paint = () => {
      grid.innerHTML = list.length ? list.map(cardHTML).join("") :
        `<div class="empty-state">Nenhum ${esc(filter)} disponível agora. <a class="text-link" href="${wa(`Olá! Procuro um ${filter}.`)}" target="_blank" rel="noreferrer">Peça para a equipe buscar <span>↗</span></a></div>`;
      bindTilt();
    };
    if (animateOut && !reduce && grid.children.length) {
      [...grid.children].forEach((c) => c.classList.add("leaving"));
      setTimeout(paint, 280);
    } else paint();
  }

  filterRow.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b || b.dataset.cat === filter) return;
    filter = b.dataset.cat; renderFilters(); renderGrid(true);
  });
  grid.addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) openModal(b.dataset.open); });

  // Inclinação 3D com brilho que segue o cursor
  function bindTilt() {
    if (reduce || matchMedia("(hover: none)").matches) return;
    $$(".vehicle-card", grid).forEach((card) => {
      card.addEventListener("animationend", () => card.classList.remove("entering"), { once: true });
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--ry", (x - 0.5) * 8 + "deg");
        card.style.setProperty("--rx", (0.5 - y) * 6 + "deg");
        card.style.setProperty("--mx", x * 100 + "%");
        card.style.setProperty("--my", y * 100 + "%");
      });
      card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
    });
  }

  getVehicles().then((list) => {
    vehicles = list;
    renderFilters(); renderGrid();
    $$("[data-count-stock]").forEach((el) => (el.hasAttribute("data-countup") ? countUp(el, vehicles.length) : (el.textContent = vehicles.length)));
  });

  /* ---------- Modal do anúncio ---------- */
  let modalEl = null, lastFocus = null;
  function openModal(id) {
    const v = vehicles.find((x) => x.id === id); if (!v) return;
    lastFocus = document.activeElement;
    const gallery = v.gallery?.length ? v.gallery : [v.coverImage];
    let idx = 0;
    const specs = [["Ano", v.year], ["Quilometragem", v.mileage != null ? Number(v.mileage).toLocaleString("pt-BR") + " km" : null], ["Câmbio", v.transmission], ["Combustível", v.fuel], ["Cor", v.color], ["Categoria", v.category]].filter(([, val]) => val);
    modalEl = document.createElement("div");
    modalEl.className = "modal-backdrop";
    modalEl.innerHTML = `<section class="vehicle-modal" role="dialog" aria-modal="true" aria-label="Anúncio: ${esc(v.title)}">
      <button class="modal-close" type="button" aria-label="Fechar anúncio">×</button>
      <div class="vehicle-gallery">
        <div class="gallery-main"><img src="${esc(gallery[0])}" alt="${esc(v.title)}">
          ${gallery.length > 1 ? `<button class="gallery-nav prev" type="button" aria-label="Foto anterior">‹</button><button class="gallery-nav next" type="button" aria-label="Próxima foto">›</button>` : ""}
        </div>
        ${gallery.length > 1 ? `<div class="gallery-thumbs">${gallery.map((g, i) => `<button type="button" class="${i ? "" : "active"}" data-i="${i}" aria-label="Ver foto ${i + 1}"><img src="${esc(g)}" alt=""></button>`).join("")}</div>` : ""}
      </div>
      <div class="vehicle-modal-copy">
        ${v.status === "reservado" ? `<span class="badge reserved">Reservado</span>` : `<span class="badge">${v.featured ? "Destaque Da Frota" : "Seleção Da Frota"}</span>`}
        <p class="modal-category">${esc(v.brand || v.category)}</p>
        <h2>${esc(v.title)}</h2>
        <p class="modal-price">${v.price ? brl(v.price) : "Consulte as condições"}</p>
        <p class="modal-description">${esc(v.description || "Fale com a nossa equipe para conhecer todos os detalhes deste veículo.")}</p>
        ${specs.length ? `<dl class="spec-grid">${specs.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join("")}</dl>` : ""}
        <a class="button" href="${wa(`Olá! Quero este veículo: ${v.title}.`)}" target="_blank" rel="noreferrer">Quero este veículo <span aria-hidden="true">↗</span></a>
        <a class="button button-ghost" href="financiamento.html?v=${encodeURIComponent(v.id)}">Financiar este veículo</a>
        <p class="modal-note">Sem compromisso. Nossa equipe retorna rapidamente.</p>
      </div></section>`;
    document.body.appendChild(modalEl);
    document.body.style.overflow = "hidden";
    const img = $(".gallery-main img", modalEl);
    const show = (i) => {
      idx = (i + gallery.length) % gallery.length;
      img.style.animation = "none"; img.offsetHeight; img.style.animation = "";
      img.src = gallery[idx];
      $$(".gallery-thumbs button", modalEl).forEach((b, j) => b.classList.toggle("active", j === idx));
    };
    modalEl.addEventListener("mousedown", (e) => { if (e.target === modalEl) closeModal(); });
    modalEl.addEventListener("click", (e) => {
      if (e.target.closest(".modal-close")) closeModal();
      else if (e.target.closest(".gallery-nav.prev")) show(idx - 1);
      else if (e.target.closest(".gallery-nav.next")) show(idx + 1);
      else if (e.target.closest("[data-i]")) show(+e.target.closest("[data-i]").dataset.i);
    });
    // Deslizar para trocar foto no celular
    let sx = null;
    img.addEventListener("touchstart", (e) => (sx = e.touches[0].clientX), { passive: true });
    img.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 40) show(idx + (dx < 0 ? 1 : -1)); sx = null; });
    modalEl._key = (e) => { if (e.key === "Escape") closeModal(); if (e.key === "ArrowRight") show(idx + 1); if (e.key === "ArrowLeft") show(idx - 1); };
    addEventListener("keydown", modalEl._key);
    $(".modal-close", modalEl).focus();
  }
  function closeModal() {
    if (!modalEl) return;
    const el = modalEl; modalEl = null;
    removeEventListener("keydown", el._key);
    el.classList.add("closing");
    setTimeout(() => { el.remove(); document.body.style.overflow = ""; lastFocus?.focus?.(); }, reduce ? 0 : 240);
  }

  /* ---------- Formulário de contato ---------- */
  const form = $("#lead-form");
  const phoneIn = $("#lf-phone");
  phoneIn.addEventListener("input", () => (phoneIn.value = maskPhone(phoneIn.value)));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    let ok = true;
    [["#lf-name", (v) => v.trim().length >= 2], ["#lf-phone", (v) => v.replace(/\D/g, "").length >= 10]].forEach(([sel, test]) => {
      const inp = $(sel), f = inp.closest(".field");
      f.classList.remove("invalid"); void f.offsetWidth;
      if (!test(inp.value)) { f.classList.add("invalid"); ok = false; }
    });
    if (!ok) { toast("Confira nome e WhatsApp.", "err"); return; }
    const btn = $("button[type=submit]", form); btn.disabled = true; btn.textContent = "Enviando…";
    const res = await addLead({ name: $("#lf-name").value.trim(), phone: phoneIn.value, message: $("#lf-message").value.trim(), source: "formulario" });
    btn.disabled = false; btn.textContent = "Enviar interesse";
    if (DF.isOnline() && !res.delivered) { toast(res.error || "Não consegui enviar agora. Tente de novo ou chame no WhatsApp.", "err"); return; }
    form.reset();
    $(".form-success", form).hidden = false;
  });

  /* ---------- Chat de atendimento ---------- */
  const chatBox = $(".chat-messages"), chatForm = $(".chat-form"), chatInput = $("#chat-input");
  let stage = "interest"; const lead = { interest: "", name: "", phone: "" };
  function bot(text, extra) {
    const typing = document.createElement("div"); typing.className = "typing"; typing.innerHTML = "<i></i><i></i><i></i>";
    chatBox.appendChild(typing); chatBox.scrollTop = chatBox.scrollHeight;
    setTimeout(() => {
      typing.remove();
      const p = document.createElement("p"); p.className = "message"; p.textContent = text; chatBox.appendChild(p);
      if (extra) chatBox.appendChild(extra);
      chatBox.scrollTop = chatBox.scrollHeight;
    }, reduce ? 0 : 650);
  }
  function user(text) { const p = document.createElement("p"); p.className = "message user"; p.textContent = text; chatBox.appendChild(p); chatBox.scrollTop = chatBox.scrollHeight; }
  function quick(options) {
    const d = document.createElement("div"); d.className = "quick-replies";
    options.forEach((o) => { const b = document.createElement("button"); b.type = "button"; b.textContent = o; b.onclick = () => { d.remove(); handle(o); }; d.appendChild(b); });
    return d;
  }
  async function handle(text) {
    if (!text || stage === "done") return;
    user(text);
    if (stage === "interest") {
      if (/financ|parcel|simul/i.test(text)) {
        const a = document.createElement("a"); a.className = "button button-small chat-whatsapp"; a.href = "financiamento.html"; a.textContent = "Abrir ficha de financiamento →";
        bot("Para financiar, é só preencher nossa ficha. A equipe consulta os bancos e te chama no WhatsApp.", a);
        return;
      }
      lead.interest = text;
      stage = "name"; bot("Ótima escolha. Como posso te chamar?"); return;
    }
    if (stage === "name") { lead.name = text; stage = "phone"; bot(`Prazer, ${text.split(" ")[0]}! Qual é o seu WhatsApp para um consultor continuar o atendimento?`); return; }
    if (stage === "phone") {
      if (text.replace(/\D/g, "").length < 10) { bot("Pode me passar o número com DDD? Ex.: (61) 99999-9999"); return; }
      lead.phone = maskPhone(text); stage = "done"; chatForm.hidden = true;
      await addLead({ name: lead.name, phone: lead.phone, vehicle: lead.interest, message: "Lead captado pelo atendimento do site.", source: "assistente" });
      const a = document.createElement("a"); a.className = "button button-small chat-whatsapp"; a.target = "_blank"; a.rel = "noreferrer";
      a.href = wa(`Olá! Sou ${lead.name} e tenho interesse em ${lead.interest}. Meu WhatsApp é ${lead.phone}.`); a.textContent = "Falar no WhatsApp ↗";
      bot("Pronto! Seu interesse foi registrado. Toque no botão para atendimento imediato.", a);
    }
  }
  function startChat() {
    if (chatBox.children.length) return;
    const names = vehicles.slice(0, 2).map((v) => v.title);
    bot("Olá! Sou o atendimento da Da Frota. Qual veículo chamou sua atenção?", quick([...names, "Quero financiar"]));
  }
  $(".chat-toggle").addEventListener("click", () => { document.body.classList.add("chat-open"); startChat(); setTimeout(() => chatInput.focus(), 300); });
  $(".chat-close").addEventListener("click", () => { document.body.classList.remove("chat-open"); $(".chat-toggle").focus(); });
  chatForm.addEventListener("submit", (e) => { e.preventDefault(); const t = chatInput.value.trim(); chatInput.value = ""; $(".quick-replies", chatBox)?.remove(); handle(t); });

  /* ---------- Botões magnéticos (desktop) ---------- */
  if (!reduce && matchMedia("(hover: hover)").matches) {
    $$(".hero .button, .finance-band .button").forEach((b) => {
      b.addEventListener("pointermove", (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.3 - 2}px)`; });
      b.addEventListener("pointerleave", () => (b.style.transform = ""));
    });
  }
});
