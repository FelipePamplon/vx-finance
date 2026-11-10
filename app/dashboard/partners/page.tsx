"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Handshake, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { partnersApi } from "@/hooks/use-partners";
import { transactionsApi } from "@/hooks/use-transactions";
import { partnerAccounts } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";
import type { Partner } from "@/types/database";

const partnerSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  share: z.coerce.number().min(0, "Mínimo 0%").max(100, "Máximo 100%"),
});

type PartnerFormValues = z.infer<typeof partnerSchema>;

const defaultValues: PartnerFormValues = {
  name: "",
  email: "",
  share: 0,
};

export default function PartnersPage() {
  const { data: partners, isLoading } = partnersApi.useList();
  const { data: transactions } = transactionsApi.useList();

  // Conta corrente acumulada (desde o inicio): o que cabe a cada um contra o
  // que ja retirou. Mesmo calculo do relatorio de Socios.
  const resumo = useMemo(
    () =>
      partnerAccounts(
        (transactions ?? []).filter((t) => t.status === "pago"),
        partners ?? []
      ),
    [transactions, partners]
  );
  const contaDe = (id: string) => resumo.contas.find((c) => c.id === id);
  const participacaoOk = Math.abs(resumo.somaParticipacao - 100) < 0.01;
  const createPartner = partnersApi.useCreate();
  const updatePartner = partnersApi.useUpdate();
  const deletePartner = partnersApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partner | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PartnerFormValues>({
    resolver: zodResolver(partnerSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    reset(defaultValues);
    setOpen(true);
  }

  function openEdit(partner: Partner) {
    setEditing(partner);
    reset({
      name: partner.name,
      email: partner.email ?? "",
      share: partner.share,
    });
    setOpen(true);
  }

  async function onSubmit(values: PartnerFormValues) {
    if (editing) {
      await updatePartner.mutateAsync({ id: editing.id, values });
    } else {
      await createPartner.mutateAsync(values);
    }
    setOpen(false);
  }

  async function handleDelete(partner: Partner) {
    const ok = await confirm({
      title: "Excluir sócio",
      description: `Tem certeza que deseja excluir o sócio "${partner.name}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deletePartner.mutateAsync(partner.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Sócios</h1>
          <p className="text-sm text-muted-foreground">
            Participação societária e conta corrente de cada sócio
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Novo sócio
        </Button>
      </div>

      {!isLoading && (partners?.length ?? 0) > 0 && !participacaoOk && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground">
          A participação cadastrada soma{" "}
          <strong>{resumo.somaParticipacao.toLocaleString("pt-BR")}%</strong>, não 100%. Edite cada
          sócio e informe o percentual do contrato social — sem isso o sistema não calcula o que
          cabe a cada um.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Lucro acumulado antes da distribuição", value: resumo.lucroDistribuivel },
          { label: "Já distribuído", value: resumo.totalRetirado },
          { label: "Lucro retido na empresa", value: resumo.lucroDistribuivel - resumo.totalRetirado },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${c.value < 0 ? "text-destructive" : ""}`}>
              {formatCurrency(c.value)}
            </p>
          </div>
        ))}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sócio</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead className="text-right">Participação</TableHead>
            <TableHead className="text-right">Direito no lucro</TableHead>
            <TableHead className="text-right">Retirado</TableHead>
            <TableHead className="text-right">Saldo a retirar</TableHead>
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

          {!isLoading && partners?.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground">
                Nenhum sócio cadastrado.
              </TableCell>
            </TableRow>
          )}

          {partners?.map((partner) => (
            <TableRow key={partner.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <Handshake className="size-4" />
                  </span>
                  {partner.name}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {partner.email || "-"}
              </TableCell>
              <TableCell className="text-right tabular-nums">{partner.share}%</TableCell>
              <TableCell className="text-right tabular-nums">
                {participacaoOk ? formatCurrency(contaDe(partner.id)?.direito ?? 0) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(contaDe(partner.id)?.retirado ?? 0)}
              </TableCell>
              <TableCell
                className={`text-right font-medium tabular-nums ${
                  !participacaoOk
                    ? "text-muted-foreground"
                    : (contaDe(partner.id)?.saldo ?? 0) >= 0
                      ? "text-success"
                      : "text-destructive"
                }`}
              >
                {participacaoOk ? formatCurrency(contaDe(partner.id)?.saldo ?? 0) : "—"}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(partner)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(partner)}
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
            <DialogTitle>{editing ? "Editar sócio" : "Novo sócio"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" {...register("email")} />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="share">Participação (%)</Label>
                <Input id="share" type="number" step="0.01" {...register("share")} />
                {errors.share && (
                  <p className="text-sm text-destructive">{errors.share.message}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" isLoading={isSubmitting}>
                {editing ? "Salvar alterações" : "Criar sócio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
