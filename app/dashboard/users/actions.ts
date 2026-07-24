"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

export async function listUsersWithRoles(): Promise<UserRow[]> {
  const admin = createAdminClient();

  const [{ data: authUsers }, { data: profiles }] = await Promise.all([
    admin.auth.admin.listUsers(),
    admin.from("profiles").select("id, name, role"),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p as { name: string | null; role: string }])
  );

  return (authUsers?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? "",
    name: profileMap.get(u.id)?.name ?? null,
    role: profileMap.get(u.id)?.role ?? "financeiro",
  }));
}

export async function updateUserRole(userId: string, role: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
  if (error) throw error;
  revalidatePath("/dashboard/users");
}
