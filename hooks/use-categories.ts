import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { Category } from "@/types/database";

export const categoriesApi = createCrudHooks<Category>("categories", {
  orderBy: "name",
  ascending: true,
});
