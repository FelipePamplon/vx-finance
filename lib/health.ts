import { clientConcentration, countsForResult, sectionOf } from "@/lib/analytics";
import { diffDays, formatDate } from "@/lib/dates";
import { apurarFiscal } from "@/lib/fiscal";
import { formatCurrency, round2 } from "@/lib/format";
import type { AccountBalance, Partner, TransactionWithRelations } from "@/types/database";

/**
 * Saude dos dados: as inconsistencias que o sistema consegue enxergar sozinho.
 *
 * Toda divergencia corrigida ate aqui (saldo inflado, estorno como receita,
 * lancamento duplicado, imposto nao provisionado) ficou meses invisivel porque
 * nada no sistema apontava para ela - so apareceu quando alguem conferiu contra
 * o extrato. Cada regra abaixo e uma dessas conferencias, rodando o tempo todo.
 *
 * As regras apontam, nao corrigem: quem decide o que e erro e o financeiro.
 */

export type HealthSeverity = "critico" | "atencao" | "info";

export interface HealthIssue {
  id: string;
  severity: HealthSeverity;
  title: string;
  detail: string;
  /** Quantos lancamentos/itens estao envolvidos. */
  count?: number;
  amount?: number;
  /** Onde resolver. */
  href?: string;
  action?: string;
}

interface HealthInput {
  transactions: TransactionWithRelations[];
  balances: AccountBalance[];
  partners: Partner[];
  today: string;
}

const plural = (n: number, um: string, varios: string) => (n === 1 ? `1 ${um}` : `${n} ${varios}`);

export function runHealthChecks({ transactions, balances, partners, today }: HealthInput): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const ativos = transactions.filter((t) => t.status !== "cancelado");
  const pagos = ativos.filter((t) => t.status === "pago");

  // 1. Conta bancaria negativa: banco nao deixa conta corrente sem limite ficar
  //    negativa, entao quase sempre e lancamento faltando (resgate, aporte).
  balances
    .filter((a) => Number(a.current_balance) < -0.005)
    .forEach((a) => {
      issues.push({
        id: `saldo-negativo-${a.id}`,
        severity: "critico",
        title: `${a.bank} está com saldo negativo no sistema`,
        detail: `${formatCurrency(a.current_balance)}. Uma conta sem limite não fica negativa no banco: normalmente falta lançar a entrada que cobriu o pagamento (resgate de aplicação, transferência ou recebimento). Concilie com o extrato.`,
        amount: Number(a.current_balance),
        href: "/dashboard/reconciliation",
        action: "Conciliar",
      });
    });

  // 2. Contas vencidas.
  const vencidos = ativos.filter(
    (t) => t.status === "pendente" && t.type !== "transferencia" && (t.due_date ?? t.date) < today
  );
  if (vencidos.length > 0) {
    issues.push({
      id: "vencidos",
      severity: "critico",
      title: `${plural(vencidos.length, "conta vencida", "contas vencidas")} em aberto`,
      detail: `A mais antiga venceu em ${formatDate(
        vencidos.map((t) => t.due_date ?? t.date).sort()[0]
      )}. Se já foi paga, marque como paga; se não vai acontecer, cancele.`,
      count: vencidos.length,
      amount: round2(vencidos.reduce((s, t) => s + Number(t.amount), 0)),
      href: "/dashboard/payables",
      action: "Ver contas",
    });
  }

  // 3. Imposto que o faturamento ja gerou e ninguem lancou. Pelo acumulado:
  //    nao depende de em que mes cada pagamento foi registrado.
  const fiscal = apurarFiscal(transactions, today);
  if (fiscal.emAberto > 1) {
    issues.push({
      id: "das-nao-provisionado",
      severity: "atencao",
      title: `${formatCurrency(fiscal.emAberto)} de Simples Nacional sem lançamento`,
      detail:
        "O faturamento já gerou esse imposto e ele não está em Contas a Pagar nem foi pago. O DAS vence no dia 20 do mês seguinte à competência.",
      amount: fiscal.emAberto,
      href: "/dashboard/reports?view=fiscal",
      action: "Posição fiscal",
    });
  }

  // 3b. Receita do ano acima do limite do MEI, tendo sido MEI em parte dele.
  if (fiscal.mei.excedeTolerancia) {
    issues.push({
      id: "limite-mei",
      severity: "atencao",
      title: "Receita do ano ultrapassa o limite do MEI em mais de 20%",
      detail: `${formatCurrency(fiscal.mei.receita)} foram faturados como MEI e o ano soma ${formatCurrency(
        fiscal.mei.receitaAno
      )}, contra limite de ${formatCurrency(
        fiscal.mei.limite
      )}. Nessa situação a regra geral é o desenquadramento retroativo a janeiro, com imposto devido sobre a receita do período MEI. Confirme com a contabilidade como isso foi tratado.`,
      amount: fiscal.mei.receita,
      href: "/dashboard/reports?view=fiscal",
      action: "Posição fiscal",
    });
  }

  // 4. Dinheiro que se moveu sem classificacao: fica fora de qualquer analise.
  const semCategoria = pagos.filter((t) => t.type !== "transferencia" && !t.category_id);
  if (semCategoria.length > 0) {
    issues.push({
      id: "sem-categoria",
      severity: "atencao",
      title: `${plural(semCategoria.length, "lançamento", "lançamentos")} sem categoria`,
      detail: `Somam ${formatCurrency(
        semCategoria.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
      )} que aparecem no DRE como "Sem categoria". Use o filtro e a edição em massa para classificar.`,
      count: semCategoria.length,
      amount: round2(semCategoria.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)),
      href: "/dashboard/transactions?categoria=sem",
      action: "Classificar",
    });
  }

  // 5. Distribuicao sem socio: a conta corrente de socios fica furada.
  const distribSemSocio = ativos.filter(
    (t) => countsForResult(t) && sectionOf(t) === "distribuicao" && !t.partner_id
  );
  if (distribSemSocio.length > 0) {
    issues.push({
      id: "distribuicao-sem-socio",
      severity: "atencao",
      title: `${plural(distribSemSocio.length, "retirada", "retiradas")} sem sócio vinculado`,
      detail: "Sem o sócio no lançamento não dá para saber quem retirou quanto.",
      count: distribSemSocio.length,
      amount: round2(distribSemSocio.reduce((s, t) => s + Number(t.amount), 0)),
      href: "/dashboard/transactions?secao=distribuicao",
      action: "Vincular",
    });
  }

  // 6. Quadro societario incompleto.
  const somaShare = round2(partners.reduce((s, p) => s + (Number(p.share) || 0), 0));
  const haDistribuicao = ativos.some((t) => sectionOf(t) === "distribuicao");
  if (partners.length > 0 && Math.abs(somaShare - 100) > 0.01 && haDistribuicao) {
    issues.push({
      id: "participacao-societaria",
      severity: "atencao",
      title: `Participação dos sócios soma ${somaShare.toLocaleString("pt-BR")}%, não 100%`,
      detail:
        "Sem a participação de cada um, o sistema não consegue dizer quem retirou acima ou abaixo da sua parte do lucro.",
      href: "/dashboard/partners",
      action: "Informar participação",
    });
  }

  // 7. Conta ativa sem movimento registrado ha dias: provavel falta de conciliacao.
  balances
    .filter((a) => a.is_active && a.type === "corrente" && a.last_movement)
    .forEach((a) => {
      const dias = diffDays(a.last_movement as string, today);
      if (dias > 10) {
        issues.push({
          id: `sem-movimento-${a.id}`,
          severity: "atencao",
          title: `${a.bank}: último lançamento há ${dias} dias`,
          detail: `Nada registrado desde ${formatDate(a.last_movement)}. Importe o extrato na Conciliação para trazer o que falta.`,
          href: "/dashboard/reconciliation",
          action: "Conciliar",
        });
      }
    });

  // 8. Pago com data no futuro.
  const futuros = pagos.filter((t) => (t.paid_date ?? t.date) > today);
  if (futuros.length > 0) {
    issues.push({
      id: "pago-no-futuro",
      severity: "atencao",
      title: `${plural(futuros.length, "lançamento pago", "lançamentos pagos")} com data futura`,
      detail: "Já contam no saldo de hoje, mas a data diz que ainda não aconteceram. Se é previsão, o status certo é pendente.",
      count: futuros.length,
      amount: round2(futuros.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)),
      href: "/dashboard/transactions?status=pago",
      action: "Revisar",
    });
  }

  // 9. Receita relevante sem cliente.
  const receitaSemCliente = ativos.filter(
    (t) =>
      t.type === "receita" &&
      sectionOf(t) === "operacional" &&
      !t.client_id &&
      Number(t.amount) >= 1000
  );
  if (receitaSemCliente.length > 0) {
    issues.push({
      id: "receita-sem-cliente",
      severity: "atencao",
      title: `${plural(receitaSemCliente.length, "receita", "receitas")} sem cliente`,
      detail: "Faturamento sem cliente não entra na análise de concentração nem no histórico do cliente.",
      count: receitaSemCliente.length,
      amount: round2(receitaSemCliente.reduce((s, t) => s + Number(t.amount), 0)),
      href: "/dashboard/transactions?tipo=receita",
      action: "Vincular",
    });
  }

  // 10. Operacao invisivel para a analise de margem por projeto.
  const operacional = ativos.filter(
    (t) => countsForResult(t) && sectionOf(t) === "operacional" && t.type === "despesa"
  );
  const semProjeto = operacional.filter((t) => !t.project_id);
  const custoTotal = operacional.reduce((s, t) => s + Number(t.amount), 0);
  const custoSemProjeto = semProjeto.reduce((s, t) => s + Number(t.amount), 0);
  if (custoTotal > 0 && custoSemProjeto / custoTotal > 0.3) {
    issues.push({
      id: "custo-sem-projeto",
      severity: "info",
      title: `${((custoSemProjeto / custoTotal) * 100).toFixed(0)}% do custo operacional sem projeto`,
      detail: `${formatCurrency(custoSemProjeto)} em ${semProjeto.length} lançamentos não estão ligados a nenhum projeto. A margem por projeto só vale para o que está vinculado — despesa de estrutura pode ficar sem projeto, custo de contrato não.`,
      count: semProjeto.length,
      amount: round2(custoSemProjeto),
      href: "/dashboard/transactions?projeto=sem&tipo=despesa",
      action: "Vincular",
    });
  }

  // 11. Concentracao de receita.
  const { clientes, maiorPct, total } = clientConcentration(ativos);
  if (total > 0 && maiorPct >= 60 && clientes[0]) {
    issues.push({
      id: "concentracao-receita",
      severity: "info",
      title: `${maiorPct.toFixed(0)}% da receita vem de ${clientes[0].name}`,
      detail: "Risco de negócio, não erro de lançamento: a perda ou o atraso desse cliente compromete o caixa inteiro.",
      amount: clientes[0].receita,
      href: "/dashboard/reports?view=clientes",
      action: "Ver clientes",
    });
  }

  // 12. Possiveis duplicatas. So aviso: corrida repetida no mesmo dia existe.
  const chaves = new Map<string, number>();
  pagos
    .filter((t) => Math.abs(Number(t.amount)) >= 100)
    .forEach((t) => {
      const k = `${t.date}|${t.type}|${t.amount}|${t.account_id}|${t.description}`;
      chaves.set(k, (chaves.get(k) ?? 0) + 1);
    });
  const duplicados = Array.from(chaves.values()).filter((n) => n > 1).length;
  if (duplicados > 0) {
    issues.push({
      id: "possiveis-duplicatas",
      severity: "info",
      title: `${plural(duplicados, "possível duplicata", "possíveis duplicatas")} (≥ R$ 100)`,
      detail: "Lançamentos idênticos em data, valor, conta e descrição. Podem ser legítimos — confira no extrato antes de excluir.",
      count: duplicados,
      href: "/dashboard/transactions",
      action: "Revisar",
    });
  }

  // 13. Despesa relevante sem comprovante.
  const semComprovante = pagos.filter(
    (t) => t.type === "despesa" && Number(t.amount) >= 1000 && !t.attachment_url
  );
  if (semComprovante.length > 0) {
    issues.push({
      id: "sem-comprovante",
      severity: "info",
      title: `${plural(semComprovante.length, "despesa", "despesas")} ≥ R$ 1.000 sem comprovante`,
      detail: "Nota fiscal ou recibo anexado ao lançamento é o que sustenta a despesa numa fiscalização ou auditoria.",
      count: semComprovante.length,
      amount: round2(semComprovante.reduce((s, t) => s + Number(t.amount), 0)),
      href: "/dashboard/transactions?tipo=despesa",
      action: "Anexar",
    });
  }

  const ordem: Record<HealthSeverity, number> = { critico: 0, atencao: 1, info: 2 };
  return issues.sort((a, b) => ordem[a.severity] - ordem[b.severity]);
}

export function healthScore(issues: HealthIssue[]): { criticos: number; atencao: number; info: number } {
  return {
    criticos: issues.filter((i) => i.severity === "critico").length,
    atencao: issues.filter((i) => i.severity === "atencao").length,
    info: issues.filter((i) => i.severity === "info").length,
  };
}
