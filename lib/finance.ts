import type { TransactionType } from "@/types/database";

/**
 * Matematica de sinais dos lancamentos, centralizada de proposito.
 *
 * Espalhar `type === "receita" ? +valor : -valor` pelas telas funcionava enquanto
 * so existiam receita e despesa. Com transferencia entre contas isso passa a estar
 * errado: uma transferencia nao e despesa, ela apenas move dinheiro entre contas
 * proprias. Se cada tela repetir a conta na mao, uma delas vai esquecer e inflar
 * as despesas / distorcer o DRE. Por isso a regra vive num lugar so.
 *
 * ESTORNO: `amount` pode ser NEGATIVO num lancamento de despesa. Um estorno nao e
 * receita - e despesa que voltou. Lancado como receita, ele inflava as DUAS linhas
 * do DRE ao mesmo tempo (receita bruta e despesa), e o resultado so fechava porque
 * os dois erros se cancelavam. Como despesa negativa ele abate a propria categoria
 * que gerou o gasto, e a linha de Transporte passa a mostrar o custo liquido.
 * Toda a matematica abaixo ja funciona com valor negativo sem caso especial.
 */

export interface AmountLike {
  type: TransactionType;
  amount: number;
  account_id?: string | null;
  transfer_account_id?: string | null;
}

export function isRevenue(t: { type: TransactionType }): boolean {
  return t.type === "receita";
}

export function isExpense(t: { type: TransactionType }): boolean {
  return t.type === "despesa";
}

export function isTransfer(t: { type: TransactionType }): boolean {
  return t.type === "transferencia";
}

/**
 * Valor com sinal para EXIBIR na tela: positivo entra, negativo sai.
 * Difere de signedAmountTotal porque transferencia aparece com o proprio valor
 * (ela move dinheiro, mesmo sendo neutra no caixa consolidado). Num estorno
 * (despesa com amount negativo) o resultado e positivo - o dinheiro voltou.
 */
export function displaySignedAmount(t: AmountLike): number {
  const amount = Number(t.amount) || 0;
  if (t.type === "transferencia") return amount;
  return t.type === "receita" ? amount : -amount;
}

/**
 * Um estorno e uma despesa lancada com valor negativo.
 */
export function isReversal(t: AmountLike): boolean {
  return t.type === "despesa" && Number(t.amount) < 0;
}

/**
 * Efeito do lancamento no caixa consolidado (soma de todas as contas).
 * Transferencia e neutra: sai de uma conta e entra em outra.
 */
export function signedAmountTotal(t: AmountLike): number {
  const amount = Number(t.amount) || 0;
  if (t.type === "transferencia") return 0;
  return t.type === "receita" ? amount : -amount;
}

/**
 * Efeito do lancamento no saldo de UMA conta especifica.
 * Numa transferencia, a conta de origem perde e a de destino ganha.
 */
export function signedAmountForAccount(t: AmountLike, accountId: string): number {
  const amount = Number(t.amount) || 0;

  if (t.type === "transferencia") {
    if (t.account_id === accountId) return -amount;
    if (t.transfer_account_id === accountId) return amount;
    return 0;
  }

  if (t.account_id !== accountId) return 0;
  return t.type === "receita" ? amount : -amount;
}

/**
 * Como o lancamento aparece no extrato da conta de origem.
 * Usado na conciliacao bancaria, onde a transferencia aparece como saida.
 */
export function signedAmountOnStatement(t: AmountLike): number {
  const amount = Number(t.amount) || 0;
  return t.type === "receita" ? amount : -amount;
}

/**
 * Data em que o dinheiro se moveu (ou vai se mover): a data de CAIXA.
 *
 * `date` e a competencia - o mes a que a receita ou o gasto pertence. Para quase
 * tudo as duas coincidem, mas nao para imposto: o DAS de outubro tem competencia
 * 31/10 e sai da conta em novembro. Tela de caixa que lista pela competencia
 * mostra esse pagamento em outubro, longe do resgate feito para cobri-lo, e o
 * mes de novembro fica sem a saida - parece que o pagamento "nao entrou".
 *
 * Pago: data do pagamento. Em aberto: vencimento (quando o caixa vai sentir).
 * O DRE e a Posicao Fiscal continuam usando `date`.
 */
export function cashDate(t: {
  date: string;
  due_date?: string | null;
  paid_date?: string | null;
  status: string;
}): string {
  if (t.status === "pago") return t.paid_date ?? t.date;
  if (t.status === "pendente") return t.due_date ?? t.date;
  return t.date;
}
