"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MoreHorizontal, Pencil, Plus, Trash2, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { servicesApi } from "@/hooks/use-services";
import type { Service } from "@/types/database";

const serviceSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Preço não pode ser negativo"),
  unit: z.string().min(1, "Informe a unidade"),
});

type ServiceFormValues = z.infer<typeof serviceSchema>;

const defaultValues: ServiceFormValues = {
  name: "",
  description: "",
  price: 0,
  unit: "unidade",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ServicesPage() {
  const { data: services, isLoading } = servicesApi.useList();
  const createService = servicesApi.useCreate();
  const updateService = servicesApi.useUpdate();
  const deleteService = servicesApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    reset(defaultValues);
    setOpen(true);
  }

  function openEdit(service: Service) {
    setEditing(service);
    reset({
      name: service.name,
      description: service.description ?? "",
      price: service.price,
      unit: service.unit ?? "unidade",
    });
    setOpen(true);
  }

  async function onSubmit(values: ServiceFormValues) {
    if (editing) {
      await updateService.mutateAsync({ id: editing.id, values });
    } else {
      await createService.mutateAsync(values);
    }
    setOpen(false);
  }

  async function handleDelete(service: Service) {
    const ok = await confirm({
      title: "Excluir serviço",
      description: `Tem certeza que deseja excluir "${service.name}" do catálogo? Orçamentos que já usam esse serviço não serão afetados.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteService.mutateAsync(service.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Catálogo de Serviços</h1>
          <p className="text-sm text-muted-foreground">
            Cadastre serviços com preço fixo para adicionar rapidamente aos orçamentos
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Novo serviço
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Serviço</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Preço</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Carregando...
              </TableCell>
            </TableRow>
          )}

          {!isLoading && services?.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Nenhum serviço cadastrado ainda.
              </TableCell>
            </TableRow>
          )}

          {services?.map((service) => (
            <TableRow key={service.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <Wrench className="size-4" />
                  </span>
                  <div className="flex flex-col">
                    <span>{service.name}</span>
                    {service.description && (
                      <span className="text-xs text-muted-foreground">
                        {service.description}
                      </span>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">{service.unit ?? "-"}</TableCell>
              <TableCell className="tabular-nums">{formatCurrency(service.price)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(service)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(service)}
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
            <DialogTitle>{editing ? "Editar serviço" : "Novo serviço"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" placeholder="Ex.: Consultoria estratégica" {...register("name")} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                placeholder="Detalhes que devem aparecer no orçamento"
                {...register("description")}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="price">Preço</Label>
                <Input id="price" type="number" step="0.01" {...register("price")} />
                {errors.price && (
                  <p className="text-sm text-destructive">{errors.price.message}</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="unit">Unidade</Label>
                <Input id="unit" placeholder="unidade, hora, mês..." {...register("unit")} />
                {errors.unit && (
                  <p className="text-sm text-destructive">{errors.unit.message}</p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" isLoading={isSubmitting}>
                {editing ? "Salvar alterações" : "Criar serviço"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
