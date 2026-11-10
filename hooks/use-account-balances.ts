"use client";

import { useQuery } from "@tanstack/react-query";

import { computeBalances } from "@/lib/balances";
import { createClient } from "@/lib/supabase/client";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import type { Account, AccountBalance } from "@/types/database";

/**
 * Saldo por conta, calculado no banco. Invalida junto com os lancamentos e as
 * contas: a chave comeca por "transactions" para pegar carona na invalidacao
 * que os hooks de CRUD ja fazem.
 */
export function useAccountBalances() {
  return useQuery({
    queryKey: ["transactions", "account-balances"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("v_account_balances")
        .select("*")
        .order("bank", { ascending: true });

      if (error) {
        // Visao ausente (migration 0017 ainda nao aplicada): calcula no cliente
        // a partir de TODOS os lancamentos pagos, paginados.
        const { data: accounts, error: accountsError } = await supabase
          .from("accounts")
          .select("*")
          .order("bank", { ascending: true });
        if (accountsError) throw accountsError;
        const movimentos = await fetchAllRows<Parameters<typeof computeBalances>[1][number]>(
          (from, to) =>
            supabase
              .from("transactions")
              .select("type, amount, status, date, account_id, transfer_account_id")
              .eq("status", "pago")
              .order("id", { ascending: true })
              .range(from, to)
        );
        return computeBalances((accounts ?? []) as Account[], movimentos);
      }

      return (data ?? []).map((a) => ({
        ...a,
        opening_balance: Number(a.opening_balance),
        movement: Number(a.movement),
        current_balance: Number(a.current_balance),
      })) as AccountBalance[];
    },
  });
}
