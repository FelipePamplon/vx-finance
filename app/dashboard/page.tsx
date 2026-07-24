import { ArrowDownCircle, ArrowUpCircle, TrendingUp, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const [{ data: accounts }, { data: monthTransactions }, { data: recentTransactions }] =
    await Promise.all([
      supabase.from("accounts").select("balance"),
      supabase
        .from("transactions")
        .select("amount, type, status")
        .gte("date", monthStart)
        .lte("date", monthEnd),
      supabase
        .from("transactions")
        .select("id, description, amount, type, date, categories(name)")
        .order("date", { ascending: false })
        .limit(8),
    ]);

  const saldoAtual = (accounts ?? []).reduce((sum, a) => sum + Number(a.balance), 0);

  const entradas = (monthTransactions ?? [])
    .filter((t) => t.type === "receita")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const saidas = (monthTransactions ?? [])
    .filter((t) => t.type === "despesa")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const resultado = entradas - saidas;

  const summaryCards = [
    { label: "Saldo Atual", value: saldoAtual, icon: Wallet, accent: "" },
    {
      label: "Entradas (mês)",
      value: entradas,
      icon: ArrowUpCircle,
      accent: "text-success",
    },
    {
      label: "Saídas (mês)",
      value: saidas,
      icon: ArrowDownCircle,
      accent: "text-destructive",
    },
    {
      label: "Resultado",
      value: resultado,
      icon: TrendingUp,
      accent: resultado >= 0 ? "text-success" : "text-destructive",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral financeira da VX Capital
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{card.label}</CardTitle>
                <Icon className={`size-4 text-muted-foreground ${card.accent}`} />
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold text-foreground ${card.accent}`}>
                  {formatCurrency(card.value)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas movimentações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(!recentTransactions || recentTransactions.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Nenhum lançamento cadastrado ainda.
            </p>
          )}

          {recentTransactions?.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">{t.description}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(t.date)}
                  {t.categories ? ` · ${t.categories.name}` : ""}
                </span>
              </div>
              <span
                className={
                  t.type === "receita"
                    ? "text-sm font-medium text-success"
                    : "text-sm font-medium text-destructive"
                }
              >
                {t.type === "receita" ? "+ " : "- "}
                {formatCurrency(t.amount)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
