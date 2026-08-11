"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";

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
import { categoriesApi } from "@/hooks/use-categories";
import { CATEGORY_ICONS, CATEGORY_ICON_OPTIONS } from "@/lib/icons";
import type { Category } from "@/types/database";

const categorySchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
  type: z.enum(["receita", "despesa"]),
  color: z.string().min(4),
  icon: z.string().min(1),
});

type CategoryFormValues = z.infer<typeof categorySchema>;

const defaultValues: CategoryFormValues = {
  name: "",
  type: "despesa",
  color: "#c9a227",
  icon: "wallet",
};

export default function CategoriesPage() {
  const { data: categories, isLoading } = categoriesApi.useList();
  const createCategory = categoriesApi.useCreate();
  const updateCategory = categoriesApi.useUpdate();
  const deleteCategory = categoriesApi.useDelete();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues,
  });

  function openCreate() {
    setEditing(null);
    reset(defaultValues);
    setOpen(true);
  }

  function openEdit(category: Category) {
    setEditing(category);
    reset({
      name: category.name,
      type: category.type,
      color: category.color,
      icon: category.icon ?? "wallet",
    });
    setOpen(true);
  }

  async function onSubmit(values: CategoryFormValues) {
    if (editing) {
      await updateCategory.mutateAsync({ id: editing.id, values });
    } else {
      await createCategory.mutateAsync(values);
    }
    setOpen(false);
  }

  async function handleDelete(category: Category) {
    const ok = await confirm({
      title: "Excluir categoria",
      description: `Tem certeza que deseja excluir a categoria "${category.name}"? Essa ação não pode ser desfeita.`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    await deleteCategory.mutateAsync(category.id);
  }

  const watchedIcon = watch("icon");
  const watchedType = watch("type");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            Organize receitas e despesas por categoria
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Nova categoria
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Categoria</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                Carregando...
              </TableCell>
            </TableRow>
          )}

          {!isLoading && categories?.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground">
                Nenhuma categoria cadastrada.
              </TableCell>
            </TableRow>
          )}

          {categories?.map((category) => {
            const Icon =
              CATEGORY_ICONS[category.icon ?? "wallet"] ?? CATEGORY_ICONS.wallet;
            return (
              <TableRow key={category.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span
                      className="flex size-7 items-center justify-center rounded-md"
                      style={{
                        backgroundColor: `${category.color}26`,
                        color: category.color,
                      }}
                    >
                      <Icon className="size-4" />
                    </span>
                    {category.name}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={category.type === "receita" ? "success" : "destructive"}>
                    {category.type === "receita" ? "Receita" : "Despesa"}
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
                      <DropdownMenuItem onClick={() => openEdit(category)}>
                        <Pencil className="size-4" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDelete(category)}
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
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
              <Label>Tipo</Label>
              <Select
                value={watchedType}
                onValueChange={(value) =>
                  setValue("type", value as "receita" | "despesa")
                }
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

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="color">Cor</Label>
                <Input id="color" type="color" className="h-10 p-1" {...register("color")} />
              </div>

              <div className="flex flex-col gap-2">
                <Label>Ícone</Label>
                <Select value={watchedIcon} onValueChange={(value) => setValue("icon", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_ICON_OPTIONS.map((iconName) => (
                      <SelectItem key={iconName} value={iconName}>
                        {iconName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" isLoading={isSubmitting}>
                {editing ? "Salvar alterações" : "Criar categoria"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </div>
  );
}
