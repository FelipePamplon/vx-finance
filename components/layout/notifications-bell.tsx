"use client";

import { Bell } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Alert } from "@/lib/alerts";

export function NotificationsBell({ alerts }: { alerts: Alert[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="size-4" />
          {alerts.length > 0 && (
            <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
              {alerts.length > 9 ? "9+" : alerts.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Alertas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {alerts.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Nenhum alerta no momento.
          </p>
        )}
        {alerts.map((alert) => (
          <DropdownMenuItem key={alert.id} className="flex flex-col items-start gap-0.5">
            <span
              className={
                alert.severity === "destructive"
                  ? "text-sm text-destructive"
                  : "text-sm text-foreground"
              }
            >
              {alert.message}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
