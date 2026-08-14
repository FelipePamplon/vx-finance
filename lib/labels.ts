import type { QuoteStatus, TransactionStatus } from "@/types/database";

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
