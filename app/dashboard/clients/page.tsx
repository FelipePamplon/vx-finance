"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

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
import { clientsApi } from "@/hooks/use-clients";
import type { Client } from "@/types/database";

const clientSchema = z.object({
  company: z.string().min(2, "Nome da empresa muito curto"),
  contact: z.string().optional(),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
});

type ClientFormValues = z.infer<typeof clientSchema>;

const defaultValues: ClientFormValues = {
  company: "",
  contact: "",
  email: "",
  phone: "",
};

export default function ClientsPage() {
  const { data: clients, isLoading } = clientsApi.useList();
  const createClient = clientsApi.useCreate();
  const updateClient = clientsApi.useUpdate();
  const deleteClient = clientsApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    reset(defaultValues);
    setOpen(true);
  }

  function openEdit(client: Client) {
    setEditing(client);
    reset({
      company: client.company,
      contact: client.contact ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
    });
    setOpen(true);
  }

  async function onSubmit(values: ClientFormValues) {
    if (editing) {
      await updateClient.mutateAsync({ id: editing.id, values });
    } else {
      await createClient.mutateAsync(values);
    }
    setOpen(false);
  }

  async function handleDelete(client: Client) {
    const ok = await confirm({
      title: "Excluir cliente",
      description: `Tem certeza que deseja excluir o cliente "${client.company}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteClient.mutateAsync(client.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Empresas e contatos que geram receita
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Novo cliente
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Empresa</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>E-mail</TableHead>
            <TableHead>Telefone</TableHead>
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

          {!isLoading && clients?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhum cliente cadastrado.
              </TableCell>
            </TableRow>
          )}

          {clients?.map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <Building2 className="size-4" />
                  </span>
                  {client.company}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{client.contact || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{client.email || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{client.phone || "-"}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(client)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(client)}
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
            <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="company">Empresa</Label>
              <Input id="company" {...register("company")} />
              {errors.company && (
                <p className="text-sm text-destructive">{errors.company.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="contact">Contato</Label>
              <Input id="contact" {...register("contact")} />
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
                <Label htmlFor="phone">Telefone</Label>
                <Input id="phone" {...register("phone")} />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" isLoading={isSubmitting}>
                {editing ? "Salvar alterações" : "Criar cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
