import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileSettingsForm } from "@/components/dashboard/profile-settings-form";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  financeiro: "Financeiro",
  socio: "Sócio",
  leitura: "Leitura",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, role")
    .eq("id", user!.id)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Configurações</h1>
        <p className="text-sm text-muted-foreground">Suas informações de conta</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid max-w-sm grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">E-mail</p>
              <p className="text-foreground">{user?.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Papel</p>
              <p className="text-foreground">
                {ROLE_LABELS[profile?.role ?? "financeiro"]}
              </p>
            </div>
          </div>

          <ProfileSettingsForm userId={user!.id} defaultName={profile?.name ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}
