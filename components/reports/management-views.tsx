"use client";

import { useMemo } from "react";

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
import {
  clientConcentration,
  partnerAccounts,
  projectResults,
  type ProjectResult,
} from "@/lib/analytics";
import type { ExportTable } from "@/lib/export";
import { formatCurrency, formatPercent } from "@/lib/format";
import type { Partner, Project, TransactionWithRelations } from "@/types/database";

type Rows = TransactionWithRelations[];

function Stat({ label, value, hint, cls }: { label: string; value: string; hint?: string; cls?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-xl font-semibold tabular-nums ${cls ?? "text-foreground"}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function Barra({ pct, alerta }: { pct: number; alerta?: boolean }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-accent">
      <div
        className={`h-full rounded-full ${alerta ? "bg-destructive" : "bg-primary"}`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projetos
// ---------------------------------------------------------------------------

export function ProjectsView({ rows, projects }: { rows: Rows; projects: Project[] }) {
  const resultados = useMemo(() => projectResults(rows, projects), [rows, projects]);
  const vinculados = resultados.filter((r) => r.id !== null);
  const semProjeto = resultados.find((r) => r.id === null);
  const custoTotal = resultados.reduce((s, r) => s + r.custo, 0);
  const pctSem = custoTotal > 0 && semProjeto ? (semProjeto.custo / custoTotal) * 100 : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Receita em projetos"
          value={formatCurrency(vinculados.reduce((s, r) => s + r.receita, 0))}
          cls="text-success"
        />
        <Stat
          label="Custo direto em projetos"
          value={formatCurrency(vinculados.reduce((s, r) => s + r.custo, 0))}
          cls="text-destructive"
        />
        <Stat
          label="Custo sem projeto"
          value={formatPercent(pctSem, 0)}
          hint={
            semProjeto
              ? `${formatCurrency(semProjeto.custo)} fora da análise de margem`
              : "Tudo vinculado"
          }
          cls={pctSem > 30 ? "text-destructive" : "text-foreground"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Margem por projeto</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="text-right">Custo direto</TableHead>
                <TableHead className="text-right">Margem</TableHead>
                <TableHead className="text-right">Margem %</TableHead>
                <TableHead className="min-w-[160px]">Orçamento de custo</TableHead>
                <TableHead className="min-w-[160px]">Contrato faturado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultados.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhum lançamento operacional no período.
                  </TableCell>
                </TableRow>
              )}
              {resultados.map((r) => (
                <ProjectRow key={r.id ?? "sem"} r={r} />
              ))}
            </TableBody>
          </Table>
          <p className="pt-3 text-xs text-muted-foreground">
            Margem = receita operacional menos custo direto lançado no projeto. Imposto,
            resultado financeiro e distribuição não são custo de projeto. Para vincular
            lançamentos, use o filtro &quot;Sem projeto&quot; e a edição em massa no Fluxo de Caixa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ProjectRow({ r }: { r: ProjectResult }) {
  const estourou = (r.budgetUsedPct ?? 0) > 100;
  return (
    <TableRow className={r.id === null ? "text-muted-foreground" : undefined}>
      <TableCell>
        <span className="font-medium text-foreground">{r.name}</span>
        <p className="text-xs text-muted-foreground">
          {[r.client, `${r.lancamentos} lançamento(s)`].filter(Boolean).join(" · ")}
        </p>
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(r.receita)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(r.custo)}</TableCell>
      <TableCell
        className={`text-right font-medium tabular-nums ${
          r.margem >= 0 ? "text-success" : "text-destructive"
        }`}
      >
        {formatCurrency(r.margem)}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {r.margemPct === null ? "—" : formatPercent(r.margemPct)}
      </TableCell>
      <TableCell>
        {r.budgetUsedPct === null ? (
          <span className="text-xs text-muted-foreground">sem orçamento</span>
        ) : (
          <div className="flex flex-col gap-1">
            <span className={`text-xs tabular-nums ${estourou ? "text-destructive" : ""}`}>
              {formatPercent(r.budgetUsedPct, 0)} de {formatCurrency(r.budget)}
            </span>
            <Barra pct={r.budgetUsedPct} alerta={estourou} />
          </div>
        )}
      </TableCell>
      <TableCell>
        {r.contractBilledPct === null ? (
          <span className="text-xs text-muted-foreground">sem valor de contrato</span>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-xs tabular-nums">
              {formatPercent(r.contractBilledPct, 0)} de {formatCurrency(r.contract)}
            </span>
            <Barra pct={r.contractBilledPct} />
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}

export function projectsExport(rows: Rows, projects: Project[], periodo: string): ExportTable {
  return {
    title: "Margem por projeto",
    subtitle: periodo,
    head: ["Projeto", "Cliente", "Receita", "Custo direto", "Margem", "Margem %", "Orçamento", "Contrato"],
    body: projectResults(rows, projects).map((r) => [
      r.name,
      r.client ?? "-",
      r.receita,
      r.custo,
      r.margem,
      r.margemPct === null ? "-" : formatPercent(r.margemPct),
      r.budget,
      r.contract,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Clientes
// ---------------------------------------------------------------------------

export function ClientsView({ rows }: { rows: Rows }) {
  const { clientes, total, maiorPct } = useMemo(() => clientConcentration(rows), [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Receita operacional" value={formatCurrency(total)} cls="text-success" />
        <Stat label="Clientes com receita" value={String(clientes.filter((c) => c.id).length)} />
        <Stat
          label="Maior cliente"
          value={formatPercent(maiorPct, 0)}
          hint={
            maiorPct >= 60
              ? "Concentração alta: a perda ou atraso desse cliente compromete o caixa."
              : "Participação do maior cliente na receita."
          }
          cls={maiorPct >= 60 ? "text-destructive" : "text-foreground"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Receita por cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Receita</TableHead>
                <TableHead className="min-w-[200px]">Participação</TableHead>
                <TableHead className="text-right">Lançamentos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clientes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nenhuma receita operacional no período.
                  </TableCell>
                </TableRow>
              )}
              {clientes.map((c) => (
                <TableRow key={c.id ?? "sem"}>
                  <TableCell className="font-medium">
                    {c.name}
                    {!c.id && (
                      <Badge variant="destructive" className="ml-2">
                        vincular
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.receita)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Barra pct={c.pct} alerta={c.pct >= 60} />
                      <span className="w-12 shrink-0 text-right text-xs tabular-nums">
                        {formatPercent(c.pct, 0)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.lancamentos}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function clientsExport(rows: Rows, periodo: string): ExportTable {
  return {
    title: "Receita por cliente",
    subtitle: periodo,
    head: ["Cliente", "Receita", "Participação %", "Lançamentos"],
    body: clientConcentration(rows).clientes.map((c) => [
      c.name,
      c.receita,
      formatPercent(c.pct),
      c.lancamentos,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Socios
// ---------------------------------------------------------------------------

export function PartnersView({ rows, partners }: { rows: Rows; partners: Partner[] }) {
  const resumo = useMemo(() => partnerAccounts(rows, partners), [rows, partners]);
  const participacaoOk = Math.abs(resumo.somaParticipacao - 100) < 0.01;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Lucro antes da distribuição"
          value={formatCurrency(resumo.lucroDistribuivel)}
          hint="Resultado operacional + financeiro do período"
          cls={resumo.lucroDistribuivel >= 0 ? "text-success" : "text-destructive"}
        />
        <Stat label="Já distribuído" value={formatCurrency(resumo.totalRetirado)} />
        <Stat
          label="Lucro retido"
          value={formatCurrency(resumo.lucroDistribuivel - resumo.totalRetirado)}
          hint="O que ficou na empresa"
          cls={
            resumo.lucroDistribuivel - resumo.totalRetirado >= 0
              ? "text-foreground"
              : "text-destructive"
          }
        />
      </div>

      {!participacaoOk && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6 text-sm">
            <p className="font-medium text-foreground">
              A participação cadastrada soma {resumo.somaParticipacao.toLocaleString("pt-BR")}%, não 100%.
            </p>
            <p className="text-muted-foreground">
              Sem a participação de cada sócio (tela Sócios), a coluna &quot;Direito&quot; fica zerada e
              não dá para dizer quem retirou acima ou abaixo da sua parte.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Conta corrente de sócios</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sócio</TableHead>
                <TableHead className="text-right">Participação</TableHead>
                <TableHead className="text-right">Direito no lucro</TableHead>
                <TableHead className="text-right">Retirado</TableHead>
                <TableHead className="text-right">Saldo a retirar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resumo.contas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    Nenhum sócio cadastrado.
                  </TableCell>
                </TableRow>
              )}
              {resumo.contas.map((c) => (
                <TableRow key={c.id ?? "sem"}>
                  <TableCell className="font-medium">
                    {c.name}
                    <p className="text-xs font-normal text-muted-foreground">
                      {c.retiradas} retirada(s)
                    </p>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.id ? formatPercent(c.share, 2) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {participacaoOk ? formatCurrency(c.direito) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(c.retirado)}</TableCell>
                  <TableCell
                    className={`text-right font-medium tabular-nums ${
                      !participacaoOk
                        ? "text-muted-foreground"
                        : c.saldo >= 0
                          ? "text-success"
                          : "text-destructive"
                    }`}
                  >
                    {participacaoOk ? formatCurrency(c.saldo) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="pt-3 text-xs text-muted-foreground">
            Direito = participação × lucro antes da distribuição no período filtrado. Saldo
            negativo significa retirada acima da parte que cabe ao sócio no período.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function partnersExport(rows: Rows, partners: Partner[], periodo: string): ExportTable {
  return {
    title: "Conta corrente de sócios",
    subtitle: periodo,
    head: ["Sócio", "Participação %", "Direito no lucro", "Retirado", "Saldo a retirar"],
    body: partnerAccounts(rows, partners).contas.map((c) => [
      c.name,
      c.share,
      c.direito,
      c.retirado,
      c.saldo,
    ]),
  };
}
