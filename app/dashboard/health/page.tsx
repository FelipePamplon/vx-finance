import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { todayISO } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { healthScore, runHealthChecks, type HealthSeverity } from "@/lib/health";
import { loadLedger } from "@/lib/ledger-server";
import { createClient } from "@/lib/supabase/server";

const ESTILO: Record<
  HealthSeverity,
  { label: string; borda: string; icone: typeof Info; cor: string }
> = {
  critico: {
    label: "Crítico",
    borda: "border-destructive/40 bg-destructive/5",
    icone: ShieldAlert,
    cor: "text-destructive",
  },
  atencao: {
    label: "Atenção",
    borda: "border-primary/40 bg-primary/5",
    icone: AlertTriangle,
    cor: "text-primary",
  },
  info: { label: "Para saber", borda: "border-border", icone: Info, cor: "text-muted-foreground" },
};

export default async function HealthPage() {
  const supabase = await createClient();
  const { transactions, balances, partners } = await loadLedger(supabase);
  const issues = runHealthChecks({ transactions, balances, partners, today: todayISO() });
  const score = healthScore(issues);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Saúde dos dados</h1>
        <p className="text-sm text-muted-foreground">
          Conferências que o sistema roda sozinho sobre os lançamentos. Aponta — quem decide o
          que é erro é o financeiro.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(
          [
            ["critico", score.criticos],
            ["atencao", score.atencao],
            ["info", score.info],
          ] as const
        ).map(([sev, n]) => (
          <div key={sev} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{ESTILO[sev].label}</p>
            <p className={`text-2xl font-semibold tabular-nums ${n > 0 ? ESTILO[sev].cor : "text-foreground"}`}>
              {n}
            </p>
          </div>
        ))}
      </div>

      {issues.length === 0 && (
        <Card>
          <CardContent className="flex items-center gap-3 pt-6 text-sm">
            <CheckCircle2 className="size-5 text-success" />
            Nenhuma inconsistência encontrada nas conferências automáticas.
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {issues.map((issue) => {
          const estilo = ESTILO[issue.severity];
          const Icone = estilo.icone;
          return (
            <div
              key={issue.id}
              className={`flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-start sm:justify-between ${estilo.borda}`}
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icone className={`mt-0.5 size-5 shrink-0 ${estilo.cor}`} />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{issue.title}</p>
                  <p className="text-sm text-muted-foreground">{issue.detail}</p>
                  {issue.amount !== undefined && issue.count !== undefined && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {issue.count} item(ns) · {formatCurrency(issue.amount)}
                    </p>
                  )}
                </div>
              </div>
              {issue.href && (
                <Link
                  href={issue.href}
                  className="shrink-0 self-start rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                >
                  {issue.action ?? "Abrir"}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        O que estas conferências não veem: lançamento que falta e não deixa rastro (uma despesa
        esquecida numa conta que continua positiva). Para isso, só a conciliação com o extrato
        do banco — faça todo mês.
      </p>
    </div>
  );
}
