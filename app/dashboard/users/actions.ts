"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

const ROLES = ["admin", "financeiro", "socio", "leitura"] as const;

/**
 * Confere, com a sessao de quem chamou, se e admin.
 * Server action e um endpoint publico: qualquer usuario logado consegue chamar
 * estas funcoes direto, sem passar pela tela. A checagem precisa estar aqui.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, ok: false as const };

  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  return { supabase, user, ok: data?.role === "admin" };
}

export async function listUsersWithRoles(): Promise<UserRow[]> {
  const { ok } = await requireAdmin();
  if (!ok) return [];

  // E-mail so existe em auth.users, que exige a chave de servico.
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

export type UpdateRoleResult = { ok: true } | { ok: false; error: string };

/**
 * Troca o papel de um usuario.
 *
 * Antes isto usava a chave de servico. Com ela o banco nao sabe quem esta
 * pedindo (auth.uid() e nulo), e a trava contra escalacao de privilegio
 * (prevent_role_escalation, migration 0007) recusava SEMPRE - nem o admin
 * conseguia trocar um papel. Agora a gravacao vai com a sessao do usuario: o
 * banco ve que e admin e a trava continua valendo para todos os outros.
 *
 * Devolve o erro em vez de lancar: em producao o Next esconde a mensagem de
 * erro de server action, e a tela so mostrava "Erro ao atualizar papel".
 */
export async function updateUserRole(userId: string, role: string): Promise<UpdateRoleResult> {
  if (!(ROLES as readonly string[]).includes(role)) {
    return { ok: false, error: "Papel inválido." };
  }

  const { supabase, user, ok } = await requireAdmin();
  if (!user || !ok) {
    return { ok: false, error: "Apenas administradores podem alterar papéis." };
  }

  // Sem isso o unico admin pode se rebaixar e ninguem mais consegue gerenciar
  // usuarios pela tela.
  if (userId === user.id && role !== "admin") {
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error: "Você é o único administrador. Promova outra pessoa a admin antes de mudar o seu papel.",
      };
    }
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "Usuário sem perfil cadastrado." };
  }

  revalidatePath("/dashboard/users");
  return { ok: true };
}
