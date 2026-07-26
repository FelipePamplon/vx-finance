export interface Alert {
  id: string;
  type: "saldo_negativo" | "conta_vencida";
  severity: "warning" | "destructive";
  message: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAlerts(supabase: any): Promise<Alert[]> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: accounts }, { data: paidTransactions }, { data: overdue }] =
    await Promise.all([
      supabase.from("accounts").select("id, bank, balance"),
      supabase.from("transactions").select("account_id, amount, type").eq("status", "pago"),
      supabase
        .from("transactions")
        .select("id, description, date")
        .eq("status", "pendente")
        .lt("date", today),
    ]);

  const netPaidByAccount = new Map<string, number>();
  (paidTransactions ?? []).forEach(
    (t: { account_id: string | null; amount: number; type: string }) => {
      if (!t.account_id) return;
      const delta = t.type === "receita" ? Number(t.amount) : -Number(t.amount);
      netPaidByAccount.set(t.account_id, (netPaidByAccount.get(t.account_id) ?? 0) + delta);
    }
  );

  const alerts: Alert[] = [];

  (accounts ?? []).forEach((account: { id: string; bank: string; balance: number }) => {
    const currentBalance = Number(account.balance) + (netPaidByAccount.get(account.id) ?? 0);
    if (currentBalance < 0) {
      alerts.push({
        id: `saldo-${account.id}`,
        type: "saldo_negativo",
        severity: "destructive",
        message: `Conta "${account.bank}" está com saldo negativo (${formatCurrency(currentBalance)}).`,
      });
    }
  });

  (overdue ?? []).forEach((t: { id: string; description: string; date: string }) => {
    alerts.push({
      id: `vencida-${t.id}`,
      type: "conta_vencida",
      severity: "warning",
      message: `"${t.description}" venceu em ${formatDate(t.date)} e ainda está pendente.`,
    });
  });

  return alerts;
}
