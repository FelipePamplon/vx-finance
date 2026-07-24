import type { TransactionStatus } from "@/types/database";

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
