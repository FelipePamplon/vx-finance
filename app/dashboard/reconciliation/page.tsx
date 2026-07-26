"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp } from "lucide-react";

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
import { parseStatementFile, reconcile, type ReconciledEntry } from "@/lib/reconciliation";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

export default function ReconciliationPage() {
  const { data: transactions } = transactionsApi.useList();
  const [entries, setEntries] = useState<ReconciledEntry[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    const bankEntries = parseStatementFile(file.name, text);
    const reconciled = reconcile(bankEntries, transactions ?? []);
    setEntries(reconciled);
    setFileName(file.name);
  }

  const summary = useMemo(() => {
    const conciliados = entries.filter((e) => e.status === "conciliado").length;
    const naoEncontrados = entries.length - conciliados;
    return { conciliados, naoEncontrados };
  }, [entries]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Conciliação Bancária</h1>
        <p className="text-sm text-muted-foreground">
          Importe o extrato do banco (OFX ou CSV) e confira com os lançamentos já registrados
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            <FileUp className="size-4" />
            {fileName ?? "Selecionar arquivo OFX ou CSV"}
            <input
              type="file"
              accept=".ofx,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>

          <p className="text-xs text-muted-foreground">
            CSV esperado: data, descrição, valor (positivo para créditos, negativo para
            débitos). Arquivos OFX exportados pelo internet banking também são aceitos.
          </p>
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Conciliados</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-2 text-xl font-semibold text-success">
                  <CheckCircle2 className="size-5" />
                  {summary.conciliados}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Não encontrados</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-2 text-xl font-semibold text-destructive">
                  <AlertCircle className="size-5" />
                  {summary.naoEncontrados}
                </p>
              </CardContent>
            </Card>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição (extrato)</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow key={`${entry.date}-${entry.amount}-${index}`}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(entry.date)}
                  </TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell
                    className={entry.amount >= 0 ? "text-success" : "text-destructive"}
                  >
                    {formatCurrency(entry.amount)}
                  </TableCell>
                  <TableCell>
                    {entry.status === "conciliado" ? (
                      <Badge variant="success">Conciliado</Badge>
                    ) : (
                      <Badge variant="destructive">Não encontrado</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
