"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dreMatrix, type DreMatrixLine } from "@/lib/analytics";
import { monthKey, monthLabel, monthsBetween } from "@/lib/dates";
import type { ExportTable } from "@/lib/export";
import { formatCurrency } from "@/lib/format";
import type { TransactionWithRelations } from "@/types/database";

function mesesDe(rows: TransactionWithRelations[], from: string, to: string): string[] {
  const comDado = rows.map((t) => monthKey(t.date)).sort();
  const inicio = from ? monthKey(from) : comDado[0];
  const fim = to ? monthKey(to) : comDado[comDado.length - 1];
  if (!inicio || !fim) return [];
  // Sem data inicial nao ha por que abrir colunas vazias antes do primeiro dado.
  const primeiro = comDado[0] && comDado[0] > inicio ? comDado[0] : inicio;
  return monthsBetween(primeiro, fim).slice(-24);
}

function corDe(l: DreMatrixLine, v: number): string {
  if (Math.abs(v) < 0.005) return "text-muted-foreground/60";
  if (l.kind === "detalhe") return "text-muted-foreground";
  if (l.tom === "sai") return "text-destructive";
  return v >= 0 ? "text-success" : "text-destructive";
}

/**
 * DRE com um mes por coluna. O DRE de periodo unico nao mostra tendencia: nao da
 * para ver que um custo dobrou ou em que mes a margem caiu.
 */
export function DreMonthlyView({
  rows,
  from,
  to,
}: {
  rows: TransactionWithRelations[];
  from: string;
  to: string;
}) {
  const { months, lines } = useMemo(
    () => dreMatrix(rows, mesesDe(rows, from, to)),
    [rows, from, to]
  );
  const visiveis = lines.filter((l) => l.kind !== "detalhe" || Math.abs(l.total) >= 0.005);

  return (
    <Card>
      <CardHeader>
        <CardTitle>DRE mês a mês</CardTitle>
      </CardHeader>
      <CardContent>
        {months.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum lançamento no período selecionado.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card py-2 pr-4 text-left font-medium">
                    Linha
                  </th>
                  {months.map((m) => (
                    <th key={m} className="px-3 py-2 text-right font-medium">
                      {monthLabel(m)}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium text-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr
                    key={l.key}
                    className={`border-b border-border/60 ${
                      l.kind === "subtotal" ? "bg-accent/30 font-semibold" : ""
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 whitespace-nowrap py-2 pr-4 ${
                        l.kind === "subtotal" ? "bg-accent" : "bg-card"
                      } ${
                        l.kind === "detalhe"
                          ? "pl-4 text-muted-foreground"
                          : "font-medium text-foreground"
                      }`}
                    >
                      {l.label}
                    </td>
                    {l.values.map((v, i) => (
                      <td
                        key={months[i]}
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${corDe(l, v)}`}
                      >
                        {Math.abs(v) < 0.005 ? "—" : formatCurrency(v)}
                      </td>
                    ))}
                    <td
                      className={`whitespace-nowrap py-2 pl-3 text-right font-medium tabular-nums ${corDe(l, l.total)}`}
                    >
                      {formatCurrency(l.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function dreMonthlyExport(
  rows: TransactionWithRelations[],
  from: string,
  to: string,
  periodo: string
): ExportTable {
  const { months, lines } = dreMatrix(rows, mesesDe(rows, from, to));
  return {
    title: "DRE mensal",
    subtitle: periodo,
    head: ["Linha", ...months.map((m) => monthLabel(m)), "Total"],
    body: lines
      .filter((l) => l.kind !== "detalhe" || Math.abs(l.total) >= 0.005)
      .map((l) => [l.kind === "detalhe" ? `   ${l.label}` : l.label, ...l.values, l.total]),
  };
}
