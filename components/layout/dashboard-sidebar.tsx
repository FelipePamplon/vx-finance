"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { navGroups } from "@/lib/nav-items";

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          VX <span className="text-primary">Capital</span>
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
        {navGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <span className="px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </span>
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive && "bg-accent text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "absolute left-0 h-5 w-0.5 rounded-full bg-primary transition-opacity",
                      isActive ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
