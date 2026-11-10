"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { computeDre, type Dre, type DreLine } from "@/lib/analytics";
import type { ExportTable } from "@/lib/export";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { TransactionWithRelations } from "@/types/database";

/**
 * DRE em camadas. O calculo vive em lib/analytics (computeDre), o mesmo usado
 * pelo painel e pelo DRE mensal - aqui e so apresentacao.
 */
export function DreView({ rows }: { rows: TransactionWithRelations[] }) {
  const dre = useMemo(() => computeDre(rows), [rows]);
  const temImposto = dre.linhas.impostos.length > 0;
  const temFinanceiro = dre.linhas.financeiro.length > 0;
  const temDistribuicao = dre.linhas.distribuicao.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demonstração do Resultado (DRE)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border text-sm">
          <Linha rotulo="Receita Bruta" valor={dre.receitaBruta} tom="success" forte />
          <Detalhes linhas={dre.linhas.receita} />

          {temImposto && (
            <>
              <Linha rotulo="(−) Impostos sobre faturamento" valor={dre.impostos} tom="destructive" forte />
              <Detalhes linhas={dre.linhas.impostos} />
              <Linha rotulo="= Receita Líquida" valor={dre.receitaLiquida} destaque />
            </>
          )}

          <Linha
            rotulo="(−) Custos e despesas operacionais"
            valor={dre.custos}
            tom="destructive"
            forte
          />
          <Detalhes linhas={dre.linhas.custos} />

          <Linha
            rotulo="= Resultado Operacional"
            valor={dre.resultadoOperacional}
            destaque
            sufixo={dre.receitaBruta > 0 ? `margem ${formatPercent(dre.margemOperacional)}` : undefined}
          />

          {temFinanceiro && (
            <>
              <Linha
                rotulo="(+/−) Resultado financeiro"
                valor={dre.resultadoFinanceiro}
                tom={dre.resultadoFinanceiro >= 0 ? "success" : "destructive"}
                forte
              />
              <Detalhes linhas={dre.linhas.financeiro} />
            </>
          )}

          {temDistribuicao && (
            <>
              <Linha
                rotulo="(−) Distribuição aos sócios"
                valor={dre.distribuicao}
                tom="destructive"
                forte
              />
              <Detalhes linhas={dre.linhas.distribuicao} />
            </>
          )}

          <div className="flex items-center justify-between py-4 text-base font-semibold text-foreground">
            <span>{temDistribuicao ? "= Lucro Retido" : "= Resultado Líquido"}</span>
            <span className={dre.lucroRetido >= 0 ? "text-success" : "text-destructive"}>
              {formatCurrency(dre.lucroRetido)}
            </span>
          </div>
        </div>

        {temDistribuicao && (
          <p className="pt-2 text-xs text-muted-foreground">
            Distribuição de lucros não é custo da operação: sai do caixa, mas aparece
            abaixo do resultado. O Resultado Operacional é o que o negócio gera.
          </p>
        )}

        {rows.length === 0 && (
          <p className="pt-2 text-sm text-muted-foreground">
            Nenhum lançamento no período selecionado.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function dreExport(rows: TransactionWithRelations[], periodo: string): ExportTable {
  const d: Dre = computeDre(rows);
  const det = (linhas: DreLine[]) => linhas.map((l) => [`   ${l.name}`, l.value] as (string | number)[]);
  return {
    title: "DRE",
    subtitle: periodo,
    head: ["Linha", "Valor"],
    body: [
      ["Receita Bruta", d.receitaBruta],
      ...det(d.linhas.receita),
      ["(−) Impostos sobre faturamento", d.impostos],
      ...det(d.linhas.impostos),
      ["= Receita Líquida", d.receitaLiquida],
      ["(−) Custos e despesas operacionais", d.custos],
      ...det(d.linhas.custos),
      ["= Resultado Operacional", d.resultadoOperacional],
      ["(+/−) Resultado financeiro", d.resultadoFinanceiro],
      ...det(d.linhas.financeiro),
      ["(−) Distribuição aos sócios", d.distribuicao],
      ...det(d.linhas.distribuicao),
      ["= Lucro Retido", d.lucroRetido],
    ],
  };
}

function Linha({
  rotulo,
  valor,
  tom,
  forte,
  destaque,
  sufixo,
}: {
  rotulo: string;
  valor: number;
  tom?: "success" | "destructive";
  forte?: boolean;
  destaque?: boolean;
  sufixo?: string;
}) {
  const cor =
    tom === "success"
      ? "text-success"
      : tom === "destructive"
        ? "text-destructive"
        : valor >= 0
          ? "text-success"
          : "text-destructive";

  return (
    <div
      className={`flex items-center justify-between gap-3 py-3 ${
        destaque ? "-mx-6 bg-accent/30 px-6 font-semibold" : forte ? "font-medium" : ""
      } text-foreground`}
    >
      <span>{rotulo}</span>
      <span className="flex items-center gap-3">
        {sufixo && <span className="text-xs font-normal text-muted-foreground">{sufixo}</span>}
        <span className={`tabular-nums ${cor}`}>{formatCurrency(valor)}</span>
      </span>
    </div>
  );
}

function Detalhes({ linhas }: { linhas: DreLine[] }) {
  return (
    <>
      {linhas.map((l) => (
        <div
          key={l.name}
          className="flex items-center justify-between gap-3 py-2 pl-4 text-muted-foreground"
        >
          <span>{l.name}</span>
          <span className="tabular-nums">{formatCurrency(l.value)}</span>
        </div>
      ))}
    </>
  );
}
