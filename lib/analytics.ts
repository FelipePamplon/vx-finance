import { signedAmountForAccount } from "@/lib/finance";
import { round2 } from "@/lib/format";
import { addDays, monthKey } from "@/lib/dates";
import type {
  AccountBalance,
  DreSection,
  Partner,
  Project,
  TransactionWithRelations,
} from "@/types/database";

/**
 * Calculos gerenciais, num lugar so.
 *
 * Painel, DRE, DRE mensal, projetos e socios faziam (ou fariam) cada um a sua
 * conta. Foi assim que o painel passou a mostrar "burn rate" com distribuicao
 * de lucro dentro enquanto o DRE ja a tratava abaixo do resultado: duas telas,
 * dois numeros para a mesma pergunta. Aqui a regra e unica e as telas so
 * exibem.
 *
 * Convencao: quem chama decide o recorte (periodo, status). As funcoes nao
 * filtram cancelados nem pendentes por conta propria, exceto onde o nome diz.
 */

type Row = TransactionWithRelations;

export function sectionOf(t: Pick<Row, "categories">): DreSection {
  return t.categories?.dre_section ?? "operacional";
}

/** Lancamento que vale para resultado: tudo menos cancelado e transferencia. */
export function countsForResult(t: Pick<Row, "status" | "type">): boolean {
  return t.status !== "cancelado" && t.type !== "transferencia";
}

// ---------------------------------------------------------------------------
// DRE
// ---------------------------------------------------------------------------

export interface DreLine {
  name: string;
  value: number;
}

export interface Dre {
  receitaBruta: number;
  impostos: number;
  receitaLiquida: number;
  custos: number;
  resultadoOperacional: number;
  /** Rendimentos menos IR/IOF de aplicacao. */
  resultadoFinanceiro: number;
  resultadoAntesDistribuicao: number;
  distribuicao: number;
  lucroRetido: number;
  /** Resultado operacional sobre a receita bruta, em %. */
  margemOperacional: number;
  linhas: {
    receita: DreLine[];
    impostos: DreLine[];
    custos: DreLine[];
    financeiro: DreLine[];
    distribuicao: DreLine[];
  };
}

function somar(rows: Row[]): number {
  return rows.reduce((s, t) => s + Number(t.amount), 0);
}

function porCategoria(rows: Row[], sinal: (t: Row) => number = () => 1): DreLine[] {
  const map = new Map<string, number>();
  rows.forEach((t) => {
    const nome = t.categories?.name ?? "Sem categoria";
    map.set(nome, (map.get(nome) ?? 0) + Number(t.amount) * sinal(t));
  });
  return Array.from(map, ([name, value]) => ({ name, value: round2(value) })).sort(
    (a, b) => Math.abs(b.value) - Math.abs(a.value)
  );
}

export function computeDre(rows: Row[]): Dre {
  const validos = rows.filter(countsForResult);

  const receita = validos.filter((t) => t.type === "receita" && sectionOf(t) === "operacional");
  const impostos = validos.filter((t) => t.type === "despesa" && sectionOf(t) === "imposto");
  const custos = validos.filter((t) => t.type === "despesa" && sectionOf(t) === "operacional");
  const financeiro = validos.filter((t) => sectionOf(t) === "financeira");
  const distribuicao = validos.filter((t) => sectionOf(t) === "distribuicao");

  const sinalFinanceiro = (t: Row) => (t.type === "receita" ? 1 : -1);

  const receitaBruta = round2(somar(receita));
  const totalImpostos = round2(somar(impostos));
  const receitaLiquida = round2(receitaBruta - totalImpostos);
  const totalCustos = round2(somar(custos));
  const resultadoOperacional = round2(receitaLiquida - totalCustos);
  const resultadoFinanceiro = round2(
    financeiro.reduce((s, t) => s + Number(t.amount) * sinalFinanceiro(t), 0)
  );
  // Distribuicao e sempre saida; receita nessa secao (devolucao de socio) abate.
  const totalDistribuicao = round2(
    distribuicao.reduce((s, t) => s + Number(t.amount) * (t.type === "receita" ? -1 : 1), 0)
  );
  const antes = round2(resultadoOperacional + resultadoFinanceiro);

  return {
    receitaBruta,
    impostos: totalImpostos,
    receitaLiquida,
    custos: totalCustos,
    resultadoOperacional,
    resultadoFinanceiro,
    resultadoAntesDistribuicao: antes,
    distribuicao: totalDistribuicao,
    lucroRetido: round2(antes - totalDistribuicao),
    margemOperacional: receitaBruta > 0 ? (resultadoOperacional / receitaBruta) * 100 : 0,
    linhas: {
      receita: porCategoria(receita),
      impostos: porCategoria(impostos),
      custos: porCategoria(custos),
      financeiro: porCategoria(financeiro, sinalFinanceiro),
      distribuicao: porCategoria(distribuicao, (t) => (t.type === "receita" ? -1 : 1)),
    },
  };
}

export interface DreMatrixLine {
  key: string;
  label: string;
  kind: "total" | "subtotal" | "detalhe";
  /** "entra" pinta positivo de verde; "sai" exibe o valor como deducao. */
  tom: "entra" | "sai" | "resultado";
  values: number[];
  total: number;
}

/** DRE com um mes por coluna. Detalha os custos por categoria. */
export function dreMatrix(rows: Row[], months: string[]): { months: string[]; lines: DreMatrixLine[] } {
  const porMes = months.map((m) => computeDre(rows.filter((t) => monthKey(t.date) === m)));
  const total = computeDre(rows.filter((t) => months.includes(monthKey(t.date))));

  const linha = (
    key: string,
    label: string,
    kind: DreMatrixLine["kind"],
    tom: DreMatrixLine["tom"],
    pick: (d: Dre) => number
  ): DreMatrixLine => ({ key, label, kind, tom, values: porMes.map(pick), total: pick(total) });

  const detalhes = (grupo: keyof Dre["linhas"], tom: DreMatrixLine["tom"]): DreMatrixLine[] =>
    total.linhas[grupo].map((l) =>
      linha(`${grupo}-${l.name}`, l.name, "detalhe", tom, (d) =>
        d.linhas[grupo].find((x) => x.name === l.name)?.value ?? 0
      )
    );

  const lines: DreMatrixLine[] = [
    linha("receita", "Receita Bruta", "total", "entra", (d) => d.receitaBruta),
    ...detalhes("receita", "entra"),
    linha("impostos", "(−) Impostos sobre faturamento", "total", "sai", (d) => d.impostos),
    linha("liquida", "= Receita Líquida", "subtotal", "resultado", (d) => d.receitaLiquida),
    linha("custos", "(−) Custos e despesas operacionais", "total", "sai", (d) => d.custos),
    ...detalhes("custos", "sai"),
    linha("operacional", "= Resultado Operacional", "subtotal", "resultado", (d) => d.resultadoOperacional),
    linha("financeiro", "(+/−) Resultado financeiro", "total", "resultado", (d) => d.resultadoFinanceiro),
    linha("distribuicao", "(−) Distribuição aos sócios", "total", "sai", (d) => d.distribuicao),
    linha("retido", "= Lucro Retido", "subtotal", "resultado", (d) => d.lucroRetido),
  ];

  return { months, lines };
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export interface ProjectResult {
  id: string | null;
  name: string;
  client: string | null;
  status: Project["status"] | null;
  receita: number;
  custo: number;
  margem: number;
  margemPct: number | null;
  /** Custo orcado e quanto dele ja foi consumido. */
  budget: number;
  budgetUsedPct: number | null;
  /** Valor do contrato e quanto dele ja foi faturado. */
  contract: number;
  contractBilledPct: number | null;
  lancamentos: number;
}

/**
 * Margem por projeto: receita operacional menos custo direto lancado nele.
 * Imposto, financeiro e distribuicao nao sao custo de projeto.
 * A ultima linha ("Sem projeto") mostra o que ainda nao foi atribuido - e a
 * medida de quanto da operacao esta invisivel para esta analise.
 */
export function projectResults(rows: Row[], projects: Project[]): ProjectResult[] {
  const validos = rows.filter(
    (t) => countsForResult(t) && sectionOf(t) === "operacional"
  );

  const montar = (
    id: string | null,
    name: string,
    p: Project | null,
    doProjeto: Row[]
  ): ProjectResult => {
    const receita = round2(somar(doProjeto.filter((t) => t.type === "receita")));
    const custo = round2(somar(doProjeto.filter((t) => t.type === "despesa")));
    const budget = Number(p?.budget ?? 0);
    const contract = Number(p?.contract_value ?? 0);
    return {
      id,
      name,
      client: p?.clients?.company ?? null,
      status: p?.status ?? null,
      receita,
      custo,
      margem: round2(receita - custo),
      margemPct: receita > 0 ? ((receita - custo) / receita) * 100 : null,
      budget,
      budgetUsedPct: budget > 0 ? (custo / budget) * 100 : null,
      contract,
      contractBilledPct: contract > 0 ? (receita / contract) * 100 : null,
      lancamentos: doProjeto.length,
    };
  };

  const resultados = projects.map((p) =>
    montar(p.id, p.name, p, validos.filter((t) => t.project_id === p.id))
  );
  const semProjeto = validos.filter((t) => !t.project_id);
  if (semProjeto.length > 0) {
    resultados.push(montar(null, "Sem projeto", null, semProjeto));
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// Socios
// ---------------------------------------------------------------------------

export interface PartnerAccount {
  id: string | null;
  name: string;
  share: number;
  /** Parte do lucro acumulado que cabe ao socio. */
  direito: number;
  retirado: number;
  /** Positivo: ainda pode retirar. Negativo: retirou alem da sua parte. */
  saldo: number;
  retiradas: number;
}

export interface PartnersSummary {
  contas: PartnerAccount[];
  /** Resultado acumulado antes de distribuir - a base do direito de cada um. */
  lucroDistribuivel: number;
  totalRetirado: number;
  /** Soma das participacoes cadastradas; deveria ser 100. */
  somaParticipacao: number;
}

/**
 * Conta corrente de socios: o que cabe a cada um (participacao x lucro
 * acumulado) contra o que ja retirou. Sem participacao cadastrada o direito
 * fica zerado - o sistema nao presume quadro societario.
 */
export function partnerAccounts(rows: Row[], partners: Partner[]): PartnersSummary {
  const dre = computeDre(rows);
  const retiradas = rows.filter(
    (t) => countsForResult(t) && sectionOf(t) === "distribuicao"
  );
  const valorDe = (t: Row) => Number(t.amount) * (t.type === "receita" ? -1 : 1);

  const lucro = dre.resultadoAntesDistribuicao;
  const contas: PartnerAccount[] = partners.map((p) => {
    const dele = retiradas.filter((t) => t.partner_id === p.id);
    const retirado = round2(dele.reduce((s, t) => s + valorDe(t), 0));
    const share = Number(p.share) || 0;
    const direito = round2(Math.max(0, lucro) * (share / 100));
    return {
      id: p.id,
      name: p.name,
      share,
      direito,
      retirado,
      saldo: round2(direito - retirado),
      retiradas: dele.length,
    };
  });

  const semSocio = retiradas.filter((t) => !t.partner_id);
  if (semSocio.length > 0) {
    const retirado = round2(semSocio.reduce((s, t) => s + valorDe(t), 0));
    contas.push({
      id: null,
      name: "Sem sócio vinculado",
      share: 0,
      direito: 0,
      retirado,
      saldo: round2(-retirado),
      retiradas: semSocio.length,
    });
  }

  return {
    contas,
    lucroDistribuivel: lucro,
    totalRetirado: dre.distribuicao,
    somaParticipacao: round2(partners.reduce((s, p) => s + (Number(p.share) || 0), 0)),
  };
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export interface ClientRevenue {
  id: string | null;
  name: string;
  receita: number;
  pct: number;
  lancamentos: number;
}

/** Receita operacional por cliente e o peso de cada um no faturamento. */
export function clientConcentration(rows: Row[]): { clientes: ClientRevenue[]; total: number; maiorPct: number } {
  const receitas = rows.filter(
    (t) => countsForResult(t) && t.type === "receita" && sectionOf(t) === "operacional"
  );
  const total = round2(somar(receitas));
  const map = new Map<string, ClientRevenue>();

  receitas.forEach((t) => {
    const key = t.client_id ?? "none";
    const atual = map.get(key) ?? {
      id: t.client_id,
      name: t.clients?.company ?? "Sem cliente",
      receita: 0,
      pct: 0,
      lancamentos: 0,
    };
    atual.receita = round2(atual.receita + Number(t.amount));
    atual.lancamentos += 1;
    map.set(key, atual);
  });

  const clientes = Array.from(map.values())
    .map((c) => ({ ...c, pct: total > 0 ? (c.receita / total) * 100 : 0 }))
    .sort((a, b) => b.receita - a.receita);

  return { clientes, total, maiorPct: clientes[0]?.pct ?? 0 };
}

// ---------------------------------------------------------------------------
// Extrato por conta
// ---------------------------------------------------------------------------

export interface StatementLine {
  t: Row;
  /** Efeito na conta (positivo entra). */
  valor: number;
  saldo: number;
}

/**
 * Extrato de uma conta com saldo acumulado, na ordem em que o dinheiro se
 * moveu - para bater com o extrato do banco sem exportar nada.
 * `saldoAbertura` e o saldo da conta antes do primeiro lancamento de `rows`.
 */
export function accountStatement(rows: Row[], accountId: string, saldoAbertura: number): StatementLine[] {
  const daConta = rows
    .filter(
      (t) =>
        t.status === "pago" &&
        (t.account_id === accountId || t.transfer_account_id === accountId)
    )
    .sort(
      (a, b) =>
        (a.paid_date ?? a.date).localeCompare(b.paid_date ?? b.date) ||
        a.created_at.localeCompare(b.created_at) ||
        a.id.localeCompare(b.id)
    );

  let saldo = saldoAbertura;
  return daConta.map((t) => {
    const valor = signedAmountForAccount(t, accountId);
    saldo = round2(saldo + valor);
    return { t, valor, saldo };
  });
}

// ---------------------------------------------------------------------------
// Caixa: posicao e projecao por compromissos
// ---------------------------------------------------------------------------

export interface CashPosition {
  /** Contas correntes, poupanca e caixa ativos: dinheiro para pagar conta. */
  disponivel: number;
  /** Aplicacoes (CDB etc.): reserva, resgatavel. */
  aplicado: number;
  total: number;
}

export function cashPosition(balances: AccountBalance[]): CashPosition {
  const soma = (f: (a: AccountBalance) => boolean) =>
    round2(balances.filter(f).reduce((s, a) => s + Number(a.current_balance), 0));
  const aplicado = soma((a) => a.type === "investimento");
  const disponivel = soma((a) => a.type !== "investimento");
  return { disponivel, aplicado, total: round2(disponivel + aplicado) };
}

export interface ProjectionEvent {
  id: string;
  date: string;
  description: string;
  valor: number;
  saldo: number;
  vencido: boolean;
}

export interface CashProjection {
  eventos: ProjectionEvent[];
  entradas: number;
  saidas: number;
  saldoFinal: number;
  menorSaldo: number;
  menorSaldoData: string | null;
  /** Primeiro dia em que o disponivel fica negativo, se ficar. */
  primeiroNegativo: string | null;
  /** Quanto precisaria ser resgatado da reserva para nunca ficar negativo. */
  resgateNecessario: number;
}

/**
 * Projecao de caixa a partir de COMPROMISSOS: contas a pagar e a receber em
 * aberto, na data de vencimento. Substitui a projecao por media dos ultimos
 * tres meses, que para uma empresa de recebimentos grandes e esparsos projetava
 * uma receita mensal que nao existe.
 * Vencidos entram como se vencessem hoje: o dinheiro ainda vai ter que sair.
 */
export function cashProjection(
  disponivel: number,
  rows: Row[],
  today: string,
  horizonDays = 90
): CashProjection {
  const limite = addDays(today, horizonDays);
  const abertos = rows
    .filter((t) => t.status === "pendente" && t.type !== "transferencia")
    .map((t) => {
      const venc = t.due_date ?? t.date;
      return { t, venc, data: venc < today ? today : venc, vencido: venc < today };
    })
    .filter((x) => x.data <= limite)
    .sort((a, b) => a.data.localeCompare(b.data) || a.t.id.localeCompare(b.t.id));

  let saldo = disponivel;
  let menorSaldo = disponivel;
  let menorSaldoData: string | null = null;
  let primeiroNegativo: string | null = disponivel < 0 ? today : null;
  let entradas = 0;
  let saidas = 0;

  const eventos = abertos.map(({ t, data, vencido }) => {
    const valor = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
    if (valor >= 0) entradas += valor;
    else saidas += -valor;
    saldo = round2(saldo + valor);
    if (saldo < menorSaldo) {
      menorSaldo = saldo;
      menorSaldoData = data;
    }
    if (saldo < 0 && !primeiroNegativo) primeiroNegativo = data;
    return { id: t.id, date: data, description: t.description, valor, saldo, vencido };
  });

  return {
    eventos,
    entradas: round2(entradas),
    saidas: round2(saidas),
    saldoFinal: saldo,
    menorSaldo,
    menorSaldoData,
    primeiroNegativo,
    resgateNecessario: menorSaldo < 0 ? round2(-menorSaldo) : 0,
  };
}

/**
 * Gasto mensal medio da OPERACAO (custos + impostos), nos meses informados.
 * Distribuicao de lucro fica de fora: nao e custo e e opcional. Com ela dentro,
 * o "burn rate" de um mes com retirada de socios triplicava e o runway
 * desabava sem que a operacao tivesse mudado.
 */
export function operatingBurn(rows: Row[], months: string[]): number {
  if (months.length === 0) return 0;
  const doPeriodo = rows.filter((t) => t.status === "pago" && months.includes(monthKey(t.date)));
  const dre = computeDre(doPeriodo);
  return round2((dre.custos + dre.impostos) / months.length);
}
