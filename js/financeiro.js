/* Da Frota Veículos — cálculos do financeiro (sem tela; usado por consultor.js).
 *
 * Carro: { compraData, compraValor, gastos: [{ data, tipo, desc, valor }], vendaData, vendaValor, ... }
 * Despesa da loja: { data, categoria, desc, valor }
 * Datas no formato "AAAA-MM-DD"; mês no formato "AAAA-MM".
 */
(function () {
  "use strict";

  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  const sum = (arr, f) => r2(arr.reduce((s, x) => s + (+f(x) || 0), 0));
  const monthOf = (iso) => String(iso || "").slice(0, 7);
  const dayMs = 864e5;
  const toDate = (iso) => new Date(iso + "T12:00:00");
  const todayISO = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

  const gastosTotal = (c) => sum(c.gastos || [], (g) => g.valor);
  const custoTotal = (c) => r2((+c.compraValor || 0) + gastosTotal(c));
  const isSold = (c) => !!(c.vendaData && c.vendaValor != null);
  const lucro = (c) => (isSold(c) ? r2(c.vendaValor - custoTotal(c)) : null);
  const margem = (c) => (isSold(c) && c.vendaValor > 0 ? r2((lucro(c) / c.vendaValor) * 100) : null);
  function dias(c, today = todayISO()) {
    if (!c.compraData) return null;
    return Math.max(0, Math.round((toDate(isSold(c) ? c.vendaData : today) - toDate(c.compraData)) / dayMs));
  }
  const avg = (arr) => (arr.length ? r2(arr.reduce((s, x) => s + x, 0) / arr.length) : null);
  const groupSum = (items, key) => items.reduce((o, x) => ((o[x[key] || "Outros"] = r2((o[x[key] || "Outros"] || 0) + (+x.valor || 0))), o), {});

  function addMonths(ym, k) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + k, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }

  /* Fechamento do mês: carros vendidos no mês (pela data de venda) e despesas da loja do mês. */
  function monthClose(cars, expenses, ym) {
    const vendidos = cars.filter((c) => isSold(c) && monthOf(c.vendaData) === ym)
      .sort((a, b) => String(a.vendaData).localeCompare(String(b.vendaData)));
    const desp = expenses.filter((e) => monthOf(e.data) === ym);
    const comprados = cars.filter((c) => monthOf(c.compraData) === ym);
    const faturamento = sum(vendidos, (c) => c.vendaValor);
    const custo = sum(vendidos, custoTotal);
    const lucroBruto = r2(faturamento - custo);
    const despesas = sum(desp, (e) => e.valor);
    return {
      ym, vendidos, qtd: vendidos.length,
      faturamento, custo, lucroBruto,
      margem: faturamento > 0 ? r2((lucroBruto / faturamento) * 100) : null,
      ticketMedio: vendidos.length ? r2(faturamento / vendidos.length) : null,
      diasMedios: avg(vendidos.map((c) => dias(c)).filter((d) => d != null)),
      gastosPorTipo: groupSum(vendidos.flatMap((c) => c.gastos || []), "tipo"),
      despesasLista: desp, despesas, despesasPorCat: groupSum(desp, "categoria"),
      lucroLiquido: r2(lucroBruto - despesas),
      compras: { qtd: comprados.length, valor: sum(comprados, (c) => c.compraValor) },
    };
  }

  /* Estoque atual (carros comprados e ainda não vendidos) */
  function stock(cars, today = todayISO()) {
    const list = cars.filter((c) => !isSold(c));
    return { list, qtd: list.length, capital: sum(list, custoTotal), diasMedios: avg(list.map((c) => dias(c, today)).filter((d) => d != null)) };
  }

  /* Últimos n meses terminando em endYm (mais antigo primeiro) */
  function history(cars, expenses, endYm, n = 6) {
    return Array.from({ length: n }, (_, i) => monthClose(cars, expenses, addMonths(endYm, i - n + 1)));
  }

  const api = { r2, monthOf, todayISO, gastosTotal, custoTotal, isSold, lucro, margem, dias, addMonths, monthLabel, monthClose, stock, history,
    GASTO_TIPOS: ["Documentação", "Preparação", "Estética", "Comissão", "Frete", "Outros"],
    DESP_CATS: ["Aluguel", "Salários", "Anúncios", "Contador", "Água/Luz/Internet", "Impostos", "Outros"] };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.DFFin = api;
})();
