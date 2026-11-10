import "server-only";

import { computeBalances } from "@/lib/balances";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Account, AccountBalance, Partner, TransactionWithRelations } from "@/types/database";

/** Mesmo recorte de colunas do hook do cliente (hooks/use-transactions.ts). */
const TRANSACTION_SELECT =
  "*, accounts!transactions_account_id_fkey(bank), transfer_accounts:accounts!transactions_transfer_account_id_fkey(bank), categories(name,color,dre_section), clients(company), projects(name), partners(name)";

export interface Ledger {
  transactions: TransactionWithRelations[];
  balances: AccountBalance[];
  partners: Partner[];
}

/**
 * Carrega o razao inteiro no servidor: todos os lancamentos (paginado), o saldo
 * por conta calculado no banco e os socios. Painel e Saude dos Dados derivam
 * tudo daqui com as mesmas funcoes de lib/analytics que os relatorios usam.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadLedger(supabase: any): Promise<Ledger> {
  const [transactions, balancesRes, partnersRes] = await Promise.all([
    fetchAllRows<TransactionWithRelations>((from, to) =>
      supabase
        .from("transactions")
        .select(TRANSACTION_SELECT)
        .order("date", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to)
    ),
    supabase.from("v_account_balances").select("*").order("bank", { ascending: true }),
    supabase.from("partners").select("*").order("name", { ascending: true }),
  ]);

  if (partnersRes.error) throw partnersRes.error;

  let balances: AccountBalance[];
  if (balancesRes.error) {
    // Visao ausente (migration 0017 ainda nao aplicada): calcula dos lancamentos,
    // que ja vieram paginados. Mesma formula, mesmo numero.
    const { data: accounts, error } = await supabase.from("accounts").select("*").order("bank");
    if (error) throw error;
    balances = computeBalances((accounts ?? []) as Account[], transactions);
  } else {
    balances = ((balancesRes.data ?? []) as AccountBalance[]).map((a) => ({
      ...a,
      opening_balance: Number(a.opening_balance),
      movement: Number(a.movement),
      current_balance: Number(a.current_balance),
    }));
  }

  return { transactions, balances, partners: (partnersRes.data ?? []) as Partner[] };
}
