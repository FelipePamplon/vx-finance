import { createCrudHooks } from "@/lib/query/create-crud-hooks";
import type { Project } from "@/types/database";

export const projectsApi = createCrudHooks<Project>("projects", {
  orderBy: "name",
  ascending: true,
  select: "*, clients(company)",
});
