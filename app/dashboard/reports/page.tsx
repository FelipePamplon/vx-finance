"use client";

import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { transactionsApi } from "@/hooks/use-transactions";
import {
  TRANSACTION_STATUS_BADGE_VARIANT as STATUS_BADGE_VARIANT,
  TRANSACTION_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/labels";
import type { TransactionType, TransactionWithRelations } from "@/types/database";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function monthStartISO() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function rowsToTable(rows: TransactionWithRelations[]) {
  return rows.map((t) => [
    formatDate(t.date),
    t.description,
    t.categories?.name ?? "-",
    t.accounts?.bank ?? "-",
    t.type === "receita" ? "Receita" : "Despesa",
    formatCurrency(t.amount),
    STATUS_LABELS[t.status],
  ]);
}

async function exportCsv(rows: TransactionWithRelations[]) {
  const header = ["Data", "Descrição", "Categoria", "Conta", "Tipo", "Valor", "Status"];
  const lines = rowsToTable(rows);
  const csvContent = [header, ...lines]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([`﻿${csvContent}`], { type: "text/csv;charset=utf-8;" });
  downloadBlob(blob, `fluxo-de-caixa-${todayISO()}.csv`);
}

async function exportExcel(rows: TransactionWithRelations[]) {
  const XLSX = await import("xlsx");
  const data = rows.map((t) => ({
    Data: formatDate(t.date),
    Descricao: t.description,
    Categoria: t.categories?.name ?? "-",
    Conta: t.accounts?.bank ?? "-",
    Tipo: t.type === "receita" ? "Receita" : "Despesa",
    Valor: t.amount,
    Status: STATUS_LABELS[t.status],
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Fluxo de Caixa");
  XLSX.writeFile(workbook, `fluxo-de-caixa-${todayISO()}.xlsx`);
}

async function exportPdf(
  rows: TransactionWithRelations[],
  summary: { entradas: number; saidas: number; resultado: number }
) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("VX Capital — Fluxo de Caixa", 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(
    `Entradas: ${formatCurrency(summary.entradas)}   Saidas: ${formatCurrency(summary.saidas)}   Resultado: ${formatCurrency(summary.resultado)}`,
    14,
    26
  );

  autoTable(doc, {
    startY: 32,
    head: [["Data", "Descrição", "Categoria", "Conta", "Tipo", "Valor", "Status"]],
    body: rowsToTable(rows),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [21, 27, 35] },
  });

  doc.save(`fluxo-de-caixa-${todayISO()}.pdf`);
}

export default function ReportsPage() {
  const { data: transactions, isLoading } = transactionsApi.useList();

  const [dateFrom, setDateFrom] = useState(monthStartISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [typeFilter, setTypeFilter] = useState<"todos" | TransactionType>("todos");

  const filteredRows = useMemo(() => {
    return (transactions ?? []).filter((t) => {
      if (t.date < dateFrom || t.date > dateTo) return false;
      if (typeFilter !== "todos" && t.type !== typeFilter) return false;
      return true;
    });
  }, [transactions, dateFrom, dateTo, typeFilter]);

  const summary = useMemo(() => {
    const entradas = filteredRows
      .filter((t) => t.type === "receita")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const saidas = filteredRows
      .filter((t) => t.type === "despesa")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return { entradas, saidas, resultado: entradas - saidas };
  }, [filteredRows]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
          <p className="text-sm text-muted-foreground">
            Fluxo de caixa filtrável e exportável
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => exportCsv(filteredRows)}
            disabled={filteredRows.length === 0}
          >
            <Download className="size-4" />
            CSV
          </Button>
          <Button
            variant="secondary"
            onClick={() => exportExcel(filteredRows)}
            disabled={filteredRows.length === 0}
          >
            <FileSpreadsheet className="size-4" />
            Excel
          </Button>
          <Button
            variant="secondary"
            onClick={() => exportPdf(filteredRows, summary)}
            disabled={filteredRows.length === 0}
          >
            <FileText className="size-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dateFrom">De</Label>
          <Input
            id="dateFrom"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dateTo">Até</Label>
          <Input
            id="dateTo"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(["todos", "receita", "despesa"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={typeFilter === option ? "default" : "outline"}
              onClick={() => setTypeFilter(option)}
            >
              {option === "todos" ? "Todos" : option === "receita" ? "Receitas" : "Despesas"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Entradas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-success">
              {formatCurrency(summary.entradas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Saídas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-semibold text-destructive">
              {formatCurrency(summary.saidas)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Resultado</CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-xl font-semibold ${summary.resultado >= 0 ? "text-success" : "text-destructive"}`}
            >
              {formatCurrency(summary.resultado)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Valor</TableHead>
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

          {!isLoading && filteredRows.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                Nenhum lançamento no período selecionado.
              </TableCell>
            </TableRow>
          )}

          {filteredRows.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="text-muted-foreground">{formatDate(t.date)}</TableCell>
              <TableCell>{t.description}</TableCell>
              <TableCell className="text-muted-foreground">
                {t.categories?.name ?? "-"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {t.accounts?.bank ?? "-"}
              </TableCell>
              <TableCell
                className={t.type === "receita" ? "text-success" : "text-destructive"}
              >
                {t.type === "receita" ? "+ " : "- "}
                {formatCurrency(t.amount)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[t.status]}>
                  {STATUS_LABELS[t.status]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
