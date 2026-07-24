"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Briefcase,
  Tags,
  Landmark,
  Handshake,
  FileBarChart,
  UserCog,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/transactions", label: "Fluxo de Caixa", icon: ArrowLeftRight },
  { href: "/dashboard/clients", label: "Clientes", icon: Users },
  { href: "/dashboard/projects", label: "Projetos", icon: Briefcase },
  { href: "/dashboard/categories", label: "Categorias", icon: Tags },
  { href: "/dashboard/accounts", label: "Contas Bancárias", icon: Landmark },
  { href: "/dashboard/partners", label: "Sócios", icon: Handshake },
  { href: "/dashboard/reports", label: "Relatórios", icon: FileBarChart },
  { href: "/dashboard/users", label: "Usuários", icon: UserCog },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings },
];

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 shrink-0 border-r border-border bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center gap-2 border-b border-border px-6">
        <span className="text-lg font-semibold tracking-tight text-foreground">
          VX <span className="text-primary">Capital</span>
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                isActive && "bg-accent text-foreground"
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
