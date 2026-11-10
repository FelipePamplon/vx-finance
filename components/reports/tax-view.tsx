"use client";

import { useMemo } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { monthLabel, todayISO } from "@/lib/dates";
import type { ExportTable } from "@/lib/export";
import { apurarFiscal } from "@/lib/fiscal";
import { formatCurrency } from "@/lib/format";
import { ANEXO_III, aliquotaEfetiva, detalharDas } from "@/lib/tax";
import type { TransactionWithRelations } from "@/types/database";

/**
 * Posicao fiscal do Simples Nacional.
 *
 * Responde a pergunta que o sistema nao respondia: quanto de imposto o
 * faturamento ja gerou e quanto disso ainda nao foi provisionado. Com receita
 * concentrada em poucos recebimentos grandes, descobrir o DAS so quando a guia
 * chega e o que aperta o caixa.
 *
 * A apuracao vive em lib/fiscal (a mesma da Saude dos Dados). Base: receita
 * operacional por competencia; rendimento de aplicacao fica de fora.
 */
export function TaxView({ rows }: { rows: TransactionWithRelations[] }) {
  const fiscal = useMemo(() => apurarFiscal(rows, todayISO()), [rows]);
  const simples = fiscal.linhas.filter((l) => l.regime === "simples");
  const ultimo = simples[simples.length - 1];

  const atual = ultimo ? aliquotaEfetiva(ultimo.rbt12) : aliquotaEfetiva(0);
  const detalhe = ultimo ? detalharDas(ultimo.faturamento, ultimo.aliquota) : null;
  const tetoFaixa = ANEXO_III[atual.faixa - 1]?.ate;

  return (
    <div className="flex flex-col gap-4">
      {fiscal.emAberto > 1 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-foreground">
                {formatCurrency(fiscal.emAberto)} de DAS ainda não lançado
              </p>
              <p className="text-sm text-muted-foreground">
                Imposto que o faturamento já gerou e que não está em Contas a Pagar nem foi
                pago. O DAS vence no dia 20 do mês seguinte à competência.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {fiscal.mei.receita > 0 && (
        <Card className={fiscal.mei.excedeTolerancia ? "border-primary/40 bg-primary/5" : undefined}>
          <CardContent className="flex items-start gap-3 pt-6">
            <Info className="mt-0.5 size-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium text-foreground">
                {formatCurrency(fiscal.mei.receita)} foram faturados no período em que a empresa
                era MEI
              </p>
              <p className="text-muted-foreground">
                Nesses meses o imposto era o DAS-MEI fixo, sem relação com o faturamento, e o
                PGDAS-D declara as receitas anteriores como zero — por isso não há Simples a
                provisionar sobre eles aqui.
                {fiscal.mei.excedeTolerancia && (
                  <>
                    {" "}
                    <strong className="text-foreground">Ponto para a contabilidade:</strong> a
                    receita do ano ({formatCurrency(fiscal.mei.receitaAno)}) supera o limite do
                    MEI ({formatCurrency(fiscal.mei.limite)}) em mais de 20%. Nessa situação a
                    regra geral é o desenquadramento retroativo a janeiro, com imposto devido
                    também sobre a receita do período MEI. Confirme como isso foi tratado.
                  </>
                )}
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
              {(atual.efetiva * 100).toFixed(2)}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Anexo III · faixa {atual.faixa}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>RBT12</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {formatCurrency(atual.rbt12)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Receita dos 12 meses anteriores (proporcionalizada no 1º ano)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Falta para a próxima faixa</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold tabular-nums text-foreground">
              {atual.faixa >= ANEXO_III.length || tetoFaixa === undefined
                ? "—"
                : formatCurrency(Math.max(0, tetoFaixa - atual.rbt12))}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Ao cruzar, a alíquota sobe</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Imposto sobre faturamento, por competência</CardTitle>
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
              {fiscal.linhas.map((l) => (
                <TableRow key={l.mes}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {monthLabel(l.mes)}
                    {l.regime === "mei" && (
                      <Badge variant="outline" className="ml-2">
                        MEI
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(l.faturamento)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {l.regime === "mei" ? "—" : formatCurrency(l.rbt12)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {l.regime === "mei" ? "fixo" : `${(l.aliquota * 100).toFixed(2)}%`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.regime === "mei" ? "—" : formatCurrency(l.devido)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(l.lancado)}</TableCell>
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

          {fiscal.linhas.length === 0 && (
            <p className="pt-2 text-sm text-muted-foreground">
              Nenhum faturamento no período selecionado.
            </p>
          )}
          <p className="pt-3 text-xs text-muted-foreground">
            O imposto entra pela competência: o DAS de outubro tem competência outubro e
            vencimento em 20/11. Ao lançar um DAS, use o mês do faturamento como competência.
          </p>
        </CardContent>
      </Card>

      {detalhe && ultimo && ultimo.devido > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Composição do DAS · {monthLabel(ultimo.mes)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col divide-y divide-border text-sm">
            {detalhe.tributos.map((t) => (
              <div key={t.tributo} className="flex items-center justify-between py-2">
                <span className="text-muted-foreground">{t.tributo}</span>
                <span className="tabular-nums text-foreground">{formatCurrency(t.valor)}</span>
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
        Estimativa para planejamento de caixa, conferida contra o PGDAS-D de 09/2026 (tributo a
        tributo). Não substitui a apuração da contabilidade: não trata retenção de ISS na fonte,
        segregação por anexo nem sublimite estadual.
      </p>
    </div>
  );
}

export function taxExport(rows: TransactionWithRelations[], periodo: string): ExportTable {
  return {
    title: "Posição fiscal - Simples Nacional",
    subtitle: periodo,
    head: ["Competência", "Regime", "Faturamento", "RBT12", "Alíquota %", "DAS devido", "Lançado", "A provisionar"],
    body: apurarFiscal(rows, todayISO()).linhas.map((l) => [
      monthLabel(l.mes),
      l.regime === "mei" ? "MEI" : "Simples",
      l.faturamento,
      l.rbt12,
      Number((l.aliquota * 100).toFixed(2)),
      l.devido,
      l.lancado,
      Math.max(0, l.diferenca),
    ]),
  };
}
