import { sectionOf } from "@/lib/analytics";
import { cashDate } from "@/lib/finance";
import type {
  DreSection,
  TransactionStatus,
  TransactionType,
  TransactionWithRelations,
} from "@/types/database";

/**
 * Filtro unico de lancamentos, usado no Fluxo de Caixa e nos Relatorios.
 * Antes cada tela filtrava do seu jeito (uma so por tipo, a outra por data e
 * tipo), entao nao dava para chegar ao mesmo recorte nas duas.
 */

/** "" = todos. "sem" = lancamentos sem aquele vinculo. */
export interface LedgerFilterState {
  q: string;
  from: string;
  to: string;
  tipo: "" | TransactionType;
  /** "ativos" = tudo menos cancelado (o padrao dos relatorios). */
  status: "" | "ativos" | TransactionStatus;
  conta: string;
  categoria: string;
  cliente: string;
  projeto: string;
  socio: string;
  secao: "" | DreSection;
  min: string;
  max: string;
}

export const EMPTY_FILTERS: LedgerFilterState = {
  q: "",
  from: "",
  to: "",
  tipo: "",
  status: "",
  conta: "",
  categoria: "",
  cliente: "",
  projeto: "",
  socio: "",
  secao: "",
  min: "",
  max: "",
};

const CHAVES = Object.keys(EMPTY_FILTERS) as (keyof LedgerFilterState)[];

/** Le os filtros da URL, para links como /transactions?categoria=sem. */
export function filtersFromParams(
  params: { get(name: string): string | null },
  base: LedgerFilterState = EMPTY_FILTERS
): LedgerFilterState {
  const out = { ...base } as Record<string, string>;
  CHAVES.forEach((k) => {
    const v = params.get(k);
    if (v !== null) out[k] = v;
  });
  return out as unknown as LedgerFilterState;
}

export function countActiveFilters(f: LedgerFilterState, ignore: (keyof LedgerFilterState)[] = []): number {
  return CHAVES.filter((k) => !ignore.includes(k) && f[k] !== "").length;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function vinculo(filtro: string, valor: string | null): boolean {
  if (filtro === "") return true;
  if (filtro === "sem") return !valor;
  return valor === filtro;
}

/**
 * Em que data o periodo (De/Ate) e aplicado.
 * "competencia": o mes a que o lancamento pertence - DRE, projetos, clientes.
 * "caixa": o dia em que o dinheiro se moveu - Fluxo de Caixa.
 */
export type DateBasis = "competencia" | "caixa";

export function applyLedgerFilters(
  rows: TransactionWithRelations[],
  f: LedgerFilterState,
  basis: DateBasis = "competencia"
): TransactionWithRelations[] {
  const termos = normalizar(f.q).split(/\s+/).filter(Boolean);
  const min = f.min === "" ? null : Number(f.min);
  const max = f.max === "" ? null : Number(f.max);

  return rows.filter((t) => {
    const data = basis === "caixa" ? cashDate(t) : t.date;
    if (f.from && data < f.from) return false;
    if (f.to && data > f.to) return false;
    if (f.tipo && t.type !== f.tipo) return false;

    if (f.status === "ativos") {
      if (t.status === "cancelado") return false;
    } else if (f.status && t.status !== f.status) {
      return false;
    }

    // Transferencia toca duas contas: o filtro por conta pega as duas pontas.
    if (f.conta && t.account_id !== f.conta && t.transfer_account_id !== f.conta) return false;

    if (f.categoria === "sem") {
      if (t.type === "transferencia" || t.category_id) return false;
    } else if (f.categoria && t.category_id !== f.categoria) {
      return false;
    }

    if (!vinculo(f.cliente, t.client_id)) return false;
    if (!vinculo(f.projeto, t.project_id)) return false;
    if (!vinculo(f.socio, t.partner_id)) return false;

    if (f.secao && (t.type === "transferencia" || sectionOf(t) !== f.secao)) return false;

    const valor = Math.abs(Number(t.amount));
    if (min !== null && !Number.isNaN(min) && valor < min) return false;
    if (max !== null && !Number.isNaN(max) && valor > max) return false;

    if (termos.length > 0) {
      const alvo = normalizar(
        [
          t.description,
          t.categories?.name,
          t.accounts?.bank,
          t.transfer_accounts?.bank,
          t.clients?.company,
          t.projects?.name,
          t.partners?.name,
          Number(t.amount).toFixed(2),
          Number(t.amount).toFixed(2).replace(".", ","),
        ]
          .filter(Boolean)
          .join(" ")
      );
      if (!termos.every((termo) => alvo.includes(termo))) return false;
    }

    return true;
  });
}

/** Mais recente primeiro, pela data de caixa. Empate: o lancado por ultimo. */
export function sortByCashDate<T extends TransactionWithRelations>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      cashDate(b).localeCompare(cashDate(a)) ||
      b.created_at.localeCompare(a.created_at) ||
      b.id.localeCompare(a.id)
  );
}
