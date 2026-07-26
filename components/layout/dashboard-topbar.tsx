"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import type { Alert } from "@/lib/alerts";

export function DashboardTopbar({
  userEmail,
  alerts,
}: {
  userEmail: string;
  alerts: Alert[];
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-6">
      <div />
      <div className="flex items-center gap-2">
        <NotificationsBell alerts={alerts} />
        <span className="mx-2 text-sm text-muted-foreground">{userEmail}</span>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
