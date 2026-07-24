import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { Client } from "@/types/database";

export const clientsApi = createCrudHooks<Client>("clients", {
  orderBy: "company",
  ascending: true,
});
