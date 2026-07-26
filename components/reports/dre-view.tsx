"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TransactionWithRelations } from "@/types/database";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function groupByCategory(rows: TransactionWithRelations[]) {
  const map = new Map<string, number>();
  rows.forEach((t) => {
    const key = t.categories?.name ?? "Sem categoria";
    map.set(key, (map.get(key) ?? 0) + Number(t.amount));
  });
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function DreView({ rows }: { rows: TransactionWithRelations[] }) {
  const dre = useMemo(() => {
    const receitas = rows.filter((t) => t.type === "receita");
    const despesas = rows.filter((t) => t.type === "despesa");

    const receitaCategorias = groupByCategory(receitas);
    const despesaCategorias = groupByCategory(despesas);
    const totalReceitas = receitaCategorias.reduce((sum, c) => sum + c.value, 0);
    const totalDespesas = despesaCategorias.reduce((sum, c) => sum + c.value, 0);

    return {
      receitaCategorias,
      despesaCategorias,
      totalReceitas,
      totalDespesas,
      resultado: totalReceitas - totalDespesas,
    };
  }, [rows]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demonstração do Resultado (DRE)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border text-sm">
          <div className="flex items-center justify-between py-3 font-medium text-foreground">
            <span>Receita Bruta</span>
            <span className="text-success">{formatCurrency(dre.totalReceitas)}</span>
          </div>
          {dre.receitaCategorias.map((c) => (
            <div
              key={`receita-${c.name}`}
              className="flex items-center justify-between py-2 pl-4 text-muted-foreground"
            >
              <span>{c.name}</span>
              <span>{formatCurrency(c.value)}</span>
            </div>
          ))}

          <div className="flex items-center justify-between py-3 font-medium text-foreground">
            <span>(-) Despesas</span>
            <span className="text-destructive">{formatCurrency(dre.totalDespesas)}</span>
          </div>
          {dre.despesaCategorias.map((c) => (
            <div
              key={`despesa-${c.name}`}
              className="flex items-center justify-between py-2 pl-4 text-muted-foreground"
            >
              <span>{c.name}</span>
              <span>{formatCurrency(c.value)}</span>
            </div>
          ))}

          <div className="flex items-center justify-between py-4 text-base font-semibold text-foreground">
            <span>= Resultado Líquido</span>
            <span className={dre.resultado >= 0 ? "text-success" : "text-destructive"}>
              {formatCurrency(dre.resultado)}
            </span>
          </div>
        </div>

        {rows.length === 0 && (
          <p className="pt-2 text-sm text-muted-foreground">
            Nenhum lançamento no período selecionado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
