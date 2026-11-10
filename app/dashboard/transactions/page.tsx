"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import { LedgerFilters } from "@/components/transactions/ledger-filters";
import { TransactionDialog } from "@/components/transactions/transaction-dialog";
import { accountsApi } from "@/hooks/use-accounts";
import { categoriesApi } from "@/hooks/use-categories";
import { clientsApi } from "@/hooks/use-clients";
import { projectsApi } from "@/hooks/use-projects";
import { transactionsApi } from "@/hooks/use-transactions";
import { formatDate } from "@/lib/dates";
import { signedAmountTotal } from "@/lib/finance";
import { formatCurrency, round2 } from "@/lib/format";
import {
  TRANSACTION_STATUS_BADGE_VARIANT as STATUS_BADGE_VARIANT,
  TRANSACTION_STATUS_LABELS as STATUS_LABELS,
  formatTransactionAmount,
  transactionAmountTone,
} from "@/lib/labels";
import {
  applyLedgerFilters,
  EMPTY_FILTERS,
  filtersFromParams,
  type LedgerFilterState,
} from "@/lib/ledger-filters";
import { getAttachmentUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type { TransactionWithRelations } from "@/types/database";

const PAGE_SIZE = 50;
const KEEP = "__keep__";
const CLEAR = "__clear__";

function tone(t: TransactionWithRelations) {
  const k = transactionAmountTone(t);
  return k === "positive"
    ? "text-success"
    : k === "negative"
      ? "text-destructive"
      : "text-muted-foreground";
}

function TransactionsInner() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const { data: transactions, isLoading } = transactionsApi.useList();
  const { data: accounts } = accountsApi.useList();
  const { data: categories } = categoriesApi.useList();
  const { data: clients } = clientsApi.useList();
  const { data: projects } = projectsApi.useList();
  const deleteTransaction = transactionsApi.useDelete();

  const [filters, setFilters] = useState<LedgerFilterState>(() =>
    filtersFromParams(searchParams)
  );
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  // Edicao em massa
  const [bulkCategory, setBulkCategory] = useState(KEEP);
  const [bulkProject, setBulkProject] = useState(KEEP);
  const [bulkClient, setBulkClient] = useState(KEEP);
  const [bulkBusy, setBulkBusy] = useState(false);

  const filtered = useMemo(
    () => applyLedgerFilters(transactions ?? [], filters),
    [transactions, filters]
  );

  useEffect(() => {
    setPage(0);
    setSelected(new Set());
  }, [filters]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  // Totais do recorte. Cancelado nao e dinheiro; transferencia e neutra.
  const totals = useMemo(() => {
    const validos = filtered.filter((t) => t.status !== "cancelado");
    const entradas = validos
      .filter((t) => signedAmountTotal(t) > 0)
      .reduce((s, t) => s + signedAmountTotal(t), 0);
    const saidas = validos
      .filter((t) => signedAmountTotal(t) < 0)
      .reduce((s, t) => s - signedAmountTotal(t), 0);
    return { entradas: round2(entradas), saidas: round2(saidas), liquido: round2(entradas - saidas) };
  }, [filtered]);

  const hasPrerequisites = !!accounts?.length && !!categories?.length;
  const allOnPage = rows.length > 0 && rows.every((t) => selected.has(t.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((t) => (allOnPage ? next.delete(t.id) : next.add(t.id)));
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filtered.map((t) => t.id)));
  }

  async function applyBulk() {
    const alvo = filtered.filter((t) => selected.has(t.id));
    if (alvo.length === 0) return;

    const patch: Record<string, string | null> = {};
    if (bulkProject !== KEEP) patch.project_id = bulkProject === CLEAR ? null : bulkProject;
    if (bulkClient !== KEEP) patch.client_id = bulkClient === CLEAR ? null : bulkClient;

    const categoria = categories?.find((c) => c.id === bulkCategory);
    setBulkBusy(true);
    try {
      const supabase = createClient();
      let alterados = 0;
      let pulados = 0;

      // Projeto e cliente valem para qualquer lancamento que nao seja transferencia.
      if (Object.keys(patch).length > 0) {
        const ids = alvo.filter((t) => t.type !== "transferencia").map((t) => t.id);
        pulados += alvo.length - ids.length;
        if (ids.length > 0) {
          const { error } = await supabase.from("transactions").update(patch).in("id", ids);
          if (error) throw error;
          alterados = ids.length;
        }
      }

      // Categoria so entra em lancamento do mesmo tipo (o banco recusa o resto).
      if (categoria) {
        const ids = alvo.filter((t) => t.type === categoria.type).map((t) => t.id);
        const fora = alvo.length - ids.length;
        if (ids.length > 0) {
          const { error } = await supabase
            .from("transactions")
            .update({ category_id: categoria.id })
            .in("id", ids);
          if (error) throw error;
          alterados = Math.max(alterados, ids.length);
        }
        if (fora > 0) pulados = Math.max(pulados, fora);
      }

      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(
        `${alterados} lançamento(s) atualizado(s).` +
          (pulados > 0 ? ` ${pulados} ignorado(s) por serem de outro tipo.` : "")
      );
      setSelected(new Set());
      setBulkCategory(KEEP);
      setBulkProject(KEEP);
      setBulkClient(KEEP);
    } catch (error) {
      toast.error(`Erro na edição em massa: ${(error as Error).message}`);
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleDelete(t: TransactionWithRelations) {
    const ok = await confirm({
      title: "Excluir lançamento",
      description: `Tem certeza que deseja excluir "${t.description}"? Se ele aconteceu de verdade mas foi lançado errado, prefira editar; se não vai acontecer, cancelar preserva o histórico.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteTransaction.mutateAsync(t.id);
  }

  async function handleViewAttachment(path: string) {
    const url = await getAttachmentUrl(path);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const bulkDirty = bulkCategory !== KEEP || bulkProject !== KEEP || bulkClient !== KEEP;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Lançamentos de receitas, despesas e transferências
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          disabled={!hasPrerequisites}
        >
          <Plus className="size-4" />
          Novo lançamento
        </Button>
      </div>

      {!hasPrerequisites && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Cadastre pelo menos uma conta bancária e uma categoria antes de lançar
          movimentações.
        </p>
      )}

      <LedgerFilters value={filters} onChange={setFilters} defaults={EMPTY_FILTERS} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Lançamentos", value: String(filtered.length), cls: "text-foreground" },
          { label: "Entradas", value: formatCurrency(totals.entradas), cls: "text-success" },
          { label: "Saídas", value: formatCurrency(totals.saidas), cls: "text-destructive" },
          {
            label: "Líquido do filtro",
            value: formatCurrency(totals.liquido),
            cls: totals.liquido >= 0 ? "text-success" : "text-destructive",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${c.cls}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              {selected.size} selecionado(s)
              {selected.size < filtered.length && (
                <button
                  type="button"
                  className="ml-2 cursor-pointer text-primary underline-offset-2 hover:underline"
                  onClick={selectAllFiltered}
                >
                  selecionar todos os {filtered.length} do filtro
                </button>
              )}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger aria-label="Categoria em massa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Categoria: manter</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bulkProject} onValueChange={setBulkProject}>
              <SelectTrigger aria-label="Projeto em massa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Projeto: manter</SelectItem>
                <SelectItem value={CLEAR}>Remover projeto</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bulkClient} onValueChange={setBulkClient}>
              <SelectTrigger aria-label="Cliente em massa">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Cliente: manter</SelectItem>
                <SelectItem value={CLEAR}>Remover cliente</SelectItem>
                {clients?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.company}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={applyBulk} disabled={!bulkDirty} isLoading={bulkBusy}>
              Aplicar aos selecionados
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <input
                type="checkbox"
                className="size-4 cursor-pointer accent-primary"
                checked={allOnPage}
                onChange={togglePage}
                aria-label="Selecionar página"
              />
            </TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Carregando...
              </TableCell>
            </TableRow>
          )}

          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Nenhum lançamento encontrado para este filtro.
              </TableCell>
            </TableRow>
          )}

          {rows.map((t) => {
            const vinculos = [
              t.clients?.company,
              t.projects?.name,
              t.partners?.name,
              t.installment_total ? `parcela ${t.installment_no}/${t.installment_total}` : null,
            ].filter(Boolean);
            return (
              <TableRow key={t.id} className={t.status === "cancelado" ? "opacity-60" : undefined}>
                <TableCell>
                  <input
                    type="checkbox"
                    className="size-4 cursor-pointer accent-primary"
                    checked={selected.has(t.id)}
                    onChange={() => toggle(t.id)}
                    aria-label={`Selecionar ${t.description}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(t.date)}
                </TableCell>
                <TableCell className="min-w-[220px]">
                  <div className="flex items-center gap-1.5">
                    <span className={t.status === "cancelado" ? "line-through" : undefined}>
                      {t.description}
                    </span>
                    {t.attachment_url && (
                      <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  {vinculos.length > 0 && (
                    <p className="text-xs text-muted-foreground">{vinculos.join(" · ")}</p>
                  )}
                </TableCell>
                <TableCell>
                  {t.type === "transferencia" ? (
                    <Badge variant="outline">Transferência</Badge>
                  ) : t.categories ? (
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor: `${t.categories.color}26`,
                        color: t.categories.color,
                        borderColor: "transparent",
                      }}
                    >
                      {t.categories.name}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Sem categoria</Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {t.accounts?.bank ?? "-"}
                  {t.type === "transferencia" && t.transfer_accounts?.bank && (
                    <span className="text-xs"> → {t.transfer_accounts.bank}</span>
                  )}
                </TableCell>
                <TableCell className={`whitespace-nowrap text-right tabular-nums ${tone(t)}`}>
                  {formatTransactionAmount(t)}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[t.status]}>{STATUS_LABELS[t.status]}</Badge>
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="Ações">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {t.attachment_url && (
                        <DropdownMenuItem onClick={() => handleViewAttachment(t.attachment_url!)}>
                          <Paperclip className="size-4" />
                          Ver comprovante
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(t);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(t)}
                      >
                        <Trash2 className="size-4" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} de{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current - 1)}
              disabled={current === 0}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span>
              {current + 1} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(current + 1)}
              disabled={current >= pages - 1}
            >
              Próxima
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <TransactionDialog open={open} onOpenChange={setOpen} editing={editing} />
      {ConfirmDialog}
    </div>
  );
}

export default function TransactionsPage() {
  // useSearchParams exige um limite de Suspense.
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Carregando...</p>}>
      <TransactionsInner />
    </Suspense>
  );
}
