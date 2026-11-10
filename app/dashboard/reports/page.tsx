"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DreMonthlyView, dreMonthlyExport } from "@/components/reports/dre-monthly-view";
import { DreView, dreExport } from "@/components/reports/dre-view";
import {
  ClientsView,
  PartnersView,
  ProjectsView,
  clientsExport,
  partnersExport,
  projectsExport,
} from "@/components/reports/management-views";
import { StatementView, statementExport } from "@/components/reports/statement-view";
import { TaxView, taxExport } from "@/components/reports/tax-view";
import { LedgerFilters } from "@/components/transactions/ledger-filters";
import { useAccountBalances } from "@/hooks/use-account-balances";
import { partnersApi } from "@/hooks/use-partners";
import { projectsApi } from "@/hooks/use-projects";
import { transactionsApi } from "@/hooks/use-transactions";
import { formatDate, todayISO, yearStart } from "@/lib/dates";
import { exportCsv, exportExcel, exportPdf, type ExportTable } from "@/lib/export";
import { signedAmountTotal } from "@/lib/finance";
import { formatCurrency, round2 } from "@/lib/format";
import {
  TRANSACTION_STATUS_BADGE_VARIANT as STATUS_BADGE_VARIANT,
  TRANSACTION_STATUS_LABELS as STATUS_LABELS,
  TRANSACTION_TYPE_LABELS as TYPE_LABELS,
  formatTransactionAmount,
  transactionAmountTone,
} from "@/lib/labels";
import {
  applyLedgerFilters,
  EMPTY_FILTERS,
  filtersFromParams,
  type LedgerFilterState,
} from "@/lib/ledger-filters";
import type { TransactionWithRelations } from "@/types/database";

const VIEWS = [
  { key: "fluxo", label: "Fluxo de Caixa" },
  { key: "dre", label: "DRE" },
  { key: "mensal", label: "DRE mensal" },
  { key: "fiscal", label: "Posição Fiscal" },
  { key: "projetos", label: "Projetos" },
  { key: "clientes", label: "Clientes" },
  { key: "socios", label: "Sócios" },
  { key: "extrato", label: "Extrato" },
] as const;

type ViewKey = (typeof VIEWS)[number]["key"];

function fluxoExport(rows: TransactionWithRelations[], periodo: string): ExportTable {
  return {
    title: "Fluxo de Caixa",
    subtitle: periodo,
    head: ["Data", "Descrição", "Categoria", "Conta", "Cliente", "Projeto", "Tipo", "Valor", "Status"],
    body: rows.map((t) => [
      formatDate(t.date),
      t.description,
      t.type === "transferencia" ? "Transferência" : (t.categories?.name ?? "Sem categoria"),
      t.accounts?.bank ?? "-",
      t.clients?.company ?? "-",
      t.projects?.name ?? "-",
      TYPE_LABELS[t.type],
      // Com sinal: saida negativa, entrada positiva, transferencia pelo valor.
      t.type === "transferencia" ? Number(t.amount) : signedAmountTotal(t),
      STATUS_LABELS[t.status],
    ]),
  };
}

function ReportsInner() {
  const searchParams = useSearchParams();
  const { data: transactions, isLoading } = transactionsApi.useList();
  const { data: projects } = projectsApi.useList();
  const { data: partners } = partnersApi.useList();
  const { data: balances } = useAccountBalances();

  // Padrao dos relatorios: ano corrente, sem cancelados. Cancelado e dinheiro
  // que nao se moveu - so aparece se o usuario pedir pelo filtro de status.
  const defaults = useMemo<LedgerFilterState>(
    () => ({ ...EMPTY_FILTERS, from: yearStart(), to: todayISO(), status: "ativos" }),
    []
  );

  const [filters, setFilters] = useState<LedgerFilterState>(() =>
    filtersFromParams(searchParams, defaults)
  );
  const viewParam = searchParams.get("view") as ViewKey | null;
  const [view, setView] = useState<ViewKey>(
    VIEWS.some((v) => v.key === viewParam) ? (viewParam as ViewKey) : "fluxo"
  );
  const [statementAccount, setStatementAccount] = useState("");

  // Extrato: comeca na conta filtrada ou na primeira conta corrente ativa.
  useEffect(() => {
    if (statementAccount || !balances?.length) return;
    const inicial =
      balances.find((a) => a.id === filters.conta) ??
      balances.find((a) => a.is_active && a.type === "corrente") ??
      balances[0];
    setStatementAccount(inicial.id);
  }, [balances, filters.conta, statementAccount]);

  const filtered = useMemo(
    () => applyLedgerFilters(transactions ?? [], filters),
    [transactions, filters]
  );

  // A posicao fiscal usa o historico INTEIRO: a aliquota do mes depende da
  // receita dos 12 meses anteriores (RBT12), que um recorte de periodo cortaria.
  const fiscalRows = useMemo(
    () => (transactions ?? []).filter((t) => t.status !== "cancelado"),
    [transactions]
  );

  const summary = useMemo(() => {
    const validos = filtered.filter((t) => t.status !== "cancelado");
    const entradas = validos
      .filter((t) => signedAmountTotal(t) > 0)
      .reduce((s, t) => s + signedAmountTotal(t), 0);
    const saidas = validos
      .filter((t) => signedAmountTotal(t) < 0)
      .reduce((s, t) => s - signedAmountTotal(t), 0);
    return { entradas: round2(entradas), saidas: round2(saidas), resultado: round2(entradas - saidas) };
  }, [filtered]);

  const periodo =
    filters.from || filters.to
      ? `Período: ${filters.from ? formatDate(filters.from) : "início"} a ${
          filters.to ? formatDate(filters.to) : "hoje"
        }`
      : "Todo o período";

  function tabela(): ExportTable {
    switch (view) {
      case "dre":
        return dreExport(filtered, periodo);
      case "mensal":
        return dreMonthlyExport(filtered, filters.from, filters.to, periodo);
      case "fiscal":
        return taxExport(fiscalRows, periodo);
      case "projetos":
        return projectsExport(filtered, projects ?? [], periodo);
      case "clientes":
        return clientsExport(filtered, periodo);
      case "socios":
        return partnersExport(filtered, partners ?? [], periodo);
      case "extrato":
        return statementExport(
          transactions ?? [],
          balances ?? [],
          statementAccount,
          filters.from,
          filters.to,
          periodo
        );
      default:
        return fluxoExport(filtered, periodo);
    }
  }

  const semDados = isLoading || (transactions ?? []).length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Resultado, impostos, projetos, clientes e sócios — tudo exportável
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => exportCsv(tabela())} disabled={semDados}>
            <Download className="size-4" />
            CSV
          </Button>
          <Button variant="secondary" onClick={() => exportExcel(tabela())} disabled={semDados}>
            <FileSpreadsheet className="size-4" />
            Excel
          </Button>
          <Button variant="secondary" onClick={() => exportPdf(tabela())} disabled={semDados}>
            <FileText className="size-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {VIEWS.map((v) => (
          <Button
            key={v.key}
            type="button"
            size="sm"
            className="shrink-0"
            variant={view === v.key ? "default" : "outline"}
            onClick={() => setView(v.key)}
          >
            {v.label}
          </Button>
        ))}
      </div>

      <LedgerFilters
        value={filters}
        onChange={setFilters}
        defaults={defaults}
        // Extrato usa so o periodo; a posicao fiscal olha o historico inteiro.
        hide={
          view === "extrato"
            ? ["q", "tipo", "status", "conta", "categoria", "cliente", "projeto", "socio", "secao", "min", "max"]
            : view === "fiscal"
              ? ["q", "from", "to", "tipo", "status", "conta", "categoria", "cliente", "projeto", "socio", "secao", "min", "max"]
              : []
        }
      />

      {view === "fluxo" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              { label: "Entradas", value: summary.entradas, cls: "text-success" },
              { label: "Saídas", value: summary.saidas, cls: "text-destructive" },
              {
                label: "Resultado de caixa",
                value: summary.resultado,
                cls: summary.resultado >= 0 ? "text-success" : "text-destructive",
              },
            ].map((c) => (
              <Card key={c.label}>
                <CardHeader className="pb-2">
                  <CardTitle>{c.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className={`text-xl font-semibold tabular-nums ${c.cls}`}>
                    {formatCurrency(c.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    Nenhum lançamento no filtro selecionado.
                  </TableCell>
                </TableRow>
              )}
              {filtered.slice(0, 300).map((t) => {
                const k = transactionAmountTone(t);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(t.date)}
                    </TableCell>
                    <TableCell className="min-w-[220px]">{t.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t.type === "transferencia"
                        ? "Transferência"
                        : (t.categories?.name ?? "Sem categoria")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {t.accounts?.bank ?? "-"}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right tabular-nums ${
                        k === "positive"
                          ? "text-success"
                          : k === "negative"
                            ? "text-destructive"
                            : "text-muted-foreground"
                      }`}
                    >
                      {formatTransactionAmount(t)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[t.status]}>
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filtered.length > 300 && (
            <p className="text-xs text-muted-foreground">
              Mostrando os 300 primeiros de {filtered.length}. A exportação traz todos.
            </p>
          )}
        </>
      )}

      {view === "dre" && <DreView rows={filtered} />}
      {view === "mensal" && <DreMonthlyView rows={filtered} from={filters.from} to={filters.to} />}
      {view === "fiscal" && <TaxView rows={fiscalRows} />}
      {view === "projetos" && <ProjectsView rows={filtered} projects={projects ?? []} />}
      {view === "clientes" && <ClientsView rows={filtered} />}
      {view === "socios" && <PartnersView rows={filtered} partners={partners ?? []} />}
      {view === "extrato" && (
        <StatementView
          transactions={transactions ?? []}
          balances={balances ?? []}
          accountId={statementAccount}
          onAccountChange={setStatementAccount}
          from={filters.from}
          to={filters.to}
        />
      )}
    </div>
  );
}

export default function ReportsPage() {
  // useSearchParams exige um limite de Suspense.
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
      <ReportsInner />
    </Suspense>
  );
}
