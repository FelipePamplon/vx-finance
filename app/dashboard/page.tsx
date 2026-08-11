import {
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Wallet,
} from "lucide-react";

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

  const prevMonthDate = new Date(
    selectedMonthDate.getFullYear(),
    selectedMonthDate.getMonth() - 1,
    1
  );
  const prevMonthStart = prevMonthDate.toISOString().slice(0, 10);
  const prevMonthEnd = new Date(
    prevMonthDate.getFullYear(),
    prevMonthDate.getMonth() + 1,
    0
  )
    .toISOString()
    .slice(0, 10);
  const prevMonthTransactions = yearTransactions.filter(
    (t) => t.date >= prevMonthStart && t.date <= prevMonthEnd
  );
  const prevEntradas = prevMonthTransactions
    .filter((t) => t.type === "receita")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const prevSaidas = prevMonthTransactions
    .filter((t) => t.type === "despesa")
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const prevResultado = prevEntradas - prevSaidas;

  function percentDelta(current: number, previous: number): number | null {
    if (previous === 0) return null;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  const entradasDelta = percentDelta(entradas, prevEntradas);
  const saidasDelta = percentDelta(saidas, prevSaidas);
  const resultadoDelta = percentDelta(resultado, prevResultado);

  const receitaCount = monthTransactions.filter((t) => t.type === "receita").length;
  const ticketMedio = receitaCount > 0 ? entradas / receitaCount : 0;

  const burnRate = saidas;
  const runway = burnRate > 0 ? saldoAtual / burnRate : null;

  const monthLabel = selectedMonthDate.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  const summaryCards = [
    {
      label: "Saldo Atual",
      value: saldoAtual,
      icon: Wallet,
      accent: "text-primary",
      iconBg: "bg-primary/10",
      delta: null as number | null,
      deltaGood: false,
    },
    {
      label: `Entradas (${monthLabel})`,
      value: entradas,
      icon: ArrowUpCircle,
      accent: "text-success",
      iconBg: "bg-success/10",
      delta: entradasDelta,
      deltaGood: (entradasDelta ?? 0) >= 0,
    },
    {
      label: `Saídas (${monthLabel})`,
      value: saidas,
      icon: ArrowDownCircle,
      accent: "text-destructive",
      iconBg: "bg-destructive/10",
      delta: saidasDelta,
      deltaGood: (saidasDelta ?? 0) <= 0,
    },
    {
      label: "Resultado",
      value: resultado,
      icon: TrendingUp,
      accent: resultado >= 0 ? "text-success" : "text-destructive",
      iconBg: resultado >= 0 ? "bg-success/10" : "bg-destructive/10",
      delta: resultadoDelta,
      deltaGood: (resultadoDelta ?? 0) >= 0,
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
            <Card key={card.label} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{card.label}</CardTitle>
                <span
                  className={`flex size-8 items-center justify-center rounded-full ${card.iconBg}`}
                >
                  <Icon className={`size-4 ${card.accent}`} />
                </span>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold tabular-nums text-foreground ${card.accent}`}>
                  {formatCurrency(card.value)}
                </p>
                {card.delta !== null && card.delta !== undefined && (
                  <p
                    className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${
                      card.deltaGood ? "text-success" : "text-destructive"
                    }`}
                  >
                    {card.delta >= 0 ? (
                      <ArrowUp className="size-3" />
                    ) : (
                      <ArrowDown className="size-3" />
                    )}
                    {Math.abs(card.delta).toFixed(1)}%
                    <span className="font-normal text-muted-foreground">vs mês anterior</span>
                  </p>
                )}
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
              <p className="text-xl font-semibold tabular-nums text-foreground">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 transition-shadow hover:shadow-md">
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

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Despesas por categoria ({monthLabel})</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBreakdownChart data={categoryBreakdown} />
          </CardContent>
        </Card>
      </div>

      <Card className="transition-shadow hover:shadow-md">
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
              className="flex items-center justify-between rounded-md border-b border-border px-2 -mx-2 pb-3 transition-colors last:border-0 last:pb-0 hover:bg-accent/40"
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
                    ? "text-sm font-medium tabular-nums text-success"
                    : "text-sm font-medium tabular-nums text-destructive"
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
