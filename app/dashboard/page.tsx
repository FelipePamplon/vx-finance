import { ArrowDownCircle, ArrowUpCircle, TrendingUp, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CashFlowChart, type CashFlowPoint } from "@/components/charts/cash-flow-chart";
import {
  CategoryBreakdownChart,
  type CategorySlice,
} from "@/components/charts/category-breakdown-chart";
import { MonthSelector } from "@/components/dashboard/month-selector";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

interface YearTransactionRow {
  amount: number;
  type: "receita" | "despesa";
  date: string;
  category_id: string | null;
  categories: { name: string; color: string } | null;
}

interface RecentTransactionRow {
  id: string;
  description: string;
  amount: number;
  type: "receita" | "despesa";
  date: string;
  categories: { name: string } | null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();

  const { month: monthParam } = await searchParams;
  const now = new Date();
  const monthMatch = monthParam?.match(/^(\d{4})-(\d{2})$/);
  const selectedMonthDate = monthMatch
    ? new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  const selectedMonthKey = `${selectedMonthDate.getFullYear()}-${String(selectedMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const isCurrentMonth =
    selectedMonthDate.getFullYear() === now.getFullYear() &&
    selectedMonthDate.getMonth() === now.getMonth();

  const monthStart = selectedMonthDate.toISOString().slice(0, 10);
  const monthEnd = new Date(
    selectedMonthDate.getFullYear(),
    selectedMonthDate.getMonth() + 1,
    0
  )
    .toISOString()
    .slice(0, 10);

  const twelveMonthsAgo = new Date(
    selectedMonthDate.getFullYear(),
    selectedMonthDate.getMonth() - 11,
    1
  )
    .toISOString()
    .slice(0, 10);

  const [
    { data: accounts },
    { data: paidTransactions },
    { data: rawYearTransactions },
    { data: rawRecentTransactions },
  ] = await Promise.all([
    supabase.from("accounts").select("balance"),
    supabase.from("transactions").select("amount, type").eq("status", "pago"),
    supabase
      .from("transactions")
      .select("amount, type, date, category_id, categories(name,color)")
      .gte("date", twelveMonthsAgo)
      .lte("date", monthEnd),
    supabase
      .from("transactions")
      .select("id, description, amount, type, date, categories(name)")
      .order("date", { ascending: false })
      .limit(8),
  ]);

  const yearTransactions = (rawYearTransactions ?? []) as unknown as YearTransactionRow[];
  const recentTransactions = (rawRecentTransactions ?? []) as unknown as RecentTransactionRow[];

  const initialBalances = (accounts ?? []).reduce((sum, a) => sum + Number(a.balance), 0);
  const netPaid = (paidTransactions ?? []).reduce(
    (sum, t) => sum + (t.type === "receita" ? Number(t.amount) : -Number(t.amount)),
    0
  );
  const saldoAtual = initialBalances + netPaid;

  const monthTransactions = yearTransactions.filter(
    (t) => t.date >= monthStart && t.date <= monthEnd
  );

  const entradas = monthTransactions
    .filter((t) => t.type === "receita")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const saidas = monthTransactions
    .filter((t) => t.type === "despesa")
    .reduce((sum, t) => sum + Number(t.amount), 0);

  const resultado = entradas - saidas;
  const margem = entradas > 0 ? (resultado / entradas) * 100 : 0;

  const receitaCount = monthTransactions.filter((t) => t.type === "receita").length;
  const ticketMedio = receitaCount > 0 ? entradas / receitaCount : 0;

  const burnRate = saidas;
  const runway = burnRate > 0 ? saldoAtual / burnRate : null;

  const monthLabel = selectedMonthDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const summaryCards = [
    { label: "Saldo Atual", value: saldoAtual, icon: Wallet, accent: "" },
    {
      label: `Entradas (${monthLabel})`,
      value: entradas,
      icon: ArrowUpCircle,
      accent: "text-success",
    },
    {
      label: `Saídas (${monthLabel})`,
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

  const indicatorCards = [
    { label: "Margem", value: `${margem.toFixed(1)}%` },
    { label: "Ticket Médio", value: formatCurrency(ticketMedio) },
    { label: `Burn Rate (${monthLabel})`, value: formatCurrency(burnRate) },
    { label: "Runway", value: runway !== null ? `${runway.toFixed(1)} meses` : "—" },
  ];

  const months: { key: string; label: string; start: string; end: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() - i, 1);
    const start = d.toISOString().slice(0, 10);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    months.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
      start,
      end,
    });
  }

  const cashFlowSeries: CashFlowPoint[] = months.map(({ label, start, end }) => {
    const inRange = yearTransactions.filter((t) => t.date >= start && t.date <= end);
    return {
      month: label,
      receita: inRange
        .filter((t) => t.type === "receita")
        .reduce((sum, t) => sum + Number(t.amount), 0),
      despesa: inRange
        .filter((t) => t.type === "despesa")
        .reduce((sum, t) => sum + Number(t.amount), 0),
    };
  });

  const recentForAvg = cashFlowSeries.slice(-3);
  const avgReceita =
    recentForAvg.reduce((sum, m) => sum + m.receita, 0) / (recentForAvg.length || 1);
  const avgDespesa =
    recentForAvg.reduce((sum, m) => sum + m.despesa, 0) / (recentForAvg.length || 1);

  const projectedPoints: CashFlowPoint[] = isCurrentMonth
    ? Array.from({ length: 3 }, (_, i) => {
        const d = new Date(selectedMonthDate.getFullYear(), selectedMonthDate.getMonth() + i + 1, 1);
        return {
          month: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
          receita: avgReceita,
          despesa: avgDespesa,
          projected: true,
        };
      })
    : [];

  const cashFlowWithProjection = [...cashFlowSeries, ...projectedPoints];

  const categoryTotalsMap = new Map<string, CategorySlice>();
  monthTransactions
    .filter((t) => t.type === "despesa" && t.categories)
    .forEach((t) => {
      const key = t.categories!.name;
      const existing = categoryTotalsMap.get(key);
      if (existing) {
        existing.value += Number(t.amount);
      } else {
        categoryTotalsMap.set(key, {
          name: key,
          value: Number(t.amount),
          color: t.categories!.color,
        });
      }
    });
  const categoryBreakdown = Array.from(categoryTotalsMap.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Visão geral financeira da VX Capital
          </p>
        </div>
        <MonthSelector selectedMonth={selectedMonthKey} />
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {indicatorCards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold text-foreground">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>
              Fluxo de Caixa · 12 meses{isCurrentMonth ? " + projeção" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart
              data={cashFlowWithProjection}
              projectionStartMonth={projectedPoints[0]?.month}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas por categoria ({monthLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBreakdownChart data={categoryBreakdown} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas movimentações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recentTransactions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum lançamento cadastrado ainda.
            </p>
          )}

          {recentTransactions.map((t) => (
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
