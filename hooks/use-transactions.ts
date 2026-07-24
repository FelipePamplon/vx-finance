import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { TransactionWithRelations } from "@/types/database";

export const transactionsApi = createCrudHooks<TransactionWithRelations>(
  "transactions",
  {
    orderBy: "date",
    ascending: false,
    select: "*, accounts(bank), categories(name,color), clients(company), projects(name)",
  }
);
