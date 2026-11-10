import { computeBalances } from "@/lib/balances";
import { addDays, formatDate, todayISO } from "@/lib/dates";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { formatCurrency } from "@/lib/format";

export interface Alert {
  id: string;
  type: "saldo_negativo" | "conta_vencida" | "vence_em_breve";
  severity: "warning" | "destructive";
  message: string;
}

/**
 * Alertas do sino. Leve de proposito (roda em toda pagina): saldo vem da visao
 * v_account_balances, calculada no banco, em vez de baixar todos os lancamentos
 * pagos - consulta que parava em 1.000 linhas sem avisar.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAlerts(supabase: any): Promise<Alert[]> {
  const today = todayISO();
  const inSevenDays = addDays(today, 7);

  const [balancesRes, { data: openItems }] = await Promise.all([
    supabase.from("v_account_balances").select("id, bank, current_balance"),
    // Vencimento e o campo certo aqui: "date" e a competencia do lancamento.
    supabase
      .from("transactions")
      .select("id, description, due_date, type, amount")
      .eq("status", "pendente")
      .not("due_date", "is", null)
      .lte("due_date", inSevenDays)
      .order("due_date", { ascending: true }),
  ]);

  let balances: { id: string; bank: string; current_balance: number }[] = balancesRes.data ?? [];
  if (balancesRes.error) {
    // Visao ausente (migration 0017 ainda nao aplicada): mesma conta, paginada.
    const [{ data: accounts }, movimentos] = await Promise.all([
      supabase.from("accounts").select("*"),
      fetchAllRows<Parameters<typeof computeBalances>[1][number]>((from, to) =>
        supabase
          .from("transactions")
          .select("type, amount, status, date, account_id, transfer_account_id")
          .eq("status", "pago")
          .order("id", { ascending: true })
          .range(from, to)
      ),
    ]);
    balances = computeBalances(accounts ?? [], movimentos);
  }

  const alerts: Alert[] = [];

  balances.forEach((a) => {
    const saldo = Number(a.current_balance);
    if (saldo < -0.005) {
      alerts.push({
        id: `saldo-${a.id}`,
        type: "saldo_negativo",
        severity: "destructive",
        message: `Conta "${a.bank}" está com saldo negativo (${formatCurrency(saldo)}). Falta lançar a entrada que cobriu o pagamento?`,
      });
    }
  });

  (openItems ?? []).forEach(
    (t: { id: string; description: string; due_date: string; type: string; amount: number }) => {
      const label = t.type === "receita" ? "a receber" : "a pagar";
      const value = formatCurrency(Number(t.amount));

      if (t.due_date < today) {
        alerts.push({
          id: `vencida-${t.id}`,
          type: "conta_vencida",
          severity: "destructive",
          message: `"${t.description}" (${value} ${label}) venceu em ${formatDate(t.due_date)}.`,
        });
      } else {
        alerts.push({
          id: `vence-${t.id}`,
          type: "vence_em_breve",
          severity: "warning",
          message:
            t.due_date === today
              ? `"${t.description}" (${value} ${label}) vence hoje.`
              : `"${t.description}" (${value} ${label}) vence em ${formatDate(t.due_date)}.`,
        });
      }
    }
  );

  return alerts;
}
