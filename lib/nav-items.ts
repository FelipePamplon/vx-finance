import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  Briefcase,
  Tags,
  Landmark,
  Handshake,
  FileCheck2,
  FileBarChart,
  UserCog,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Visão geral",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Financeiro",
    items: [
      { href: "/dashboard/transactions", label: "Fluxo de Caixa", icon: ArrowLeftRight },
      { href: "/dashboard/reconciliation", label: "Conciliação", icon: FileCheck2 },
      { href: "/dashboard/reports", label: "Relatórios", icon: FileBarChart },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { href: "/dashboard/clients", label: "Clientes", icon: Users },
      { href: "/dashboard/projects", label: "Projetos", icon: Briefcase },
      { href: "/dashboard/categories", label: "Categorias", icon: Tags },
      { href: "/dashboard/accounts", label: "Contas Bancárias", icon: Landmark },
      { href: "/dashboard/partners", label: "Sócios", icon: Handshake },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/dashboard/users", label: "Usuários", icon: UserCog },
      { href: "/dashboard/settings", label: "Configurações", icon: Settings },
    ],
  },
];

export const navItems: NavItem[] = navGroups.flatMap((group) => group.items);
