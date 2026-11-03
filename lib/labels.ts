import { displaySignedAmount, type AmountLike } from "@/lib/finance";
import type { QuoteStatus, TransactionStatus, TransactionType } from "@/types/database";

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  receita: "Receita",
  despesa: "Despesa",
  transferencia: "Transferência",
};

/**
 * Valor formatado com o sinal correto. O sinal sai do valor, nao do tipo: um
 * estorno e despesa com valor negativo e precisa aparecer como entrada (+).
 * Um prefixo fixo por tipo escrevia "- -R$ 13,50" nesse caso.
 */
export function formatTransactionAmount(t: AmountLike): string {
  const signed = displaySignedAmount(t);
  const absolute = Math.abs(signed).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  // Transferencia nao soma nem subtrai do caixa consolidado: vai sem sinal.
  if (t.type === "transferencia") return absolute;
  return `${signed >= 0 ? "+" : "-"} ${absolute}`;
}

/** Cor do valor na tela, pelo efeito real no caixa e nao pelo tipo do lancamento. */
export function transactionAmountTone(
  t: AmountLike
): "positive" | "negative" | "neutral" {
  if (t.type === "transferencia") return "neutral";
  return displaySignedAmount(t) >= 0 ? "positive" : "negative";
}

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  pendente: "Pendente",
  pago: "Pago",
  cancelado: "Cancelado",
};

export const TRANSACTION_STATUS_BADGE_VARIANT: Record<
  TransactionStatus,
  "default" | "secondary" | "success" | "destructive"
> = {
  pendente: "secondary",
  pago: "success",
  cancelado: "destructive",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

export const QUOTE_STATUS_BADGE_VARIANT: Record<
  QuoteStatus,
  "default" | "secondary" | "success" | "destructive" | "outline"
> = {
  rascunho: "secondary",
  enviado: "default",
  aprovado: "success",
  recusado: "destructive",
  expirado: "outline",
};
