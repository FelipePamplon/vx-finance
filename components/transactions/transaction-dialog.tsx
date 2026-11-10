"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, History } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccountBalances } from "@/hooks/use-account-balances";
import { categoriesApi } from "@/hooks/use-categories";
import { clientsApi } from "@/hooks/use-clients";
import { partnersApi } from "@/hooks/use-partners";
import { projectsApi } from "@/hooks/use-projects";
import { transactionsApi } from "@/hooks/use-transactions";
import { addMonthsToDate, formatDate, TIME_ZONE, todayISO } from "@/lib/dates";
import { signedAmountForAccount } from "@/lib/finance";
import { formatCurrency, round2 } from "@/lib/format";
import { TRANSACTION_STATUS_LABELS as STATUS_LABELS } from "@/lib/labels";
import { uploadAttachment } from "@/lib/storage";
import { createClient } from "@/lib/supabase/client";
import type {
  AuditEntry,
  TransactionStatus,
  TransactionType,
  TransactionWithRelations,
} from "@/types/database";

const NONE = "none";

const schema = z
  .object({
    description: z.string().min(2, "Descrição muito curta"),
    // Negativo e permitido em despesa para registrar estorno (despesa que voltou).
    amount: z.coerce.number().refine((v) => v !== 0, "Valor não pode ser zero"),
    type: z.enum(["receita", "despesa", "transferencia"]),
    date: z.string().min(1, "Selecione uma data"),
    due_date: z.string().optional(),
    paid_date: z.string().optional(),
    account_id: z.string().min(1, "Selecione uma conta"),
    transfer_account_id: z.string().optional(),
    category_id: z.string().optional(),
    project_id: z.string().optional(),
    client_id: z.string().optional(),
    partner_id: z.string().optional(),
    status: z.enum(["pendente", "pago", "cancelado"]),
    repeat: z.enum(["nao", "mensal", "parcelado"]),
    repeat_count: z.coerce.number().int().min(2, "Mínimo 2").max(60, "Máximo 60"),
  })
  .superRefine((values, ctx) => {
    if (values.amount < 0 && values.type !== "despesa") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message:
          "Valor negativo só em despesa, para registrar estorno. Dinheiro que entra é receita.",
      });
    }
    if (values.type === "transferencia") {
      if (!values.transfer_account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transfer_account_id"],
          message: "Selecione a conta de destino",
        });
      } else if (values.transfer_account_id === values.account_id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transfer_account_id"],
          message: "A conta de destino deve ser diferente da origem",
        });
      }
    } else if (!values.category_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category_id"],
        message: "Selecione uma categoria",
      });
    }
  });

export type TransactionFormValues = z.infer<typeof schema>;

function defaults(prefill?: Partial<TransactionFormValues>): TransactionFormValues {
  const hoje = todayISO();
  return {
    description: "",
    amount: 0,
    type: "despesa",
    date: hoje,
    due_date: hoje,
    paid_date: "",
    account_id: "",
    transfer_account_id: "",
    category_id: "",
    project_id: "",
    client_id: "",
    partner_id: "",
    status: "pendente",
    repeat: "nao",
    repeat_count: 2,
    ...prefill,
  };
}

const CAMPOS_AUDITADOS: Record<string, string> = {
  description: "Descrição",
  amount: "Valor",
  type: "Tipo",
  date: "Competência",
  due_date: "Vencimento",
  paid_date: "Pagamento",
  status: "Status",
  account_id: "Conta",
  transfer_account_id: "Conta destino",
  category_id: "Categoria",
  project_id: "Projeto",
  client_id: "Cliente",
  partner_id: "Sócio",
  attachment_url: "Comprovante",
};

export function TransactionDialog({
  open,
  onOpenChange,
  editing,
  prefill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: TransactionWithRelations | null;
  /** Valores iniciais ao criar (ex.: linha do extrato na conciliacao). */
  prefill?: Partial<TransactionFormValues>;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: balances } = useAccountBalances();
  const { data: categories } = categoriesApi.useList();
  const { data: clients } = clientsApi.useList();
  const { data: projects } = projectsApi.useList();
  const { data: partners } = partnersApi.useList();
  const createTransaction = transactionsApi.useCreate();
  const updateTransaction = transactionsApi.useUpdate();

  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [historico, setHistorico] = useState<AuditEntry[] | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(),
  });

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setHistorico(null);
    if (editing) {
      reset({
        ...defaults(),
        description: editing.description,
        amount: editing.amount,
        type: editing.type,
        date: editing.date,
        due_date: editing.due_date ?? "",
        paid_date: editing.paid_date ?? "",
        account_id: editing.account_id ?? "",
        transfer_account_id: editing.transfer_account_id ?? "",
        category_id: editing.category_id ?? "",
        project_id: editing.project_id ?? "",
        client_id: editing.client_id ?? "",
        partner_id: editing.partner_id ?? "",
        status: editing.status,
      });
    } else {
      reset(defaults(prefill));
    }
    // prefill e lido so na abertura do dialogo, de proposito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, reset]);

  const w = watch();
  const isTransfer = w.type === "transferencia";

  const contas = useMemo(
    () =>
      (balances ?? []).filter(
        // Conta encerrada nao recebe lancamento novo, mas continua editavel
        // em quem ja aponta para ela.
        (a) => a.is_active || a.id === editing?.account_id || a.id === editing?.transfer_account_id
      ),
    [balances, editing]
  );

  const categoriasDoTipo = useMemo(
    () => (categories ?? []).filter((c) => c.type === w.type),
    [categories, w.type]
  );
  const categoria = categories?.find((c) => c.id === w.category_id);
  const eDistribuicao = categoria?.dre_section === "distribuicao";

  // Saldo da conta depois deste lancamento. Banco nao deixa conta sem limite
  // ficar negativa: se o sistema deixa, quase sempre falta lancar a entrada
  // que cobriu o pagamento (um resgate de CDB, por exemplo).
  const avisoSaldo = useMemo(() => {
    const conta = (balances ?? []).find((a) => a.id === w.account_id);
    const valor = Number(w.amount) || 0;
    if (!conta || w.status !== "pago" || valor === 0) return null;

    const efeitoNovo = w.type === "receita" ? valor : -valor;
    if (efeitoNovo >= 0) return null;

    const efeitoAntigo =
      editing && editing.status === "pago" ? signedAmountForAccount(editing, conta.id) : 0;
    const saldo = round2(Number(conta.current_balance) - efeitoAntigo + efeitoNovo);
    return saldo < 0 ? { conta: conta.bank, saldo } : null;
  }, [balances, w.account_id, w.amount, w.status, w.type, editing]);

  const parcelas = Number(w.repeat_count) || 0;
  const valorParcela =
    w.repeat === "parcelado" && parcelas >= 2 ? round2((Number(w.amount) || 0) / parcelas) : null;

  async function carregarHistorico() {
    if (!editing) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("audit_log")
      .select("*")
      .eq("table_name", "transactions")
      .eq("record_id", editing.id)
      .order("changed_at", { ascending: false })
      .limit(30);
    if (error) {
      toast.error(`Não foi possível carregar o histórico: ${error.message}`);
      return;
    }
    setHistorico((data ?? []) as AuditEntry[]);
  }

  function nomeDe(campo: string, valor: unknown): string {
    if (valor === null || valor === undefined || valor === "") return "—";
    const id = String(valor);
    if (campo === "account_id" || campo === "transfer_account_id")
      return balances?.find((a) => a.id === id)?.bank ?? "conta";
    if (campo === "category_id") return categories?.find((c) => c.id === id)?.name ?? "categoria";
    if (campo === "project_id") return projects?.find((p) => p.id === id)?.name ?? "projeto";
    if (campo === "client_id") return clients?.find((c) => c.id === id)?.company ?? "cliente";
    if (campo === "partner_id") return partners?.find((p) => p.id === id)?.name ?? "sócio";
    if (campo === "amount") return formatCurrency(Number(valor));
    if (campo === "date" || campo === "due_date" || campo === "paid_date") return formatDate(id);
    if (campo === "attachment_url") return "anexado";
    return id;
  }

  async function onSubmit(values: TransactionFormValues) {
    if (eDistribuicao && !values.partner_id) {
      setError("partner_id", { message: "Distribuição de lucros precisa do sócio" });
      return;
    }

    setBusy(true);
    try {
      let attachmentUrl = editing?.attachment_url ?? null;
      if (file) attachmentUrl = await uploadAttachment(file);

      const transfer = values.type === "transferencia";
      const base = {
        description: values.description.trim(),
        amount: values.amount,
        type: values.type,
        date: values.date,
        due_date: values.due_date || values.date,
        paid_date: values.status === "pago" ? values.paid_date || values.date : null,
        account_id: values.account_id,
        transfer_account_id: transfer ? values.transfer_account_id || null : null,
        category_id: transfer ? null : values.category_id || null,
        project_id: values.project_id || null,
        client_id: values.client_id || null,
        partner_id: transfer ? null : values.partner_id || null,
        status: values.status,
        attachment_url: attachmentUrl,
      };

      if (editing) {
        await updateTransaction.mutateAsync({ id: editing.id, values: base });
      } else if (values.repeat === "nao") {
        await createTransaction.mutateAsync(base);
      } else {
        // Parcelas e recorrencias nascem juntas e ficam ligadas pelo grupo.
        // A primeira segue o status escolhido; as seguintes sao compromissos
        // futuros, entao entram como pendentes.
        const n = values.repeat_count;
        const grupo = crypto.randomUUID();
        const parcelado = values.repeat === "parcelado";
        const parcela = parcelado ? round2(values.amount / n) : values.amount;
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const linhas = Array.from({ length: n }, (_, i) => {
          // A ultima parcela absorve os centavos do arredondamento.
          const valor = parcelado && i === n - 1 ? round2(values.amount - parcela * (n - 1)) : parcela;
          const primeira = i === 0;
          return {
            ...base,
            description: `${base.description} (${i + 1}/${n})`,
            amount: valor,
            date: addMonthsToDate(base.date, i),
            due_date: addMonthsToDate(base.due_date, i),
            status: primeira ? base.status : ("pendente" as TransactionStatus),
            paid_date: primeira ? base.paid_date : null,
            attachment_url: primeira ? attachmentUrl : null,
            recurrence_group: grupo,
            installment_no: i + 1,
            installment_total: n,
            created_by: user?.id ?? null,
          };
        });

        const { error } = await supabase.from("transactions").insert(linhas);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        toast.success(`${n} lançamentos criados.`);
      }

      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      // Os hooks de CRUD ja avisam; aqui cobre upload e insercao em lote.
      if (!editing && values.repeat !== "nao") {
        toast.error(`Erro ao criar: ${(error as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar lançamento" : "Novo lançamento"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descrição</Label>
            <Input id="description" {...register("description")} />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>Tipo</Label>
              <Select
                value={w.type}
                onValueChange={(value) => {
                  setValue("type", value as TransactionType);
                  setValue("category_id", "");
                  setValue("partner_id", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                  <SelectItem value="transferencia">Transferência</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="amount">
                {w.repeat === "parcelado" && !editing ? "Valor total" : "Valor"}
              </Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-sm text-destructive">{errors.amount.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="date">Competência</Label>
              <Input id="date" type="date" {...register("date")} />
            </div>
          </div>

          {w.type === "despesa" && !errors.amount && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Estorno? Lance como despesa com valor negativo: ele abate a própria
              categoria do gasto, em vez de virar receita.
            </p>
          )}

          {isTransfer && (
            <p className="rounded-md bg-accent/50 px-3 py-2 text-xs text-muted-foreground">
              Transferência move dinheiro entre contas próprias (inclusive aplicação e
              resgate de CDB): não entra no resultado, só altera o saldo das duas contas.
            </p>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label>{isTransfer ? "Conta de origem" : "Conta"}</Label>
              <Select value={w.account_id} onValueChange={(v) => setValue("account_id", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.bank} · {formatCurrency(a.current_balance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.account_id && (
                <p className="text-sm text-destructive">{errors.account_id.message}</p>
              )}
            </div>

            {isTransfer ? (
              <div className="flex flex-col gap-2">
                <Label>Conta de destino</Label>
                <Select
                  value={w.transfer_account_id}
                  onValueChange={(v) => setValue("transfer_account_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a conta de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {contas
                      .filter((a) => a.id !== w.account_id)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.bank}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {errors.transfer_account_id && (
                  <p className="text-sm text-destructive">
                    {errors.transfer_account_id.message}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Label>Categoria</Label>
                <Select value={w.category_id} onValueChange={(v) => setValue("category_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriasDoTipo.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.category_id && (
                  <p className="text-sm text-destructive">{errors.category_id.message}</p>
                )}
              </div>
            )}
          </div>

          {avisoSaldo && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p className="text-foreground">
                <strong>{avisoSaldo.conta}</strong> ficará com{" "}
                <strong>{formatCurrency(avisoSaldo.saldo)}</strong>. Conta sem limite não fica
                negativa no banco — falta lançar a transferência ou o resgate que cobriu este
                pagamento?
              </p>
            </div>
          )}

          {categoria?.dre_section === "imposto" && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Imposto sobre faturamento: a <strong>competência</strong> é o mês do faturamento, não o
              do pagamento. O DAS de outubro tem competência 31/10 e vencimento 20/11.
            </p>
          )}

          {eDistribuicao && (
            <div className="flex flex-col gap-2">
              <Label>Sócio</Label>
              <Select value={w.partner_id || NONE} onValueChange={(v) => setValue("partner_id", v === NONE ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Quem retirou" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Selecione</SelectItem>
                  {partners?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.partner_id && (
                <p className="text-sm text-destructive">{errors.partner_id.message}</p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label>Status</Label>
              <Select
                value={w.status}
                onValueChange={(v) => setValue("status", v as TransactionStatus)}
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
              <Label htmlFor="due_date">Vencimento</Label>
              <Input id="due_date" type="date" {...register("due_date")} />
            </div>

            {w.status === "pago" && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="paid_date">Pago em</Label>
                <Input id="paid_date" type="date" {...register("paid_date")} />
              </div>
            )}
          </div>

          {!isTransfer && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Cliente (opcional)</Label>
                <Select
                  value={w.client_id || NONE}
                  onValueChange={(v) => setValue("client_id", v === NONE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {clients?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.company}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Projeto (opcional)</Label>
                <Select
                  value={w.project_id || NONE}
                  onValueChange={(v) => setValue("project_id", v === NONE ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {!editing && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label>Repetir</Label>
                <Select
                  value={w.repeat}
                  onValueChange={(v) => setValue("repeat", v as TransactionFormValues["repeat"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nao">Não repetir</SelectItem>
                    <SelectItem value="mensal">Todo mês, mesmo valor</SelectItem>
                    <SelectItem value="parcelado">Parcelar o valor total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {w.repeat !== "nao" && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="repeat_count">
                    {w.repeat === "mensal" ? "Por quantos meses" : "Em quantas parcelas"}
                  </Label>
                  <Input id="repeat_count" type="number" min={2} max={60} {...register("repeat_count")} />
                  {errors.repeat_count ? (
                    <p className="text-sm text-destructive">{errors.repeat_count.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {valorParcela !== null
                        ? `${parcelas}× de ${formatCurrency(valorParcela)}, uma por mês. `
                        : `${parcelas} lançamentos de ${formatCurrency(Number(w.amount) || 0)}. `}
                      Os seguintes entram como pendentes.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="attachment">Comprovante / nota fiscal (opcional)</Label>
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

          {editing && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {editing.installment_total
                    ? `Parcela ${editing.installment_no}/${editing.installment_total} · `
                    : ""}
                  Criado em{" "}
                  {new Date(editing.created_at).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE })}
                  {editing.updated_at
                    ? ` · alterado em ${new Date(editing.updated_at).toLocaleDateString("pt-BR", {
                        timeZone: TIME_ZONE,
                      })}`
                    : ""}
                </span>
                {historico === null && (
                  <Button type="button" variant="ghost" size="sm" onClick={carregarHistorico}>
                    <History className="size-4" />
                    Histórico
                  </Button>
                )}
              </div>

              {historico !== null && historico.length === 0 && (
                <p>Sem alterações registradas desde que a trilha de auditoria foi ligada.</p>
              )}

              {historico?.map((h) => {
                const mudancas =
                  h.action === "UPDATE"
                    ? Object.keys(CAMPOS_AUDITADOS).filter(
                        (campo) =>
                          JSON.stringify(h.old_data?.[campo] ?? null) !==
                          JSON.stringify(h.new_data?.[campo] ?? null)
                      )
                    : [];
                return (
                  <div key={h.id} className="border-t border-border pt-2">
                    <p className="font-medium text-foreground">
                      {new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: TIME_ZONE })} ·{" "}
                      {h.action === "INSERT" ? "criado" : h.action === "DELETE" ? "excluído" : "alterado"}
                    </p>
                    {mudancas.map((campo) => (
                      <p key={campo}>
                        {CAMPOS_AUDITADOS[campo]}: {nomeDe(campo, h.old_data?.[campo])} →{" "}
                        {nomeDe(campo, h.new_data?.[campo])}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" isLoading={isSubmitting || busy}>
              {editing ? "Salvar alterações" : "Criar lançamento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
