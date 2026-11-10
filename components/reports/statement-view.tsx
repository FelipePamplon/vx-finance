"use client";

import { useMemo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { accountStatement } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import type { ExportTable } from "@/lib/export";
import { signedAmountForAccount } from "@/lib/finance";
import { formatCurrency, round2 } from "@/lib/format";
import type { AccountBalance, TransactionWithRelations } from "@/types/database";

interface Props {
  /** TODOS os lancamentos: o saldo de abertura depende do que veio antes do periodo. */
  transactions: TransactionWithRelations[];
  balances: AccountBalance[];
  accountId: string;
  onAccountChange: (id: string) => void;
  from: string;
  to: string;
}

function montar(
  transactions: TransactionWithRelations[],
  conta: AccountBalance | undefined,
  from: string,
  to: string
) {
  if (!conta) return { abertura: 0, linhas: [], fechamento: 0 };
  const dataDe = (t: TransactionWithRelations) => t.paid_date ?? t.date;
  const pagos = transactions.filter((t) => t.status === "pago");

  // Abertura do periodo = saldo inicial da conta + tudo que se moveu antes dele.
  const antes = from ? pagos.filter((t) => dataDe(t) < from) : [];
  const abertura = round2(
    Number(conta.opening_balance) +
      antes.reduce((s, t) => s + signedAmountForAccount(t, conta.id), 0)
  );

  const doPeriodo = pagos.filter(
    (t) => (!from || dataDe(t) >= from) && (!to || dataDe(t) <= to)
  );
  const linhas = accountStatement(doPeriodo, conta.id, abertura);
  return { abertura, linhas, fechamento: linhas.length ? linhas[linhas.length - 1].saldo : abertura };
}

/**
 * Extrato da conta com saldo acumulado, pela data em que o dinheiro se moveu.
 * E a tela para bater com o extrato do banco linha a linha.
 */
export function StatementView({ transactions, balances, accountId, onAccountChange, from, to }: Props) {
  const conta = balances.find((a) => a.id === accountId);
  const { abertura, linhas, fechamento } = useMemo(
    () => montar(transactions, conta, from, to),
    [transactions, conta, from, to]
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Extrato por conta</CardTitle>
        <div className="w-full sm:w-72">
          <Select value={accountId} onValueChange={onAccountChange}>
            <SelectTrigger aria-label="Conta do extrato">
              <SelectValue placeholder="Selecione a conta" />
            </SelectTrigger>
            <SelectContent>
              {balances.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.bank}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!conta ? (
          <p className="text-sm text-muted-foreground">Selecione uma conta para ver o extrato.</p>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Saldo de abertura{from ? ` em ${formatDate(from)}` : ""}
                </p>
                <p className="font-semibold tabular-nums">{formatCurrency(abertura)}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Movimento do período</p>
                <p className="font-semibold tabular-nums">{formatCurrency(fechamento - abertura)}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Saldo de fechamento{to ? ` em ${formatDate(to)}` : ""}
                </p>
                <p
                  className={`font-semibold tabular-nums ${fechamento < 0 ? "text-destructive" : ""}`}
                >
                  {formatCurrency(fechamento)}
                </p>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      Nenhum movimento nesta conta no período.
                    </TableCell>
                  </TableRow>
                )}
                {linhas.map(({ t, valor, saldo }) => (
                  <TableRow key={t.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(t.paid_date ?? t.date)}
                    </TableCell>
                    <TableCell className="min-w-[220px]">
                      {t.description}
                      <p className="text-xs text-muted-foreground">
                        {t.type === "transferencia"
                          ? `Transferência · ${t.accounts?.bank ?? "?"} → ${t.transfer_accounts?.bank ?? "?"}`
                          : (t.categories?.name ?? "Sem categoria")}
                      </p>
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right tabular-nums ${
                        valor >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {formatCurrency(valor)}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right tabular-nums ${
                        saldo < 0 ? "font-medium text-destructive" : ""
                      }`}
                    >
                      {formatCurrency(saldo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function statementExport(
  transactions: TransactionWithRelations[],
  balances: AccountBalance[],
  accountId: string,
  from: string,
  to: string,
  periodo: string
): ExportTable {
  const conta = balances.find((a) => a.id === accountId);
  const { abertura, linhas } = montar(transactions, conta, from, to);
  return {
    title: `Extrato ${conta?.bank ?? ""}`.trim(),
    subtitle: periodo,
    head: ["Data", "Descrição", "Categoria", "Valor", "Saldo"],
    body: [
      [from ? formatDate(from) : "-", "Saldo de abertura", "", "", abertura],
      ...linhas.map(({ t, valor, saldo }) => [
        formatDate(t.paid_date ?? t.date),
        t.description,
        t.type === "transferencia" ? "Transferência" : (t.categories?.name ?? "Sem categoria"),
        valor,
        saldo,
      ]),
    ],
  };
}
