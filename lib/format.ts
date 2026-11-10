/** Formatacao de numeros. Existiam 15 copias de formatCurrency espalhadas. */

export function formatCurrency(value: number): string {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

/** Evita -0,00 e ruido de ponto flutuante em somas de dinheiro. */
export function round2(value: number): number {
  const r = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}
