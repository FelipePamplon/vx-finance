import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { Account } from "@/types/database";

export const accountsApi = createCrudHooks<Account>("accounts", {
  orderBy: "bank",
  ascending: true,
});
