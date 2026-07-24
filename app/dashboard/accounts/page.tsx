"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Landmark, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { accountsApi } from "@/hooks/use-accounts";
import type { Account, AccountType } from "@/types/database";

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  corrente: "Conta Corrente",
  poupanca: "Poupança",
  investimento: "Investimento",
  caixa: "Caixa",
};

const accountSchema = z.object({
  bank: z.string().min(2, "Nome do banco muito curto"),
  agency: z.string().optional(),
  account: z.string().optional(),
  type: z.enum(["corrente", "poupanca", "investimento", "caixa"]),
  balance: z.coerce.number(),
});

type AccountFormValues = z.infer<typeof accountSchema>;

const defaultValues: AccountFormValues = {
  bank: "",
  agency: "",
  account: "",
  type: "corrente",
  balance: 0,
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function AccountsPage() {
  const { data: accounts, isLoading } = accountsApi.useList();
  const createAccount = accountsApi.useCreate();
  const updateAccount = accountsApi.useUpdate();
  const deleteAccount = accountsApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    reset(defaultValues);
    setOpen(true);
  }

  function openEdit(account: Account) {
    setEditing(account);
    reset({
      bank: account.bank,
      agency: account.agency ?? "",
      account: account.account ?? "",
      type: account.type,
      balance: account.balance,
    });
    setOpen(true);
  }

  async function onSubmit(values: AccountFormValues) {
    if (editing) {
      await updateAccount.mutateAsync({ id: editing.id, values });
    } else {
      await createAccount.mutateAsync(values);
    }
    setOpen(false);
  }

  async function handleDelete(account: Account) {
    if (!window.confirm(`Excluir a conta "${account.bank}"?`)) return;
    await deleteAccount.mutateAsync(account.id);
  }

  const watchedType = watch("type");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Contas Bancárias</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as contas usadas no fluxo de caixa
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nova conta
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Banco</TableHead>
            <TableHead>Agência / Conta</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Saldo</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Carregando...
              </TableCell>
            </TableRow>
          )}

          {!isLoading && accounts?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhuma conta cadastrada.
              </TableCell>
            </TableRow>
          )}

          {accounts?.map((account) => (
            <TableRow key={account.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <Landmark className="size-4" />
                  </span>
                  {account.bank}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {account.agency || "-"} / {account.account || "-"}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
              </TableCell>
              <TableCell>{formatCurrency(account.balance)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(account)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(account)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar conta" : "Nova conta"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="bank">Banco</Label>
              <Input id="bank" {...register("bank")} />
              {errors.bank && (
                <p className="text-sm text-destructive">{errors.bank.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="agency">Agência</Label>
                <Input id="agency" {...register("agency")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="account">Conta</Label>
                <Input id="account" {...register("account")} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label>Tipo</Label>
                <Select
                  value={watchedType}
                  onValueChange={(value) => setValue("type", value as AccountType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="balance">Saldo inicial</Label>
                <Input id="balance" type="number" step="0.01" {...register("balance")} />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {editing ? "Salvar alterações" : "Criar conta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
