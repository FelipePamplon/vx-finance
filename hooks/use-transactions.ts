import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { TransactionWithRelations } from "@/types/database";

// `accounts` precisa ser desambiguado: transactions tem DUAS chaves estrangeiras
// para accounts (account_id e transfer_account_id, esta usada em transferencias).
// Sem nomear a constraint, o PostgREST nao sabe qual seguir e a consulta falha.
export const transactionsApi = createCrudHooks<TransactionWithRelations>(
  "transactions",
  {
    orderBy: "date",
    ascending: false,
    select:
      "*, accounts!transactions_account_id_fkey(bank), transfer_accounts:accounts!transactions_transfer_account_id_fkey(bank), categories(name,color), clients(company), projects(name)",
  }
);
