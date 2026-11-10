import { signedAmountForAccount } from "@/lib/finance";
import { round2 } from "@/lib/format";
import type { Account, AccountBalance, TransactionType } from "@/types/database";

interface Movimento {
  type: TransactionType;
  amount: number;
  status: string;
  date: string;
  account_id: string | null;
  transfer_account_id: string | null;
}

/**
 * Saldo por conta a partir dos lancamentos - a mesma formula da visao
 * v_account_balances. Usado como reserva quando a visao ainda nao existe no
 * banco (migration 0017 nao aplicada): o sistema continua de pe e com o numero
 * certo, desde que `transactions` tenha vindo paginado (fetchAllRows).
 */
export function computeBalances(accounts: Account[], transactions: Movimento[]): AccountBalance[] {
  const pagos = transactions.filter((t) => t.status === "pago");

  return accounts.map((a) => {
    const daConta = pagos.filter((t) => t.account_id === a.id || t.transfer_account_id === a.id);
    const movement = round2(daConta.reduce((s, t) => s + signedAmountForAccount(t, a.id), 0));
    const ultimo = daConta.reduce<string | null>(
      (max, t) => (max === null || t.date > max ? t.date : max),
      null
    );
    return {
      id: a.id,
      bank: a.bank,
      agency: a.agency,
      account: a.account,
      type: a.type,
      is_active: a.is_active ?? !/encerrada/i.test(a.bank),
      opening_balance: Number(a.balance),
      movement,
      current_balance: round2(Number(a.balance) + movement),
      last_movement: ultimo,
    };
  });
}
