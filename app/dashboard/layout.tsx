import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAlerts } from "@/lib/alerts";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardTopbar } from "@/components/layout/dashboard-topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const alerts = await getAlerts(supabase);

  return (
    <div className="flex min-h-dvh bg-background">
      <DashboardSidebar />
      <div className="flex flex-1 flex-col">
        <DashboardTopbar userEmail={user.email ?? ""} alerts={alerts} />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
