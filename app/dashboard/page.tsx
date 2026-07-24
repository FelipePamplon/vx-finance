import { Wallet, ArrowDownCircle, ArrowUpCircle, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const summaryCards = [
  {
    label: "Saldo Atual",
    value: "R$ 0,00",
    icon: Wallet,
    accent: "",
  },
  {
    label: "Entradas (mês)",
    value: "R$ 0,00",
    icon: ArrowUpCircle,
    accent: "text-success",
  },
  {
    label: "Saídas (mês)",
    value: "R$ 0,00",
    icon: ArrowDownCircle,
    accent: "text-destructive",
  },
  {
    label: "Resultado",
    value: "R$ 0,00",
    icon: TrendingUp,
    accent: "",
  },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Visão geral financeira da VX Capital
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle>{card.label}</CardTitle>
                <Icon className={`size-4 text-muted-foreground ${card.accent}`} />
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{card.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Últimas movimentações</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum lançamento cadastrado ainda. A tabela de transações chega na
            próxima sprint.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
