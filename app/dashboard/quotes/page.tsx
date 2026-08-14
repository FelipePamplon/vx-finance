"use client";

import Link from "next/link";
import { FileText, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { quotesApi } from "@/hooks/use-quotes";
import { QUOTE_STATUS_BADGE_VARIANT, QUOTE_STATUS_LABELS } from "@/lib/labels";
import type { QuoteWithRelations } from "@/types/database";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

export default function QuotesPage() {
  const { data: quotes, isLoading } = quotesApi.useList();
  const deleteQuote = quotesApi.useDelete();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  async function handleDelete(quote: QuoteWithRelations) {
    const ok = await confirm({
      title: "Excluir orçamento",
      description: `Tem certeza que deseja excluir o orçamento "${quote.title}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteQuote.mutateAsync(quote.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Monte orçamentos com itens personalizados ou do catálogo de serviços
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/quotes/new">
            <Plus className="size-4" />
            Novo orçamento
          </Link>
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-20">Nº</TableHead>
            <TableHead>Título</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Válido até</TableHead>
            <TableHead>Total</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Carregando...
              </TableCell>
            </TableRow>
          )}

          {!isLoading && quotes?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nenhum orçamento criado ainda.
              </TableCell>
            </TableRow>
          )}

          {quotes?.map((quote) => (
            <TableRow key={quote.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                #{String(quote.number).padStart(4, "0")}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <FileText className="size-4" />
                  </span>
                  {quote.title}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {quote.clients?.company ?? "-"}
              </TableCell>
              <TableCell>
                <Badge variant={QUOTE_STATUS_BADGE_VARIANT[quote.status]}>
                  {QUOTE_STATUS_LABELS[quote.status]}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {quote.valid_until ? formatDate(quote.valid_until) : "-"}
              </TableCell>
              <TableCell className="tabular-nums">{formatCurrency(quote.total)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/quotes/${quote.id}/edit`}>
                        <Pencil className="size-4" />
                        Editar
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(quote)}
                    >
                      <Trash2 className="size-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {ConfirmDialog}
    </div>
  );
}
