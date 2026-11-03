"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { aliquotaEfetiva, detalharDas, posicaoFiscal, type FaturamentoPorMes } from "@/lib/tax";
import type { TransactionWithRelations } from "@/types/database";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mesLabel(mes: string) {
  const [ano, m] = mes.split("-");
  return new Date(Number(ano), Number(m) - 1, 1)
    .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    .replace(".", "");
}

/**
 * Posicao fiscal do Simples Nacional.
 *
 * Responde a pergunta que o sistema nao respondia: quanto de imposto o
 * faturamento ja gerou e quanto disso ainda nao foi provisionado. Com receita
 * concentrada em poucos recebimentos grandes, descobrir o DAS so quando a guia
 * chega e o que aperta o caixa.
 *
 * A base e a RECEITA OPERACIONAL por competencia. Rendimento de aplicacao fica
 * de fora (categoria marcada como "financeira"), porque nao e receita de
 * atividade e inflaria o imposto.
 */
export function TaxView({
  rows,
  inicioAtividade,
}: {
  rows: TransactionWithRelations[];
  inicioAtividade?: string;
}) {
  const dados = useMemo(() => {
    const faturamento: FaturamentoPorMes = {};
    const dasLancado: FaturamentoPorMes = {};

    rows.forEach((t) => {
      const mes = t.date.slice(0, 7);
      const secao = t.categories?.dre_section ?? "operacional";

      if (t.type === "receita" && secao === "operacional") {
        faturamento[mes] = (faturamento[mes] ?? 0) + Number(t.amount);
      }
      if (t.type === "despesa" && secao === "imposto") {
        dasLancado[mes] = (dasLancado[mes] ?? 0) + Number(t.amount);
      }
    });

    const linhas = posicaoFiscal(faturamento, dasLancado, inicioAtividade).filter(
      (l) => l.faturamento > 0 || l.lancado > 0
    );

    const aProvisionar = linhas.reduce((s, l) => s + Math.max(0, l.diferenca), 0);
    const ultimo = linhas[linhas.length - 1];

    return { linhas, aProvisionar, ultimo };
  }, [rows, inicioAtividade]);

  const proxima = dados.ultimo
    ? aliquotaEfetiva(dados.ultimo.rbt12)
    : aliquotaEfetiva(0);

  const detalhe = dados.ultimo
    ? detalharDas(dados.ultimo.faturamento, dados.ultimo.aliquota)
    : null;

  return (
    <div className="flex flex-col gap-4">
      {dados.aProvisionar > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-foreground">
                {formatCurrency(dados.aProvisionar)} de DAS ainda não lançado
              </p>
              <p className="text-sm text-muted-foreground">
                Imposto que o faturamento já gerou e que não está em Contas a Pagar.
                O DAS vence no dia 20 do mês seguinte à competência.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Alíquota efetiva atual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {(proxima.efetiva * 100).toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Anexo III · faixa {proxima.faixa}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>RBT12</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(proxima.rbt12)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Receita dos 12 meses anteriores
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Falta para a próxima faixa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {proxima.faixa >= 6
                ? "—"
                : formatCurrency(
                    Math.max(
                      0,
                      [180_000, 360_000, 720_000, 1_800_000, 3_600_000][proxima.faixa - 1] -
                        proxima.rbt12
                    )
                  )}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Ao cruzar, a alíquota sobe
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Simples Nacional mês a mês</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competência</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">RBT12</TableHead>
                <TableHead className="text-right">Alíquota</TableHead>
                <TableHead className="text-right">DAS devido</TableHead>
                <TableHead className="text-right">Lançado</TableHead>
                <TableHead className="text-right">A provisionar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dados.linhas.map((l) => (
                <TableRow key={l.mes}>
                  <TableCell className="font-medium">{mesLabel(l.mes)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(l.faturamento)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(l.rbt12)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {(l.aliquota * 100).toFixed(2)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(l.devido)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(l.lancado)}
                  </TableCell>
                  <TableCell
                    className={`text-right tabular-nums ${
                      l.diferenca > 0.009 ? "font-medium text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {l.diferenca > 0.009 ? formatCurrency(l.diferenca) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {dados.linhas.length === 0 && (
            <p className="pt-2 text-sm text-muted-foreground">
              Nenhum faturamento no período selecionado.
            </p>
          )}
        </CardContent>
      </Card>

      {detalhe && dados.ultimo && (
        <Card>
          <CardHeader>
            <CardTitle>
              Composição do DAS · {mesLabel(dados.ultimo.mes)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border text-sm">
            {detalhe.tributos.map((t) => (
              <div key={t.tributo} className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">{t.tributo}</span>
                <span className="tabular-nums text-foreground">
                  {formatCurrency(t.valor)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between py-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(detalhe.total)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        Estimativa para planejamento de caixa, conferida contra o PGDAS-D de 09/2026
        (tributo a tributo). Não substitui a apuração da contabilidade: não trata
        retenção de ISS na fonte, segregação por anexo nem sublimite estadual.
      </p>
    </div>
  );
}
