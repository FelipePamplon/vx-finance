import { todayISO } from "@/lib/dates";

/**
 * Exportacao generica de relatorio. Antes so o Fluxo de Caixa exportava; o DRE
 * - justamente o que vai para o contador e para os socios - nao tinha saida.
 * Cada relatorio descreve sua tabela e este modulo cuida do formato.
 */
export interface ExportTable {
  /** Titulo do documento e base do nome do arquivo. */
  title: string;
  subtitle?: string;
  head: string[];
  /** Numero vai como numero para o Excel; o resto como texto. */
  body: (string | number)[][];
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function fileName(table: ExportTable, ext: string): string {
  return `${slug(table.title)}-${todayISO()}.${ext}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function brNumber(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function exportCsv(table: ExportTable) {
  const linhas = [table.head, ...table.body].map((row) =>
    row
      .map((cell) => {
        const texto = typeof cell === "number" ? brNumber(cell) : String(cell);
        return `"${texto.replace(/"/g, '""')}"`;
      })
      .join(";")
  );
  // BOM para o Excel abrir acentos corretamente.
  download(
    new Blob([`﻿${linhas.join("\n")}`], { type: "text/csv;charset=utf-8;" }),
    fileName(table, "csv")
  );
}

export async function exportExcel(table: ExportTable) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([table.head, ...table.body]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, table.title.slice(0, 31));
  XLSX.writeFile(book, fileName(table, "xlsx"));
}

export async function exportPdf(table: ExportTable) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const paisagem = table.head.length > 7;
  const doc = new jsPDF({ orientation: paisagem ? "landscape" : "portrait" });
  doc.setFontSize(15);
  doc.text(`VX Capital — ${table.title}`, 14, 18);
  if (table.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(table.subtitle, 14, 25);
  }

  autoTable(doc, {
    startY: table.subtitle ? 30 : 24,
    head: [table.head],
    body: table.body.map((row) =>
      row.map((cell) => (typeof cell === "number" ? brNumber(cell) : String(cell)))
    ),
    styles: { fontSize: paisagem ? 7 : 8 },
    headStyles: { fillColor: [21, 27, 35] },
    columnStyles: Object.fromEntries(
      table.head.map((_, i) => [
        i,
        { halign: table.body.some((r) => typeof r[i] === "number") ? "right" : "left" },
      ])
    ),
  });

  doc.save(fileName(table, "pdf"));
}
