"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeftRight,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { transactionsApi } from "@/hooks/use-transactions";
import { accountsApi } from "@/hooks/use-accounts";
import { categoriesApi } from "@/hooks/use-categories";
import { clientsApi } from "@/hooks/use-clients";
import { projectsApi } from "@/hooks/use-projects";
import {
  TRANSACTION_STATUS_BADGE_VARIANT as STATUS_BADGE_VARIANT,
  TRANSACTION_STATUS_LABELS as STATUS_LABELS,
} from "@/lib/labels";
import { getAttachmentUrl, uploadAttachment } from "@/lib/storage";
import type {
  TransactionStatus,
  TransactionType,
  TransactionWithRelations,
} from "@/types/database";

const transactionSchema = z.object({
  description: z.string().min(2, "Descrição muito curta"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  type: z.enum(["receita", "despesa"]),
  date: z.string().min(1, "Selecione uma data"),
  account_id: z.string().min(1, "Selecione uma conta"),
  category_id: z.string().min(1, "Selecione uma categoria"),
  project_id: z.string().optional(),
  client_id: z.string().optional(),
  status: z.enum(["pendente", "pago", "cancelado"]),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function defaultValues(): TransactionFormValues {
  return {
    description: "",
    amount: 0,
    type: "despesa",
    date: todayISO(),
    account_id: "",
    category_id: "",
    project_id: "",
    client_id: "",
    status: "pendente",
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

const NONE = "none";

export default function TransactionsPage() {
  const { data: transactions, isLoading } = transactionsApi.useList();
  const { data: accounts } = accountsApi.useList();
  const { data: categories } = categoriesApi.useList();
  const { data: clients } = clientsApi.useList();
  const { data: projects } = projectsApi.useList();

  const createTransaction = transactionsApi.useCreate();
  const updateTransaction = transactionsApi.useUpdate();
  const deleteTransaction = transactionsApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionWithRelations | null>(null);
  const [typeFilter, setTypeFilter] = useState<"todos" | TransactionType>("todos");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: defaultValues(),
  });

  const watchedType = watch("type");
  const watchedAccountId = watch("account_id");
  const watchedCategoryId = watch("category_id");
  const watchedProjectId = watch("project_id");
  const watchedClientId = watch("client_id");
  const watchedStatus = watch("status");

  const filteredCategories = useMemo(
    () => categories?.filter((category) => category.type === watchedType) ?? [],
    [categories, watchedType]
  );

  const filteredTransactions = useMemo(() => {
    if (typeFilter === "todos") return transactions ?? [];
    return (transactions ?? []).filter((t) => t.type === typeFilter);
  }, [transactions, typeFilter]);

  const hasPrerequisites = !!accounts?.length && !!categories?.length;

  function openCreate() {
    setEditing(null);
    setFile(null);
    reset(defaultValues());
    setOpen(true);
  }

  function openEdit(transaction: TransactionWithRelations) {
    setEditing(transaction);
    setFile(null);
    reset({
      description: transaction.description,
      amount: transaction.amount,
      type: transaction.type,
      date: transaction.date,
      account_id: transaction.account_id ?? "",
      category_id: transaction.category_id ?? "",
      project_id: transaction.project_id ?? "",
      client_id: transaction.client_id ?? "",
      status: transaction.status,
    });
    setOpen(true);
  }

  async function onSubmit(values: TransactionFormValues) {
    let attachmentUrl = editing?.attachment_url ?? null;

    if (file) {
      setUploading(true);
      try {
        attachmentUrl = await uploadAttachment(file);
      } finally {
        setUploading(false);
      }
    }

    const payload = {
      description: values.description,
      amount: values.amount,
      type: values.type,
      date: values.date,
      account_id: values.account_id,
      category_id: values.category_id,
      project_id: values.project_id || null,
      client_id: values.client_id || null,
      status: values.status,
      attachment_url: attachmentUrl,
    };

    if (editing) {
      await updateTransaction.mutateAsync({ id: editing.id, values: payload });
    } else {
      await createTransaction.mutateAsync(payload);
    }
    setOpen(false);
  }

  async function handleDelete(transaction: TransactionWithRelations) {
    const ok = await confirm({
      title: "Excluir lançamento",
      description: `Tem certeza que deseja excluir "${transaction.description}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteTransaction.mutateAsync(transaction.id);
  }

  async function handleViewAttachment(path: string) {
    const url = await getAttachmentUrl(path);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Fluxo de Caixa</h1>
          <p className="text-sm text-muted-foreground">
            Lançamentos de receitas e despesas
          </p>
        </div>
        <Button onClick={openCreate} disabled={!hasPrerequisites}>
          <Plus className="size-4" />
          Novo lançamento
        </Button>
      </div>

      {!hasPrerequisites && (
        <p className="text-sm text-muted-foreground">
          Cadastre pelo menos uma conta bancária e uma categoria antes de lançar
          movimentações.
        </p>
      )}

      <div className="flex items-center gap-2">
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Conta</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
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

          {!isLoading && filteredTransactions.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nenhum lançamento encontrado.
              </TableCell>
            </TableRow>
          )}

          {filteredTransactions.map((transaction) => (
            <TableRow key={transaction.id}>
              <TableCell className="text-muted-foreground">
                {formatDate(transaction.date)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <ArrowLeftRight className="size-4" />
                  </span>
                  {transaction.description}
                </div>
              </TableCell>
              <TableCell>
                {transaction.categories ? (
                  <Badge
                    variant="secondary"
                    style={{
                      backgroundColor: `${transaction.categories.color}26`,
                      color: transaction.categories.color,
                      borderColor: "transparent",
                    }}
                  >
                    {transaction.categories.name}
                  </Badge>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {transaction.accounts?.bank ?? "-"}
              </TableCell>
              <TableCell
                className={
                  transaction.type === "receita" ? "text-success" : "text-destructive"
                }
              >
                {transaction.type === "receita" ? "+ " : "- "}
                {formatCurrency(transaction.amount)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[transaction.status]}>
                  {STATUS_LABELS[transaction.status]}
                </Badge>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {transaction.attachment_url && (
                      <DropdownMenuItem
                        onClick={() => handleViewAttachment(transaction.attachment_url!)}
                      >
                        <Paperclip className="size-4" />
                        Ver comprovante
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => openEdit(transaction)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(transaction)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar lançamento" : "Novo lançamento"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Input id="description" {...register("description")} />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description.message}</p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Tipo</Label>
                <Select
                  value={watchedType}
                  onValueChange={(value) => {
                    setValue("type", value as TransactionType);
                    setValue("category_id", "");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receita">Receita</SelectItem>
                    <SelectItem value="despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="amount">Valor</Label>
                <Input id="amount" type="number" step="0.01" {...register("amount")} />
                {errors.amount && (
                  <p className="text-sm text-destructive">{errors.amount.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="date">Data</Label>
                <Input id="date" type="date" {...register("date")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Conta</Label>
                <Select
                  value={watchedAccountId}
                  onValueChange={(value) => setValue("account_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts?.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.account_id && (
                  <p className="text-sm text-destructive">{errors.account_id.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label>Categoria</Label>
                <Select
                  value={watchedCategoryId}
                  onValueChange={(value) => setValue("category_id", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category_id && (
                  <p className="text-sm text-destructive">{errors.category_id.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Cliente (opcional)</Label>
                <Select
                  value={watchedClientId || NONE}
                  onValueChange={(value) =>
                    setValue("client_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {clients?.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Projeto (opcional)</Label>
                <Select
                  value={watchedProjectId || NONE}
                  onValueChange={(value) =>
                    setValue("project_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {projects?.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select
                value={watchedStatus}
                onValueChange={(value) => setValue("status", value as TransactionStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="attachment">Comprovante (opcional)</Label>
              <Input
                id="attachment"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {editing?.attachment_url && !file && (
                <p className="text-xs text-muted-foreground">
                  Já existe um comprovante anexado. Selecione outro arquivo para substituir.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button type="submit" isLoading={isSubmitting || uploading}>
                {uploading
                  ? "Enviando comprovante..."
                  : editing
                    ? "Salvar alterações"
                    : "Criar lançamento"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
