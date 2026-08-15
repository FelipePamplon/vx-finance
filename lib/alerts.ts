import { signedAmountForAccount } from "@/lib/finance";

export interface Alert {
  id: string;
  type: "saldo_negativo" | "conta_vencida" | "vence_em_breve";
  severity: "warning" | "destructive";
  message: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAlerts(supabase: any): Promise<Alert[]> {
  const today = new Date().toISOString().slice(0, 10);
  const inSevenDays = addDays(today, 7);

  const [{ data: accounts }, { data: paidTransactions }, { data: openItems }] =
    await Promise.all([
      supabase.from("accounts").select("id, bank, balance"),
      supabase
        .from("transactions")
        .select("account_id, transfer_account_id, amount, type")
        .eq("status", "pago"),
      // Vencimento e o campo certo aqui: "date" e a competencia do lancamento,
      // usa-la como vencimento marcava como atrasado o que ainda estava no prazo.
      supabase
        .from("transactions")
        .select("id, description, due_date, type, amount")
        .eq("status", "pendente")
        .not("due_date", "is", null)
        .lte("due_date", inSevenDays)
        .order("due_date", { ascending: true }),
    ]);

  const alerts: Alert[] = [];

  (accounts ?? []).forEach((account: { id: string; bank: string; balance: number }) => {
    const net = (paidTransactions ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, t: any) => sum + signedAmountForAccount(t, account.id),
      0
    );
    const currentBalance = Number(account.balance) + net;
    if (currentBalance < 0) {
      alerts.push({
        id: `saldo-${account.id}`,
        type: "saldo_negativo",
        severity: "destructive",
        message: `Conta "${account.bank}" está com saldo negativo (${formatCurrency(currentBalance)}).`,
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
