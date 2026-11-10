/**
 * Datas do sistema, num lugar so.
 *
 * O codigo usava `new Date().toISOString().slice(0, 10)` para "hoje" em 15
 * lugares. toISOString devolve a data em UTC: em Belem (UTC-3), das 21h em
 * diante "hoje" ja era amanha. Efeito real: conta marcada como vencida tres
 * horas antes, pagamento registrado com a data do dia seguinte e, no servidor,
 * o painel virando o mes na noite do ultimo dia.
 *
 * Aqui "hoje" e sempre a data civil no fuso da empresa, e a aritmetica de datas
 * e feita em UTC puro sobre strings "YYYY-MM-DD", sem depender do fuso de quem
 * executa (navegador ou servidor).
 */

export const TIME_ZONE = "America/Belem";

/** Data civil de hoje no fuso da empresa, "YYYY-MM-DD". */
export function todayISO(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUTC(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/** Dias de `from` ate `to` (positivo quando `to` e depois). */
export function diffDays(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

/** "YYYY-MM" de uma data. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthStart(key: string): string {
  return `${key}-01`;
}

export function monthEnd(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return fromUTC(new Date(Date.UTC(y, m, 0)));
}

export function addMonths(key: string, months: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mesma data N meses depois, sem estourar o mes: 31/01 + 1 mes = 28/02 (ou 29).
 * Usado em parcelas e recorrencias.
 */
export function addMonthsToDate(iso: string, months: number): string {
  const day = Number(iso.slice(8, 10));
  const key = addMonths(monthKey(iso), months);
  const last = Number(monthEnd(key).slice(8, 10));
  return `${key}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Lista de meses "YYYY-MM" de `from` a `to`, inclusive. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  while (cursor <= to && out.length < 240) {
    out.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return out;
}

export function yearStart(iso: string = todayISO()): string {
  return `${iso.slice(0, 4)}-01-01`;
}

/** "DD/MM/YYYY" direto da string, sem passar por Date (e por fuso). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "nov/26" ou, com `long`, "nov de 2026". */
export function monthLabel(key: string, long = false): string {
  const [y, m] = key.split("-");
  const nome = MESES[Number(m) - 1] ?? m;
  return long ? `${nome} de ${y}` : `${nome}/${y.slice(2)}`;
}
