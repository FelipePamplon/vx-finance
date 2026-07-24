"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Briefcase, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

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
import { projectsApi } from "@/hooks/use-projects";
import { clientsApi } from "@/hooks/use-clients";
import type { Project, ProjectStatus } from "@/types/database";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  ativo: "Ativo",
  pausado: "Pausado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_BADGE_VARIANT: Record<
  ProjectStatus,
  "default" | "secondary" | "success" | "destructive"
> = {
  ativo: "success",
  pausado: "secondary",
  concluido: "default",
  cancelado: "destructive",
};

const projectSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  client_id: z.string().min(1, "Selecione um cliente"),
  budget: z.coerce.number().min(0),
  status: z.enum(["ativo", "pausado", "concluido", "cancelado"]),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const defaultValues: ProjectFormValues = {
  name: "",
  client_id: "",
  budget: 0,
  status: "ativo",
};

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ProjectsPage() {
  const { data: projects, isLoading } = projectsApi.useList();
  const { data: clients } = clientsApi.useList();
  const createProject = projectsApi.useCreate();
  const updateProject = projectsApi.useUpdate();
  const deleteProject = projectsApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    reset(defaultValues);
    setOpen(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    reset({
      name: project.name,
      client_id: project.client_id ?? "",
      budget: project.budget,
      status: project.status,
    });
    setOpen(true);
  }

  async function onSubmit(values: ProjectFormValues) {
    if (editing) {
      await updateProject.mutateAsync({ id: editing.id, values });
    } else {
      await createProject.mutateAsync(values);
    }
    setOpen(false);
  }

  async function handleDelete(project: Project) {
    if (!window.confirm(`Excluir o projeto "${project.name}"?`)) return;
    await deleteProject.mutateAsync(project.id);
  }

  const watchedClientId = watch("client_id");
  const watchedStatus = watch("status");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Projetos</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe orçamento e status por projeto
          </p>
        </div>
        <Button onClick={openCreate} disabled={!clients?.length}>
          <Plus className="size-4" />
          Novo projeto
        </Button>
      </div>

      {!clients?.length && (
        <p className="text-sm text-muted-foreground">
          Cadastre um cliente antes de criar projetos.
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Projeto</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Orçamento</TableHead>
            <TableHead>Status</TableHead>
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

          {!isLoading && projects?.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground">
                Nenhum projeto cadastrado.
              </TableCell>
            </TableRow>
          )}

          {projects?.map((project) => (
            <TableRow key={project.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-md bg-accent text-muted-foreground">
                    <Briefcase className="size-4" />
                  </span>
                  {project.name}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {project.clients?.company ?? "-"}
              </TableCell>
              <TableCell>{formatCurrency(project.budget)}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[project.status]}>
                  {STATUS_LABELS[project.status]}
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
                    <DropdownMenuItem onClick={() => openEdit(project)}>
                      <Pencil className="size-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => handleDelete(project)}
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
            <DialogTitle>{editing ? "Editar projeto" : "Novo projeto"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" {...register("name")} />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Cliente</Label>
              <Select
                value={watchedClientId}
                onValueChange={(value) => setValue("client_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.company}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.client_id && (
                <p className="text-sm text-destructive">{errors.client_id.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="budget">Orçamento</Label>
                <Input id="budget" type="number" step="0.01" {...register("budget")} />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Status</Label>
                <Select
                  value={watchedStatus}
                  onValueChange={(value) => setValue("status", value as ProjectStatus)}
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
            </div>

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {editing ? "Salvar alterações" : "Criar projeto"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
