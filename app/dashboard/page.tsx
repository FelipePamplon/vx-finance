import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  ShieldAlert,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { CashFlowChart, type CashFlowPoint } from "@/components/charts/cash-flow-chart";
import {
  CategoryBreakdownChart,
  type CategorySlice,
} from "@/components/charts/category-breakdown-chart";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cashPosition,
  cashProjection,
  clientConcentration,
  computeDre,
  operatingBurn,
  sectionOf,
} from "@/lib/analytics";
import { addMonths, formatDate, monthKey, monthLabel, todayISO } from "@/lib/dates";
import { cashDate } from "@/lib/finance";
import { formatCurrency, formatPercent } from "@/lib/format";
import { healthScore, runHealthChecks } from "@/lib/health";
import { formatTransactionAmount, transactionAmountTone } from "@/lib/labels";
import { sortByCashDate } from "@/lib/ledger-filters";
import { loadLedger } from "@/lib/ledger-server";
import { createClient } from "@/lib/supabase/server";

function delta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / Math.abs(anterior)) * 100;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const { month: monthParam } = await searchParams;

  // "Hoje" no fuso da empresa: em UTC o painel virava o mes na noite do dia 30.
  const today = todayISO();
  const mes = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : monthKey(today);
  const mesAnterior = addMonths(mes, -1);
  const mesCorrente = mes === monthKey(today);

  const { transactions, balances, partners } = await loadLedger(supabase);

  // Painel de caixa realizado: so o que foi efetivamente pago ou recebido.
  const pagos = transactions.filter((t) => t.status === "pago");
  const doMes = (m: string) => pagos.filter((t) => monthKey(t.date) === m);

  const dre = computeDre(doMes(mes));
  const dreAnterior = computeDre(doMes(mesAnterior));
  const caixa = cashPosition(balances);

  // Gasto da OPERACAO (custos + impostos). Distribuicao de lucro nao e gasto
  // operacional: com ela dentro, o runway despencava em mes de retirada.
  const ultimosTres = [mes, addMonths(mes, -1), addMonths(mes, -2)];
  const burn = operatingBurn(pagos, ultimosTres);
  const runway = burn > 0 ? caixa.total / burn : null;

  const projecao = cashProjection(caixa.disponivel, transactions, today, 90);
  const issues = runHealthChecks({ transactions, balances, partners, today });
  const saude = healthScore(issues);
  const { maiorPct, clientes } = clientConcentration(
    pagos.filter((t) => t.date >= `${today.slice(0, 4)}-01-01`)
  );

  const summaryCards = [
    {
      label: "Caixa total",
      value: caixa.total,
      icon: Wallet,
      accent: caixa.total >= 0 ? "text-primary" : "text-destructive",
      iconBg: "bg-primary/10",
      hint: `${formatCurrency(caixa.disponivel)} em conta · ${formatCurrency(caixa.aplicado)} aplicado`,
      delta: null as number | null,
      deltaGood: true,
    },
    {
      label: `Receita (${monthLabel(mes)})`,
      value: dre.receitaBruta,
      icon: ArrowUpCircle,
      accent: "text-success",
      iconBg: "bg-success/10",
      hint: null as string | null,
      delta: delta(dre.receitaBruta, dreAnterior.receitaBruta),
      deltaGood: dre.receitaBruta >= dreAnterior.receitaBruta,
    },
    {
      label: `Custos + impostos (${monthLabel(mes)})`,
      value: dre.custos + dre.impostos,
      icon: ArrowDownCircle,
      accent: "text-destructive",
      iconBg: "bg-destructive/10",
      hint: dre.distribuicao > 0 ? `+ ${formatCurrency(dre.distribuicao)} distribuídos aos sócios` : null,
      delta: delta(dre.custos + dre.impostos, dreAnterior.custos + dreAnterior.impostos),
      deltaGood: dre.custos + dre.impostos <= dreAnterior.custos + dreAnterior.impostos,
    },
    {
      label: "Resultado operacional",
      value: dre.resultadoOperacional,
      icon: TrendingUp,
      accent: dre.resultadoOperacional >= 0 ? "text-success" : "text-destructive",
      iconBg: dre.resultadoOperacional >= 0 ? "bg-success/10" : "bg-destructive/10",
      hint: dre.receitaBruta > 0 ? `margem ${formatPercent(dre.margemOperacional)}` : null,
      delta: delta(dre.resultadoOperacional, dreAnterior.resultadoOperacional),
      deltaGood: dre.resultadoOperacional >= dreAnterior.resultadoOperacional,
    },
  ];

  const indicadores = [
    {
      label: "Gasto operacional médio",
      value: formatCurrency(burn),
      hint: "média dos últimos 3 meses, sem distribuição",
    },
    {
      label: "Fôlego de caixa",
      value: runway !== null ? `${runway.toFixed(1)} meses` : "—",
      hint: "caixa total ÷ gasto operacional médio",
    },
    {
      label: "A pagar (90 dias)",
      value: formatCurrency(projecao.saidas),
      hint: projecao.entradas > 0 ? `${formatCurrency(projecao.entradas)} a receber` : "nada a receber lançado",
    },
    {
      label: "Maior cliente no ano",
      value: clientes[0] ? formatPercent(maiorPct, 0) : "—",
      hint: clientes[0] ? `${clientes[0].name} da receita` : "sem receita no ano",
    },
  ];

  // 12 meses: receita operacional x custo da operacao (com impostos).
  const meses = Array.from({ length: 12 }, (_, i) => addMonths(mes, i - 11));
  const serie: CashFlowPoint[] = meses.map((m) => {
    const d = computeDre(doMes(m));
    return { month: monthLabel(m), receita: d.receitaBruta, despesa: d.custos + d.impostos };
  });

  // Pizza: so custo da operacao. Distribuicao e imposto tem linha propria no DRE.
  const fatias = new Map<string, CategorySlice>();
  doMes(mes)
    .filter((t) => t.type === "despesa" && sectionOf(t) === "operacional")
    .forEach((t) => {
      const nome = t.categories?.name ?? "Sem categoria";
      const atual = fatias.get(nome) ?? { name: nome, value: 0, color: t.categories?.color ?? "#94A3B8" };
      atual.value += Number(t.amount);
      fatias.set(nome, atual);
    });
  // Fatia de pizza nao pode ser negativa (categoria com estorno maior que gasto).
  const breakdown = Array.from(fatias.values())
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  // O que se moveu por ultimo no caixa (pagamento), nao a ultima competencia.
  const recentes = sortByCashDate(pagos).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral financeira da VX Capital</p>
        </div>
        <MonthSelector selectedMonth={mes} />
      </div>

      {(saude.criticos > 0 || saude.atencao > 0) && (
        <Link
          href="/dashboard/health"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-accent/40 ${
            saude.criticos > 0
              ? "border-destructive/40 bg-destructive/5"
              : "border-primary/40 bg-primary/5"
          }`}
        >
          {saude.criticos > 0 ? (
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-primary" />
          )}
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">
              {saude.criticos > 0
                ? `${saude.criticos} problema(s) crítico(s) nos dados`
                : `${saude.atencao} ponto(s) de atenção nos dados`}
              {saude.criticos > 0 && saude.atencao > 0 ? ` e ${saude.atencao} de atenção` : ""}
            </p>
            <p className="truncate text-muted-foreground">{issues[0]?.title} — ver Saúde dos dados</p>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{card.label}</CardTitle>
                <span className={`flex size-8 items-center justify-center rounded-full ${card.iconBg}`}>
                  <Icon className={`size-4 ${card.accent}`} />
                </span>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold tabular-nums ${card.accent}`}>
                  {formatCurrency(card.value)}
                </p>
                {card.hint && <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>}
                {card.delta !== null && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      card.deltaGood ? "text-success" : "text-destructive"
                    }`}
                  >
                    {card.delta >= 0 ? "▲" : "▼"} {Math.abs(card.delta).toFixed(1)}%
                    <span className="font-normal text-muted-foreground"> vs mês anterior</span>
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {indicadores.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums text-foreground">{card.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Receita × custo da operação · 12 meses</CardTitle>
          </CardHeader>
          <CardContent>
            <CashFlowChart data={serie} receitaLabel="Receita" despesaLabel="Custos + impostos" />
          </CardContent>
        </Card>

        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Custos por categoria ({monthLabel(mes)})</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBreakdownChart data={breakdown} />
          </CardContent>
        </Card>
      </div>

      {mesCorrente && (
        <Card className="transition-shadow hover:shadow-md">
          <CardHeader>
            <CardTitle>Projeção de caixa · próximos 90 dias</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {projecao.primeiroNegativo ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-foreground">
                  O dinheiro em conta não cobre os compromissos: fica negativo em{" "}
                  <strong>{formatDate(projecao.primeiroNegativo)}</strong>. É preciso resgatar pelo
                  menos <strong>{formatCurrency(projecao.resgateNecessario)}</strong> da reserva
                  {caixa.aplicado >= projecao.resgateNecessario
                    ? ` (há ${formatCurrency(caixa.aplicado)} aplicados).`
                    : ` — e a reserva de ${formatCurrency(caixa.aplicado)} não é suficiente.`}
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" />
                O dinheiro em conta cobre todos os compromissos lançados.
              </div>
            )}

            <div className="flex items-center justify-between border-b border-border pb-2 text-sm">
              <span className="text-muted-foreground">Em conta hoje ({formatDate(today)})</span>
              <span
                className={`font-semibold tabular-nums ${caixa.disponivel < 0 ? "text-destructive" : ""}`}
              >
                {formatCurrency(caixa.disponivel)}
              </span>
            </div>

            {projecao.eventos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma conta a pagar ou a receber lançada para os próximos 90 dias. A projeção só
                enxerga o que está em A Pagar / Receber — lance os compromissos recorrentes.
              </p>
            )}

            {projecao.eventos.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate text-foreground">{e.description}</p>
                  <p className={`text-xs ${e.vencido ? "text-destructive" : "text-muted-foreground"}`}>
                    {e.vencido ? "vencido — conta como hoje" : formatDate(e.date)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={`tabular-nums ${e.valor >= 0 ? "text-success" : "text-destructive"}`}>
                    {formatCurrency(e.valor)}
                  </p>
                  <p
                    className={`text-xs tabular-nums ${
                      e.saldo < 0 ? "font-medium text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    saldo {formatCurrency(e.saldo)}
                  </p>
                </div>
              </div>
            ))}
            {projecao.eventos.length > 8 && (
              <Link href="/dashboard/payables" className="text-xs text-primary hover:underline">
                + {projecao.eventos.length - 8} compromisso(s) — ver A Pagar / Receber
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="transition-shadow hover:shadow-md">
        <CardHeader>
          <CardTitle>Últimas movimentações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recentes.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum lançamento cadastrado ainda.</p>
          )}

          {recentes.map((t) => {
            const k = transactionAmountTone(t);
            return (
              <div
                key={t.id}
                className="-mx-2 flex items-center justify-between gap-3 rounded-md border-b border-border px-2 pb-3 transition-colors last:border-0 last:pb-0 hover:bg-accent/40"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{t.description}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(cashDate(t))}
                    {t.type === "transferencia"
                      ? " · Transferência"
                      : t.categories
                        ? ` · ${t.categories.name}`
                        : " · Sem categoria"}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium tabular-nums ${
                    k === "positive"
                      ? "text-success"
                      : k === "negative"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                >
                  {formatTransactionAmount(t)}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
