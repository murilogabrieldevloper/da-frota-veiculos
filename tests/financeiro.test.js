/* Testes dos cálculos do financeiro. Rode colando js/financeiro.js + este arquivo no console do navegador
 * (ou com Node: node tests/financeiro.test.js). Não precisa subir esta pasta para a hospedagem. */
(function () {
  const F = typeof window !== "undefined" && window.DFFin ? window.DFFin : require("../js/financeiro.js");
  const results = [];
  const eq = (name, got, want) => results.push({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });

  const cayenne = { compraData: "2026-09-01", compraValor: 700000, vendaData: "2026-10-10", vendaValor: 790000,
    gastos: [{ data: "2026-09-02", tipo: "Documentação", valor: 1234.56 }, { data: "2026-09-05", tipo: "Preparação", valor: 8500 }, { tipo: "Comissão", valor: 7900 }] };
  const bmw = { compraData: "2026-09-20", compraValor: 250000, vendaData: "2026-10-28", vendaValor: 285000, gastos: [{ tipo: "Documentação", valor: 900.1 }] };
  const hilux = { compraData: "2026-10-01", compraValor: 180000, gastos: [{ tipo: "Estética", valor: 600 }] };
  const prejuizo = { compraData: "2026-08-01", compraValor: 100000, vendaData: "2026-09-15", vendaValor: 95000, gastos: [] };
  const semVenda = { compraData: "2026-10-01", compraValor: 50000, vendaData: "2026-10-05", vendaValor: null, gastos: [] };
  const cars = [cayenne, bmw, hilux, prejuizo, semVenda];
  const despesas = [{ data: "2026-10-05", categoria: "Aluguel", valor: 8000 }, { data: "2026-10-05", categoria: "Salários", valor: 6000.5 },
    { data: "2026-10-20", categoria: "Anúncios", valor: 1500 }, { data: "2026-09-05", categoria: "Aluguel", valor: 8000 }];

  // por carro
  eq("gastos somam centavos sem erro de arredondamento", F.gastosTotal(cayenne), 17634.56);
  eq("custo total = compra + gastos", F.custoTotal(cayenne), 717634.56);
  eq("lucro do carro vendido", F.lucro(cayenne), 72365.44);
  eq("margem sobre o valor de venda", F.margem(cayenne), 9.16);
  eq("carro não vendido não tem lucro", F.lucro(hilux), null);
  eq("venda sem valor não conta como vendido", F.isSold(semVenda), false);
  eq("prejuízo fica negativo", F.lucro(prejuizo), -5000);
  eq("dias em estoque até a venda", F.dias(cayenne), 39);
  eq("dias em estoque até hoje (não vendido)", F.dias(hilux, "2026-10-15"), 14);

  // fechamento de outubro/2026
  const out = F.monthClose(cars, despesas, "2026-10");
  eq("vendidos no mês", out.qtd, 2);
  eq("faturamento", out.faturamento, 1075000);
  eq("custo dos vendidos", out.custo, 968534.66);
  eq("lucro bruto", out.lucroBruto, 106465.34);
  eq("margem do mês", out.margem, 9.9);
  eq("despesas da loja do mês", out.despesas, 15500.5);
  eq("lucro líquido = bruto − despesas", out.lucroLiquido, 90964.84);
  eq("despesas por categoria", out.despesasPorCat, { Aluguel: 8000, "Salários": 6000.5, "Anúncios": 1500 });
  eq("gastos dos vendidos por tipo", out.gastosPorTipo, { "Documentação": 2134.66, "Preparação": 8500, "Comissão": 7900 });
  eq("ticket médio", out.ticketMedio, 537500);
  eq("compras do mês", out.compras, { qtd: 2, valor: 230000 });

  // setembro: só o carro com prejuízo
  const set = F.monthClose(cars, despesas, "2026-09");
  eq("setembro: lucro líquido com prejuízo", set.lucroLiquido, -13000);
  eq("mês sem vendas tem margem nula", F.monthClose(cars, despesas, "2026-07").margem, null);

  // estoque e histórico
  const st = F.stock(cars, "2026-10-15");
  eq("estoque: quantidade", st.qtd, 2);
  eq("estoque: capital parado", st.capital, 230600);
  eq("addMonths vira o ano", F.addMonths("2026-11", 3), "2027-02");
  eq("addMonths volta o ano", F.addMonths("2026-01", -1), "2025-12");
  eq("histórico: 3 meses em ordem", F.history(cars, despesas, "2026-10", 3).map((m) => m.ym), ["2026-08", "2026-09", "2026-10"]);

  const failed = results.filter((r) => !r.ok);
  const summary = `${results.length - failed.length}/${results.length} testes passaram`;
  if (typeof console !== "undefined") { console.log(summary); failed.forEach((f) => console.log("FALHOU:", f.name, "→ veio", f.got, "esperado", f.want)); }
  if (typeof window !== "undefined") window.DFFinTest = { summary, failed };
})();
