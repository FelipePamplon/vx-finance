import type { TransactionType } from "@/types/database";

/**
 * Matematica de sinais dos lancamentos, centralizada de proposito.
 *
 * Espalhar `type === "receita" ? +valor : -valor` pelas telas funcionava enquanto
 * so existiam receita e despesa. Com transferencia entre contas isso passa a estar
 * errado: uma transferencia nao e despesa, ela apenas move dinheiro entre contas
 * proprias. Se cada tela repetir a conta na mao, uma delas vai esquecer e inflar
 * as despesas / distorcer o DRE. Por isso a regra vive num lugar so.
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
