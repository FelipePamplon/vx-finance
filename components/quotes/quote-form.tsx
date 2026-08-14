"use client";

import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { FileDown, Plus, Trash2, Wrench, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { quotesApi, type QuoteInput } from "@/hooks/use-quotes";
import { clientsApi } from "@/hooks/use-clients";
import { projectsApi } from "@/hooks/use-projects";
import { servicesApi } from "@/hooks/use-services";
import { QUOTE_STATUS_LABELS } from "@/lib/labels";
import type { QuoteStatus, QuoteWithItems } from "@/types/database";

const NONE = "none";

const quoteItemSchema = z.object({
  service_id: z.string().nullable(),
  description: z.string().min(1, "Descrição obrigatória"),
  quantity: z.coerce.number().positive("Deve ser maior que zero"),
  unit_price: z.coerce.number().min(0, "Não pode ser negativo"),
});

const quoteSchema = z.object({
  title: z.string().min(2, "Título muito curto"),
  client_id: z.string().optional(),
  project_id: z.string().optional(),
  status: z.enum(["rascunho", "enviado", "aprovado", "recusado", "expirado"]),
  valid_until: z.string().optional(),
  notes: z.string().optional(),
  discount: z.coerce.number().min(0, "Não pode ser negativo"),
  items: z.array(quoteItemSchema).min(1, "Adicione ao menos um item ao orçamento"),
});

type QuoteFormValues = z.infer<typeof quoteSchema>;

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function toDefaultValues(quote?: QuoteWithItems): QuoteFormValues {
  if (!quote) {
    return {
      title: "",
      client_id: "",
      project_id: "",
      status: "rascunho",
      valid_until: "",
      notes: "",
      discount: 0,
      items: [],
    };
  }
  return {
    title: quote.title,
    client_id: quote.client_id ?? "",
    project_id: quote.project_id ?? "",
    status: quote.status,
    valid_until: quote.valid_until ?? "",
    notes: quote.notes ?? "",
    discount: quote.discount,
    items: [...quote.quote_items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        service_id: item.service_id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
      })),
  };
}

export function QuoteForm({ quote }: { quote?: QuoteWithItems }) {
  const router = useRouter();
  const { data: clients } = clientsApi.useList();
  const { data: projects } = projectsApi.useList();
  const { data: services } = servicesApi.useList();
  const createQuote = quotesApi.useCreate();
  const updateQuote = quotesApi.useUpdate();

  const [addServiceValue, setAddServiceValue] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteSchema),
    defaultValues: toDefaultValues(quote),
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  const watchedClientId = watch("client_id");
  const watchedProjectId = watch("project_id");
  const watchedStatus = watch("status");
  const watchedItems = watch("items");
  const watchedDiscount = watch("discount");

  const subtotal = watchedItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );
  const total = Math.max(subtotal - (Number(watchedDiscount) || 0), 0);

  function handleAddService(serviceId: string) {
    const service = services?.find((s) => s.id === serviceId);
    if (!service) return;
    append({
      service_id: service.id,
      description: service.name,
      quantity: 1,
      unit_price: service.price,
    });
    setAddServiceValue("");
  }

  function handleAddCustomItem() {
    append({ service_id: null, description: "", quantity: 1, unit_price: 0 });
  }

  async function onSubmit(values: QuoteFormValues) {
    const input: QuoteInput = {
      title: values.title,
      client_id: values.client_id || null,
      project_id: values.project_id || null,
      status: values.status,
      valid_until: values.valid_until || null,
      notes: values.notes || null,
      discount: values.discount,
      items: values.items.map((item) => ({
        service_id: item.service_id ?? null,
        description: item.description ?? "",
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
      })),
    };

    if (quote) {
      await updateQuote.mutateAsync({ id: quote.id, input });
    } else {
      await createQuote.mutateAsync(input);
    }
    router.push("/dashboard/quotes");
  }

  async function handleExportPdf() {
    setIsExporting(true);
    try {
      const values = getValues();
      const { default: jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");

      const GRAPHITE: [number, number, number] = [21, 27, 35];
      const GOLD: [number, number, number] = [201, 162, 39];
      const SLATE: [number, number, number] = [100, 116, 139];
      const LIGHT_SLATE: [number, number, number] = [148, 163, 184];
      const ZEBRA: [number, number, number] = [246, 247, 249];
      const BORDER: [number, number, number] = [226, 229, 234];
      const INK: [number, number, number] = [30, 35, 43];
      const STATUS_COLOR: Record<QuoteStatus, [number, number, number]> = {
        rascunho: LIGHT_SLATE,
        enviado: GOLD,
        aprovado: [16, 185, 129],
        recusado: [239, 68, 68],
        expirado: SLATE,
      };

      const client = clients?.find((c) => c.id === values.client_id);
      const itemsSubtotal = values.items.reduce(
        (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
        0
      );
      const itemsTotal = Math.max(itemsSubtotal - (Number(values.discount) || 0), 0);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const marginX = 14;
      const rightX = pageWidth - marginX;

      // Header band
      doc.setFillColor(...GRAPHITE);
      doc.rect(0, 0, pageWidth, 34, "F");
      doc.setFillColor(...GOLD);
      doc.rect(0, 34, pageWidth, 1, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(...GOLD);
      doc.text("VX", marginX, 17);
      doc.setTextColor(255, 255, 255);
      doc.text(" CAPITAL", marginX + doc.getTextWidth("VX"), 17);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...LIGHT_SLATE);
      doc.text("Gestão financeira", marginX, 23);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text("ORÇAMENTO", rightX, 15, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...LIGHT_SLATE);
      const quoteNumberLabel = quote ? `Nº ${String(quote.number).padStart(4, "0")}` : "Rascunho não salvo";
      doc.text(quoteNumberLabel, rightX, 22, { align: "right" });
      const issuedDate = quote?.created_at ? formatDate(quote.created_at.slice(0, 10)) : formatDate(new Date().toISOString().slice(0, 10));
      doc.text(`Emitido em ${issuedDate}`, rightX, 27, { align: "right" });

      // Client / details block
      let y = 46;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GOLD);
      doc.text("PREPARADO PARA", marginX, y);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      doc.text(client?.company ?? "Cliente não informado", marginX, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...SLATE);
      const clientDetailLine = [client?.contact, client?.email].filter(Boolean).join("  ·  ");
      if (clientDetailLine) {
        doc.text(clientDetailLine, marginX, y + 13);
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GOLD);
      doc.text("STATUS", rightX, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(...STATUS_COLOR[values.status]);
      doc.text(QUOTE_STATUS_LABELS[values.status], rightX, y + 7, { align: "right" });
      if (values.valid_until) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...SLATE);
        doc.text(`Válido até ${formatDate(values.valid_until)}`, rightX, y + 13, { align: "right" });
      }

      y += 20;
      doc.setDrawColor(...BORDER);
      doc.line(marginX, y, rightX, y);

      y += 9;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11.5);
      doc.setTextColor(...INK);
      doc.text(values.title || "Orçamento sem título", marginX, y);

      const totalRowIndex =
        1 + (values.discount > 0 ? 1 : 0); // index of the "Total" row inside foot

      autoTable(doc, {
        startY: y + 6,
        margin: { left: marginX, right: marginX },
        head: [["Descrição", "Qtd", "Preço unit.", "Total"]],
        body: values.items.map((item) => [
          item.description || "-",
          String(item.quantity || 0),
          formatCurrency(Number(item.unit_price) || 0),
          formatCurrency((Number(item.quantity) || 0) * (Number(item.unit_price) || 0)),
        ]),
        foot: [
          ["", "", "Subtotal", formatCurrency(itemsSubtotal)],
          ...(values.discount > 0
            ? [["", "", "Desconto", `- ${formatCurrency(values.discount)}`]]
            : []),
          ["", "", "Total", formatCurrency(itemsTotal)],
        ],
        theme: "plain",
        styles: {
          fontSize: 9.5,
          textColor: INK,
          lineColor: BORDER,
          lineWidth: 0.1,
          cellPadding: 4,
        },
        headStyles: {
          fillColor: GRAPHITE,
          textColor: 255,
          fontStyle: "bold",
          fontSize: 9,
        },
        columnStyles: {
          1: { halign: "right", cellWidth: 22 },
          2: { halign: "right", cellWidth: 32 },
          3: { halign: "right", cellWidth: 32 },
        },
        alternateRowStyles: { fillColor: ZEBRA },
        footStyles: {
          fillColor: 255,
          textColor: INK,
          fontStyle: "bold",
          fontSize: 9.5,
          lineWidth: 0.3,
          lineColor: BORDER,
        },
        didParseCell: (data) => {
          if (data.section === "foot" && data.row.index === totalRowIndex) {
            data.cell.styles.fontSize = 12;
            data.cell.styles.textColor = data.column.index >= 2 ? GOLD : INK;
          }
        },
      });

      let finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

      if (values.notes) {
        finalY += 10;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(...GOLD);
        doc.text("OBSERVAÇÕES", marginX, finalY);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...SLATE);
        const notesLines = doc.splitTextToSize(values.notes, rightX - marginX);
        doc.text(notesLines, marginX, finalY + 6);
      }

      const pageHeight = doc.internal.pageSize.getHeight();
      const pageCount = doc.internal.getNumberOfPages();
      for (let page = 1; page <= pageCount; page++) {
        doc.setPage(page);
        doc.setDrawColor(...BORDER);
        doc.line(marginX, pageHeight - 14, rightX, pageHeight - 14);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...LIGHT_SLATE);
        doc.text("VX Capital Finance", marginX, pageHeight - 9);
        doc.text(`Página ${page} de ${pageCount}`, rightX, pageHeight - 9, { align: "right" });
      }

      doc.save(`orcamento-${(values.title || "sem-titulo").toLowerCase().replace(/\s+/g, "-")}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="title">Título do orçamento</Label>
          <Input
            id="title"
            placeholder="Ex.: Consultoria estratégica — Projeto X"
            {...register("title")}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </div>

        <div className="flex flex-col gap-2">
          <Label>Cliente</Label>
          <Select
            value={watchedClientId || NONE}
            onValueChange={(value) => setValue("client_id", value === NONE ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um cliente" />
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
            onValueChange={(value) => setValue("project_id", value === NONE ? "" : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione um projeto" />
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

        <div className="flex flex-col gap-2">
          <Label>Status</Label>
          <Select
            value={watchedStatus}
            onValueChange={(value) => setValue("status", value as QuoteStatus)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="valid_until">Válido até (opcional)</Label>
          <Input id="valid_until" type="date" {...register("valid_until")} />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Itens do orçamento</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={addServiceValue} onValueChange={handleAddService}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="+ Adicionar serviço do catálogo" />
              </SelectTrigger>
              <SelectContent>
                {services?.length ? (
                  services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} — {formatCurrency(service.price)}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value={NONE} disabled>
                    Nenhum serviço cadastrado
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={handleAddCustomItem}>
              <Plus className="size-4" />
              Item personalizado
            </Button>
          </div>
        </div>

        {errors.items && !Array.isArray(errors.items) && (
          <p className="text-sm text-destructive">{errors.items.message}</p>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="w-24">Qtd.</TableHead>
              <TableHead className="w-36">Preço unit.</TableHead>
              <TableHead className="w-32">Total</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhum item ainda. Adicione um serviço do catálogo ou um item personalizado.
                </TableCell>
              </TableRow>
            )}

            {fields.map((field, index) => {
              const item = watchedItems[index];
              const lineTotal =
                (Number(item?.quantity) || 0) * (Number(item?.unit_price) || 0);
              return (
                <TableRow key={field.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {field.service_id ? (
                        <Wrench className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <PencilLine className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <Input {...register(`items.${index}.description`)} />
                    </div>
                    {errors.items?.[index]?.description && (
                      <p className="mt-1 text-xs text-destructive">
                        {errors.items?.[index]?.description?.message}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.quantity`)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      {...register(`items.${index}.unit_price`)}
                    />
                  </TableCell>
                  <TableCell className="tabular-nums">{formatCurrency(lineTotal)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      aria-label="Remover item"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="notes">Observações (opcional)</Label>
        <Textarea
          id="notes"
          placeholder="Condições de pagamento, prazos, escopo..."
          {...register("notes")}
        />
      </div>

      <div className="flex flex-col items-end gap-1 self-end sm:w-72">
        <div className="flex w-full items-center justify-between text-sm text-muted-foreground">
          <span>Subtotal</span>
          <span className="tabular-nums">{formatCurrency(subtotal)}</span>
        </div>
        <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground">
          <Label htmlFor="discount" className="text-sm font-normal text-muted-foreground">
            Desconto
          </Label>
          <Input
            id="discount"
            type="number"
            step="0.01"
            className="w-32 text-right"
            {...register("discount")}
          />
        </div>
        <div className="flex w-full items-center justify-between border-t border-border pt-2 text-base font-semibold text-foreground">
          <span>Total</span>
          <span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/dashboard/quotes")}>
          Cancelar
        </Button>
        <Button type="button" variant="secondary" isLoading={isExporting} onClick={handleExportPdf}>
          <FileDown className="size-4" />
          Exportar PDF
        </Button>
        <Button type="submit" isLoading={isSubmitting}>
          {quote ? "Salvar alterações" : "Criar orçamento"}
        </Button>
      </div>
    </form>
  );
}
