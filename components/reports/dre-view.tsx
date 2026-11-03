"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DreSection, TransactionWithRelations } from "@/types/database";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function sectionOf(t: TransactionWithRelations): DreSection {
  return t.categories?.dre_section ?? "operacional";
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

function total(rows: TransactionWithRelations[]) {
  return rows.reduce((sum, t) => sum + Number(t.amount), 0);
}

/**
 * DRE em camadas.
 *
 * Somar toda despesa numa linha so misturava coisas de natureza diferente:
 * imposto sobre faturamento e deducao da receita, rendimento de aplicacao e
 * resultado financeiro, e distribuicao de lucro nao e custo nenhum - e destino
 * do lucro. Com tudo junto, a distribuicao aos socios (42% das "despesas" em
 * 2026) comia o resultado e a empresa parecia quase metade do que e.
 *
 * A camada de cada categoria vem de `dre_section`, definido na tela de
 * Categorias. Nada aqui altera saldo: e so apresentacao do resultado.
 */
export function DreView({ rows }: { rows: TransactionWithRelations[] }) {
  const dre = useMemo(() => {
    const receitaOperacional = rows.filter(
      (t) => t.type === "receita" && sectionOf(t) === "operacional"
    );
    const impostos = rows.filter(
      (t) => t.type === "despesa" && sectionOf(t) === "imposto"
    );
    const operacionais = rows.filter(
      (t) => t.type === "despesa" && sectionOf(t) === "operacional"
    );
    const financeiras = rows.filter((t) => sectionOf(t) === "financeira");
    const distribuicao = rows.filter((t) => sectionOf(t) === "distribuicao");

    const receitaBruta = total(receitaOperacional);
    const totalImpostos = total(impostos);
    const receitaLiquida = receitaBruta - totalImpostos;
    const totalOperacionais = total(operacionais);
    const resultadoOperacional = receitaLiquida - totalOperacionais;

    // Resultado financeiro: rendimento entra, IR/IOF sai.
    const resultadoFinanceiro = financeiras.reduce(
      (sum, t) => sum + (t.type === "receita" ? Number(t.amount) : -Number(t.amount)),
      0
    );

    const totalDistribuicao = total(distribuicao);

    return {
      receitaCategorias: groupByCategory(receitaOperacional),
      impostoCategorias: groupByCategory(impostos),
      operacionalCategorias: groupByCategory(operacionais),
      financeiraCategorias: groupByCategory(financeiras),
      distribuicaoCategorias: groupByCategory(distribuicao),
      receitaBruta,
      totalImpostos,
      receitaLiquida,
      totalOperacionais,
      resultadoOperacional,
      resultadoFinanceiro,
      resultadoAntesDistribuicao: resultadoOperacional + resultadoFinanceiro,
      totalDistribuicao,
      lucroRetido: resultadoOperacional + resultadoFinanceiro - totalDistribuicao,
      temFinanceiro: financeiras.length > 0,
      temDistribuicao: distribuicao.length > 0,
      temImposto: impostos.length > 0,
    };
  }, [rows]);

  const margem =
    dre.receitaBruta > 0 ? (dre.resultadoOperacional / dre.receitaBruta) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Demonstração do Resultado (DRE)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col divide-y divide-border text-sm">
          <Linha rotulo="Receita Bruta" valor={dre.receitaBruta} tom="success" forte />
          {dre.receitaCategorias.map((c) => (
            <Detalhe key={`rec-${c.name}`} nome={c.name} valor={c.value} />
          ))}

          {dre.temImposto && (
            <>
              <Linha
                rotulo="(-) Impostos sobre faturamento"
                valor={dre.totalImpostos}
                tom="destructive"
                forte
              />
              {dre.impostoCategorias.map((c) => (
                <Detalhe key={`imp-${c.name}`} nome={c.name} valor={c.value} />
              ))}
              <Linha rotulo="= Receita Líquida" valor={dre.receitaLiquida} destaque />
            </>
          )}

          <Linha
            rotulo="(-) Custos e despesas operacionais"
            valor={dre.totalOperacionais}
            tom="destructive"
            forte
          />
          {dre.operacionalCategorias.map((c) => (
            <Detalhe key={`op-${c.name}`} nome={c.name} valor={c.value} />
          ))}

          <Linha
            rotulo="= Resultado Operacional"
            valor={dre.resultadoOperacional}
            destaque
            sufixo={dre.receitaBruta > 0 ? `margem ${margem.toFixed(1)}%` : undefined}
          />

          {dre.temFinanceiro && (
            <>
              <Linha
                rotulo="(+/-) Resultado financeiro"
                valor={dre.resultadoFinanceiro}
                tom={dre.resultadoFinanceiro >= 0 ? "success" : "destructive"}
                forte
              />
              {dre.financeiraCategorias.map((c) => (
                <Detalhe key={`fin-${c.name}`} nome={c.name} valor={c.value} />
              ))}
            </>
          )}

          {dre.temDistribuicao && (
            <>
              <Linha
                rotulo="(-) Distribuição aos sócios"
                valor={dre.totalDistribuicao}
                tom="destructive"
                forte
              />
              {dre.distribuicaoCategorias.map((c) => (
                <Detalhe key={`dist-${c.name}`} nome={c.name} valor={c.value} />
              ))}
            </>
          )}

          <div className="flex items-center justify-between py-4 text-base font-semibold text-foreground">
            <span>{dre.temDistribuicao ? "= Lucro Retido" : "= Resultado Líquido"}</span>
            <span className={dre.lucroRetido >= 0 ? "text-success" : "text-destructive"}>
              {formatCurrency(dre.lucroRetido)}
            </span>
          </div>
        </div>

        {dre.temDistribuicao && (
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
      className={`flex items-center justify-between py-3 ${
        destaque ? "bg-accent/30 -mx-6 px-6 font-semibold" : forte ? "font-medium" : ""
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

function Detalhe({ nome, valor }: { nome: string; valor: number }) {
  return (
    <div className="flex items-center justify-between py-2 pl-4 text-muted-foreground">
      <span>{nome}</span>
      <span className="tabular-nums">{formatCurrency(valor)}</span>
    </div>
  );
}
