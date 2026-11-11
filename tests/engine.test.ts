/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Suite do motor financeiro: datas, DRE em camadas, socios, projetos, projecao
 * de caixa, saude dos dados, fiscal (MEI x Simples), filtros e sugestao da
 * conciliacao. Os casos usam numeros reais da VX (set-nov/2026).
 *
 * Rodar: npm test
 */
import assert from "node:assert/strict";
import {
  accountStatement, cashPosition, cashProjection, clientConcentration, computeDre,
  dreMatrix, operatingBurn, partnerAccounts, projectResults,
} from "@/lib/analytics";
import { addDays, addMonthsToDate, diffDays, monthEnd, monthsBetween, todayISO } from "@/lib/dates";
import { runHealthChecks } from "@/lib/health";
import { apurarFiscal } from "@/lib/fiscal";
import { cashDate } from "@/lib/finance";
import { applyLedgerFilters, EMPTY_FILTERS, sortByCashDate } from "@/lib/ledger-filters";
import { suggestEntry } from "@/lib/reconciliation";

let n = 0;
const ok = (nome: string) => { n++; console.log(`  ok  ${nome}`); };

// ---- fabrica de lancamentos -------------------------------------------------
let seq = 0;
const cat = (name: string, dre_section = "operacional") => ({ name, color: "#000", dre_section });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tx(p: any): any {
  seq++;
  return {
    id: `t${String(seq).padStart(4, "0")}`, description: p.description ?? `lanc ${seq}`,
    amount: p.amount, type: p.type ?? "despesa", date: p.date, due_date: p.due_date ?? p.date,
    paid_date: (p.status ?? "pago") === "pago" ? (p.paid_date ?? p.date) : null,
    account_id: p.account_id ?? "inter", transfer_account_id: p.transfer_account_id ?? null,
    category_id: p.categories ? p.categories.name : null, project_id: p.project_id ?? null,
    client_id: p.client_id ?? null, partner_id: p.partner_id ?? null, status: p.status ?? "pago",
    attachment_url: p.attachment_url ?? null, recurrence_group: null, installment_no: null,
    installment_total: null, created_by: null, created_at: `2026-01-01T00:00:${String(seq % 60).padStart(2, "0")}Z`,
    updated_at: null, updated_by: null, accounts: { bank: "Inter" }, transfer_accounts: null,
    categories: p.categories ?? null, clients: p.client_id ? { company: "Finconsult" } : null,
    projects: null, partners: null,
  };
}

console.log("DATAS");
// 22:34 de 02/11 em Belem = 01:34 UTC de 03/11. O bug do print do usuario.
assert.equal(todayISO(new Date("2026-11-03T01:34:00Z")), "2026-11-02"); ok("22h34 em Belém ainda é dia 2 (era 3 em UTC)");
assert.equal(todayISO(new Date("2026-11-03T03:00:00Z")), "2026-11-03"); ok("meia-noite local vira o dia");
assert.equal(addMonthsToDate("2026-01-31", 1), "2026-02-28"); ok("parcela de 31/01 cai em 28/02, não estoura o mês");
assert.equal(addMonthsToDate("2026-11-20", 2), "2027-01-20"); ok("parcela atravessa o ano");
assert.equal(monthEnd("2028-02"), "2028-02-29"); ok("fevereiro bissexto");
assert.equal(addDays("2026-12-31", 1), "2027-01-01"); assert.equal(diffDays("2026-10-27", "2026-11-10"), 14); ok("soma e diferença de dias");
assert.deepEqual(monthsBetween("2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]); ok("lista de meses");

console.log("DRE EM CAMADAS (numeros reais de set-out/2026)");
const real = [
  tx({ date: "2026-09-03", type: "receita", amount: 68071.84, categories: cat("Serviço de consultoria"), client_id: "fin" }),
  tx({ date: "2026-10-21", type: "receita", amount: 63652.66, categories: cat("Serviço de consultoria"), client_id: "fin" }),
  tx({ date: "2026-09-30", paid_date: "2026-10-19", amount: 4084.30, categories: cat("Simples Nacional (DAS)", "imposto") }),
  tx({ date: "2026-09-03", amount: 6000, categories: cat("Prestadores de Serviço") }),
  tx({ date: "2026-09-10", amount: 400, categories: cat("Contabilidade") }),
  tx({ date: "2026-09-03", amount: 6000, categories: cat("Sócios / Distribuição", "distribuicao"), partner_id: "dj" }),
  tx({ date: "2026-10-21", amount: 14000, categories: cat("Sócios / Distribuição", "distribuicao"), partner_id: "dj" }),
  tx({ date: "2026-10-22", amount: 14000, categories: cat("Sócios / Distribuição", "distribuicao"), partner_id: "gl" }),
  tx({ date: "2026-10-21", amount: 13000, categories: cat("Sócios / Distribuição", "distribuicao"), partner_id: "fe" }),
  tx({ date: "2026-11-02", type: "receita", amount: 369.20, categories: cat("Rendimento de aplicações", "financeira"), account_id: "porq" }),
  tx({ date: "2026-11-02", amount: 132.49, categories: cat("IR/IOF sobre aplicações", "financeira"), account_id: "porq" }),
  tx({ date: "2026-09-27", type: "transferencia", amount: 40000, transfer_account_id: "porq" }),
  tx({ date: "2026-08-05", amount: 13.5, categories: cat("Transporte") }),
  tx({ date: "2026-08-05", amount: -13.5, categories: cat("Transporte") }),               // estorno
  tx({ date: "2026-07-26", type: "receita", amount: 68071.84, status: "cancelado", categories: cat("Serviço de consultoria") }),
  tx({ date: "2026-10-31", due_date: "2026-11-20", amount: 3819.17, status: "pendente", categories: cat("Simples Nacional (DAS)", "imposto") }),
];
const d = computeDre(real);
assert.equal(d.receitaBruta, 131724.5); ok("receita bruta ignora cancelado, transferência e rendimento");
assert.equal(d.impostos, 7903.47); ok("imposto pago + provisionado (competência) em linha própria");
assert.equal(d.receitaLiquida, 123821.03);
assert.equal(d.custos, 6400); ok("custo operacional: estorno abate a categoria (13,50 − 13,50 = 0)");
assert.equal(d.linhas.custos.find((l) => l.name === "Transporte")?.value, 0);
assert.equal(d.resultadoOperacional, 117421.03);
assert.equal(d.resultadoFinanceiro, 236.71); ok("resultado financeiro = rendimento − IR/IOF");
assert.equal(d.distribuicao, 47000); ok("distribuição fora do operacional");
assert.equal(d.lucroRetido, 70657.74); ok("lucro retido = operacional + financeiro − distribuição");
assert.equal(Math.round((d.receitaBruta - d.impostos - d.custos + d.resultadoFinanceiro - d.distribuicao) * 100) / 100, d.lucroRetido); ok("as camadas fecham entre si");

console.log("DRE MENSAL");
const m = dreMatrix(real, ["2026-08", "2026-09", "2026-10", "2026-11"]);
const linha = (k: string) => m.lines.find((l) => l.key === k)!;
assert.deepEqual(linha("receita").values, [0, 68071.84, 63652.66, 0]);
assert.equal(linha("receita").total, 131724.5);
assert.equal(Math.round(linha("retido").values.reduce((a, b) => a + b, 0) * 100) / 100, linha("retido").total); ok("soma dos meses = total, em toda a matriz");

console.log("SOCIOS");
const socios: any[] = [{ id: "dj", name: "Djalma", share: 40 }, { id: "gl", name: "Gleydson", share: 40 }, { id: "fe", name: "Felipe", share: 20 }];
const pa = partnerAccounts(real.filter((t) => t.status === "pago"), socios);
assert.equal(pa.somaParticipacao, 100);
assert.equal(pa.totalRetirado, 47000);
const dj = pa.contas.find((c) => c.id === "dj")!;
assert.equal(dj.retirado, 20000);
assert.equal(dj.direito, Math.round(pa.lucroDistribuivel * 0.4 * 100) / 100);
assert.equal(dj.saldo, Math.round((dj.direito - 20000) * 100) / 100); ok("direito = participação × lucro; saldo = direito − retirado");
const semShare = partnerAccounts(real, socios.map((s) => ({ ...s, share: 0 })));
assert.equal(semShare.somaParticipacao, 0); assert.equal(semShare.contas[0].direito, 0); ok("sem participação cadastrada o sistema não presume direito");

console.log("PROJETOS E CLIENTES");
const proj: any[] = [{ id: "bid", name: "Pesquisa BID", budget: 5000, contract_value: 131724.5, status: "ativo", clients: { company: "Finconsult" } }];
const comProjeto = real.map((t, i) => (i === 0 || i === 3 ? { ...t, project_id: "bid" } : t));
const pr = projectResults(comProjeto.filter((t) => t.status !== "cancelado"), proj);
assert.equal(pr[0].receita, 68071.84); assert.equal(pr[0].custo, 6000); assert.equal(pr[0].margem, 62071.84);
assert.equal(Math.round(pr[0].budgetUsedPct!), 120); ok("margem do projeto e estouro do custo orçado (120%)");
assert.equal(pr[pr.length - 1].id, null); ok("linha 'Sem projeto' expõe o que não foi atribuído");
const cc = clientConcentration(real);
assert.equal(cc.maiorPct, 100); assert.equal(cc.clientes[0].name, "Finconsult"); ok("concentração de receita: 100% Finconsult");

console.log("PROJECAO DE CAIXA (situacao real de 10/11)");
const bal: any[] = [
  { id: "inter", bank: "Inter", type: "corrente", is_active: true, current_balance: -7114.06, opening_balance: 0, last_movement: "2026-11-04" },
  { id: "porq", bank: "Inter CDB Porquinho", type: "investimento", is_active: true, current_balance: 61296.61, opening_balance: 59.9, last_movement: "2026-11-02" },
  { id: "cred", bank: "Inter CDB Crédito", type: "investimento", is_active: true, current_balance: 494.54, opening_balance: 42.87, last_movement: "2026-11-02" },
];
const pos = cashPosition(bal);
assert.equal(pos.disponivel, -7114.06); assert.equal(pos.aplicado, 61791.15); assert.equal(pos.total, 54677.09); ok("posição: disponível × aplicado");
const abertos = [
  tx({ date: "2026-10-31", due_date: "2026-11-20", amount: 3819.17, status: "pendente", description: "DAS" }),
  tx({ date: "2026-11-10", due_date: "2026-11-10", amount: 296.94, status: "pendente", description: "Fatura" }),
];
const pj = cashProjection(pos.disponivel, abertos, "2026-11-10", 90);
assert.equal(pj.eventos.length, 2); assert.equal(pj.eventos[0].description, "Fatura");
assert.equal(pj.saldoFinal, -11230.17); assert.equal(pj.resgateNecessario, 11230.17);
assert.equal(pj.primeiroNegativo, "2026-11-10"); ok("aponta resgate necessário de R$ 11.230,17 para cobrir a conta e os compromissos");
const pjOk = cashProjection(10000, abertos, "2026-11-10", 90);
assert.equal(pjOk.primeiroNegativo, null); assert.equal(pjOk.resgateNecessario, 0); ok("com caixa suficiente não acusa nada");
const vencido = cashProjection(100, [tx({ date: "2026-10-01", due_date: "2026-10-05", amount: 500, status: "pendente" })], "2026-11-10");
assert.equal(vencido.eventos[0].vencido, true); assert.equal(vencido.eventos[0].date, "2026-11-10"); ok("vencido entra como saída de hoje");

console.log("GASTO OPERACIONAL");
assert.equal(operatingBurn(real, ["2026-09", "2026-10"]), Math.round(((6400 + 4084.30) / 2) * 100) / 100); ok("burn sem distribuição (era 3x maior com ela)");

console.log("EXTRATO");
const ext = accountStatement(
  [tx({ date: "2026-10-21", type: "receita", amount: 63652.66 }), tx({ date: "2026-10-21", type: "transferencia", amount: 35000, transfer_account_id: "porq" }), tx({ date: "2026-10-22", type: "transferencia", amount: 14000, account_id: "porq", transfer_account_id: "inter" })],
  "inter", 5294.07 - 0);
assert.equal(ext[0].saldo, 68946.73); assert.equal(ext[1].saldo, 33946.73); assert.equal(ext[2].valor, 14000); assert.equal(ext[2].saldo, 47946.73); ok("saldo acumulado; resgate credita a conta de destino");

console.log("SAUDE DOS DADOS");
const issues = runHealthChecks({
  transactions: [...real, ...abertos, tx({ date: "2026-11-04", amount: 14000, categories: cat("Prestadores de Serviço") }), tx({ date: "2026-06-05", amount: 5250 })],
  balances: bal, partners: socios.map((s) => ({ ...s, share: 0 })), today: "2026-11-10",
});
const ids = issues.map((i) => i.id);
assert.ok(ids.includes("saldo-negativo-inter")); ok("detecta a conta Inter negativa (−7.114,06)");
assert.equal(issues[0].severity, "critico"); ok("críticos vêm primeiro");
assert.ok(ids.includes("sem-categoria")); ok("detecta lançamento sem categoria");
assert.ok(ids.includes("participacao-societaria")); ok("detecta participação societária ≠ 100%");
assert.ok(ids.includes("concentracao-receita")); ok("detecta concentração de receita");
assert.ok(ids.includes("sem-comprovante")); ok("detecta despesa relevante sem comprovante");
assert.ok(!ids.includes("vencidos")); ok("fatura que vence HOJE não é 'vencida' (era, com data em UTC)");
assert.ok(!ids.includes("das-nao-provisionado")); ok("DAS de outubro já lançado: sem alerta");
const semDas = runHealthChecks({ transactions: real.filter((t) => t.status !== "pendente"), balances: [], partners: [], today: "2026-11-10" });
assert.ok(semDas.some((i) => i.id === "das-nao-provisionado")); ok("sem o lançamento do DAS, o alerta de imposto aparece");

console.log("FISCAL: MEI x SIMPLES");
const comMei = [...real, tx({ date: "2026-02-03", type: "receita", amount: 81000, categories: cat("Serviço"), client_id: "fin" }),
  tx({ date: "2026-01-31", paid_date: "2026-02-18", amount: 86.05, categories: cat("Simples Nacional (DAS)", "imposto") })];
const fz = apurarFiscal(comMei, "2026-11-10");
const fev = fz.linhas.find((l) => l.mes === "2026-02")!;
assert.equal(fev.regime, "mei"); assert.equal(fev.devido, 0); assert.equal(fev.diferenca, 0); ok("fevereiro é período MEI: sem Simples a provisionar sobre os 81 mil");
const set = fz.linhas.find((l) => l.mes === "2026-09")!;
assert.equal(set.regime, "simples"); assert.equal(set.rbt12, 0); assert.equal(set.devido, 4084.30); assert.equal(set.lancado, 4084.30); assert.equal(set.diferenca, 0); ok("setembro: RBT12 zero como no PGDAS, DAS 4.084,30 lançado na competência");
const out = fz.linhas.find((l) => l.mes === "2026-10")!;
assert.equal(out.devido, 3819.17); assert.equal(out.lancado, 3819.17); assert.equal(Math.round(out.rbt12), 90762); ok("outubro: RBT12 proporcionalizada 90.762, DAS 3.819,17");
assert.equal(fz.emAberto, 0); ok("nada em aberto com os dois DAS lançados");
assert.equal(fz.mei.receita, 81000); assert.equal(fz.mei.receitaAno, 212724.5); assert.equal(fz.mei.excedeTolerancia, true); ok("receita do ano (212.724,50) > limite MEI + 20% (97.200): alerta para a contabilidade");
const hMei = runHealthChecks({ transactions: comMei, balances: [], partners: [], today: "2026-11-10" });
assert.ok(hMei.some((i) => i.id === "limite-mei")); ok("o alerta do limite do MEI aparece na Saúde dos dados");
// pagamento lancado na data do pagamento (mes seguinte): o acumulado nao acusa falso positivo
const naData = real.map((t) => (t.amount === 4084.30 ? { ...t, date: "2026-10-19" } : t));
assert.equal(apurarFiscal(naData, "2026-11-10").emAberto, 0); ok("DAS lançado na data do pagamento não gera alerta falso (acumulado)");

console.log("FILTROS");
const f = (p: any) => applyLedgerFilters(real, { ...EMPTY_FILTERS, ...p }).length;
assert.equal(f({ status: "ativos" }), real.length - 1); ok("'ativos' tira só o cancelado");
assert.equal(f({ secao: "distribuicao" }), 4); assert.equal(f({ socio: "dj" }), 2);
assert.equal(f({ q: "consultoria 63652,66" }), 1); ok("busca por texto + valor no formato brasileiro");
assert.equal(f({ q: "socios" }), 4); ok("busca ignora acento (socios → Sócios)");
assert.equal(f({ conta: "porq" }), 3); ok("filtro por conta pega as duas pontas da transferência");
assert.equal(f({ from: "2026-10-01", to: "2026-10-31", tipo: "despesa" }), 4); assert.equal(f({ min: "10000" }), 7);
assert.equal(applyLedgerFilters([tx({ date: "2026-06-05", amount: 5250 }), ...real], { ...EMPTY_FILTERS, categoria: "sem" }).length, 1); ok("'sem categoria' não conta transferência");

console.log("DATA DE CAIXA x COMPETENCIA");
// O caso do usuario: DAS de outubro (competencia 31/10) pago em 10/11, coberto
// por um resgate de CDB feito no mesmo dia. Na tela de caixa ele sumia de novembro.
const dasOut = tx({ date: "2026-10-31", due_date: "2026-11-20", paid_date: "2026-11-10", amount: 3819.17, categories: cat("Simples Nacional (DAS)", "imposto") });
const resgate = tx({ date: "2026-11-10", type: "transferencia", amount: 3800, account_id: "porq", transfer_account_id: "inter" });
const aberto = tx({ date: "2026-11-30", due_date: "2026-12-20", status: "pendente", amount: 500, categories: cat("Simples Nacional (DAS)", "imposto") });
assert.equal(cashDate(dasOut), "2026-11-10"); assert.equal(cashDate(aberto), "2026-12-20"); ok("pago vale a data do pagamento; em aberto, o vencimento");
const nov = { ...EMPTY_FILTERS, from: "2026-11-01", to: "2026-11-30" };
assert.equal(applyLedgerFilters([dasOut, resgate, aberto], nov, "caixa").length, 2); ok("caixa de novembro tem o DAS pago em 10/11 e o resgate");
assert.deepEqual(applyLedgerFilters([dasOut, resgate, aberto], nov).map((t: any) => t.id), [resgate.id, aberto.id]); ok("na competência o DAS continua em outubro (DRE não muda)");
assert.equal(applyLedgerFilters([dasOut], { ...EMPTY_FILTERS, from: "2026-10-01", to: "2026-10-31" }, "caixa").length, 0); ok("e não aparece no caixa de outubro");
assert.deepEqual(sortByCashDate([dasOut, resgate, aberto]).map((t: any) => t.id), [aberto.id, resgate.id, dasOut.id]); ok("lista ordenada pela data de caixa, mais recente primeiro");

console.log("SUGESTAO NA CONCILIACAO");
const hist: any[] = [
  { description: "Pix enviado - Marcela Stelmann Costa Da Silva", type: "despesa", status: "pago", category_id: "contab" },
  { description: "PIX ENVIADO - MARCELA STELMANN COST 22/07", type: "despesa", status: "pago", category_id: "contab" },
  { description: "Pix enviado - Receita Federal", type: "despesa", status: "pago", category_id: "das" },
];
let s = suggestEntry({ date: "2026-11-09", description: "Pix enviado  Marcela Stelmann Costa Da Silva", amount: -400 }, hist);
assert.equal(s.type, "despesa"); assert.equal(s.category_id, "contab"); ok("mesmo favorecido → mesma categoria do histórico");
s = suggestEntry({ date: "2026-11-04", description: "Resgate Cdb Porq Dd Pj Banco Inter S A", amount: 14000 }, hist);
assert.equal(s.type, "transferencia"); assert.equal(s.transfer, "resgate"); ok("resgate de CDB vira transferência, não receita");
s = suggestEntry({ date: "2026-11-04", description: "Aplicação Cdb Credito Banco Inter S A", amount: -200 }, hist);
assert.equal(s.transfer, "aplicacao"); ok("aplicação de CDB vira transferência, não despesa");
s = suggestEntry({ date: "2026-11-04", description: "Pix enviado Fulano Desconhecido", amount: -50 }, hist);
assert.equal(s.category_id, null); assert.equal(s.baseadoEm, 0); ok("favorecido novo: sem palpite");

console.log(`\n${n} verificações passaram.`);
