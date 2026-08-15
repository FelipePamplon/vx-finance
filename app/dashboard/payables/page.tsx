"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CalendarClock, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { transactionsApi } from "@/hooks/use-transactions";
import type { TransactionWithRelations } from "@/types/database";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

type BucketKey = "vencidas" | "hoje" | "sete" | "trinta" | "depois";

const BUCKETS: { key: BucketKey; label: string; tone: string }[] = [
  { key: "vencidas", label: "Vencidas", tone: "text-destructive" },
  { key: "hoje", label: "Vence hoje", tone: "text-destructive" },
  { key: "sete", label: "Próximos 7 dias", tone: "text-primary" },
  { key: "trinta", label: "Próximos 30 dias", tone: "text-foreground" },
  { key: "depois", label: "Depois", tone: "text-muted-foreground" },
];

function bucketOf(dueDate: string, today: string): BucketKey {
  if (dueDate < today) return "vencidas";
  if (dueDate === today) return "hoje";
  if (dueDate <= addDays(today, 7)) return "sete";
  if (dueDate <= addDays(today, 30)) return "trinta";
  return "depois";
}

/** Vencimento e o campo certo; "date" e a competencia e nem sempre coincide. */
function dueOf(t: TransactionWithRelations) {
  return t.due_date ?? t.date;
}

export default function PayablesPage() {
  const { data: transactions, isLoading } = transactionsApi.useList();
  const updateTransaction = transactionsApi.useUpdate();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const [view, setView] = useState<"pagar" | "receber">("pagar");
  const [payingId, setPayingId] = useState<string | null>(null);

  const today = todayISO();

  const open = useMemo(
    () =>
      (transactions ?? [])
        .filter((t) => t.status === "pendente" && t.type !== "transferencia")
        .sort((a, b) => dueOf(a).localeCompare(dueOf(b))),
    [transactions]
  );

  const aPagar = useMemo(() => open.filter((t) => t.type === "despesa"), [open]);
  const aReceber = useMemo(() => open.filter((t) => t.type === "receita"), [open]);

  const totalPagar = aPagar.reduce((s, t) => s + Number(t.amount), 0);
  const totalReceber = aReceber.reduce((s, t) => s + Number(t.amount), 0);
  const vencidasCount = open.filter((t) => dueOf(t) < today).length;

  const rows = view === "pagar" ? aPagar : aReceber;

  const grouped = useMemo(() => {
    const map = new Map<BucketKey, TransactionWithRelations[]>();
    rows.forEach((t) => {
      const key = bucketOf(dueOf(t), today);
      map.set(key, [...(map.get(key) ?? []), t]);
    });
    return map;
  }, [rows, today]);

  async function handleMarkPaid(t: TransactionWithRelations) {
    const label = t.type === "receita" ? "recebido" : "pago";
    const ok = await confirm({
      title: `Marcar como ${label}`,
      description: `Confirmar "${t.description}" (${formatCurrency(Number(t.amount))}) como ${label} hoje (${formatDate(today)})?`,
      confirmLabel: `Marcar como ${label}`,
    });
    if (!ok) return;

    setPayingId(t.id);
    try {
      await updateTransaction.mutateAsync({
        id: t.id,
        values: { status: "pago", paid_date: today },
      });
    } finally {
      setPayingId(null);
    }
  }

  const summaryCards = [
    {
      label: "Total a pagar",
      value: totalPagar,
      icon: ArrowDownCircle,
      accent: "text-destructive",
      iconBg: "bg-destructive/10",
    },
    {
      label: "Total a receber",
      value: totalReceber,
      icon: ArrowUpCircle,
      accent: "text-success",
      iconBg: "bg-success/10",
    },
    {
      label: "Saldo previsto",
      value: totalReceber - totalPagar,
      icon: CalendarClock,
      accent: totalReceber - totalPagar >= 0 ? "text-success" : "text-destructive",
      iconBg: totalReceber - totalPagar >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Contas a Pagar / Receber</h1>
        <p className="text-sm text-muted-foreground">
          Tudo que está em aberto, organizado por vencimento
        </p>
      </div>

      {vencidasCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {vencidasCount === 1
            ? "1 conta está vencida e ainda em aberto."
            : `${vencidasCount} contas estão vencidas e ainda em aberto.`}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{card.label}</CardTitle>
                <span
                  className={`flex size-8 items-center justify-center rounded-full ${card.iconBg}`}
                >
                  <Icon className={`size-4 ${card.accent}`} />
                </span>
              </CardHeader>
              <CardContent>
                <p className={`text-2xl font-semibold tabular-nums ${card.accent}`}>
                  {formatCurrency(card.value)}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={view === "pagar" ? "default" : "outline"}
          onClick={() => setView("pagar")}
        >
          A pagar ({aPagar.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant={view === "receber" ? "default" : "outline"}
          onClick={() => setView("receber")}
        >
          A receber ({aReceber.length})
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <Check className="size-8 text-success" />
            <p className="text-sm font-medium text-foreground">
              Nada {view === "pagar" ? "a pagar" : "a receber"} em aberto.
            </p>
            <p className="text-sm text-muted-foreground">
              Lançamentos com status &quot;pendente&quot; aparecem aqui, agrupados pelo
              vencimento.
            </p>
          </CardContent>
        </Card>
      )}

      {BUCKETS.map((bucket) => {
        const items = grouped.get(bucket.key) ?? [];
        if (items.length === 0) return null;
        const bucketTotal = items.reduce((s, t) => s + Number(t.amount), 0);

        return (
          <div key={bucket.key} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h2 className={`text-sm font-semibold ${bucket.tone}`}>
                {bucket.label}
                <span className="ml-2 font-normal text-muted-foreground">
                  ({items.length})
                </span>
              </h2>
              <span className={`text-sm font-semibold tabular-nums ${bucket.tone}`}>
                {formatCurrency(bucketTotal)}
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>{view === "pagar" ? "Categoria" : "Cliente"}</TableHead>
                  <TableHead className="w-36">Valor</TableHead>
                  <TableHead className="w-44" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatDate(dueOf(t))}
                      {dueOf(t) < today && (
                        <Badge variant="destructive" className="ml-2">
                          vencida
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{t.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {view === "pagar"
                        ? (t.categories?.name ?? "-")
                        : (t.clients?.company ?? "-")}
                    </TableCell>
                    <TableCell
                      className={
                        view === "pagar"
                          ? "tabular-nums text-destructive"
                          : "tabular-nums text-success"
                      }
                    >
                      {formatCurrency(Number(t.amount))}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        isLoading={payingId === t.id}
                        onClick={() => handleMarkPaid(t)}
                      >
                        <Check className="size-4" />
                        {view === "pagar" ? "Marcar como pago" : "Marcar recebido"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );
      })}
      {ConfirmDialog}
    </div>
  );
}
