import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { Partner } from "@/types/database";

export const partnersApi = createCrudHooks<Partner>("partners", {
  orderBy: "name",
  ascending: true,
});
