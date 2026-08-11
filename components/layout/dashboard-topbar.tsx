"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/layout/notifications-bell";
import { MobileNav } from "@/components/layout/mobile-nav";
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
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <MobileNav />
      <div className="flex items-center gap-2">
        <NotificationsBell alerts={alerts} />
        <span className="mx-2 hidden text-sm text-muted-foreground sm:inline">{userEmail}</span>
        <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
          <LogOut className="size-4" />
        </Button>
      </div>
    </header>
  );
}
