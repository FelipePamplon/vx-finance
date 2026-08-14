import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { Service } from "@/types/database";

export const servicesApi = createCrudHooks<Service>("services", {
  orderBy: "name",
  ascending: true,
});
