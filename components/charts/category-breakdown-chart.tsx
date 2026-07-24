"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

export interface CategorySlice {
  name: string;
  value: number;
  color: string;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CategoryBreakdownChart({ data }: { data: CategorySlice[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        Sem despesas categorizadas neste mês.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="55%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={2}
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "#151b23",
              border: "1px solid #262e3d",
              borderRadius: 8,
              color: "#ffffff",
            }}
            formatter={(value: number) => formatCurrency(value)}
          />
        </PieChart>
      </ResponsiveContainer>

      <ul className="flex flex-1 flex-col gap-2">
        {data.map((entry) => (
          <li key={entry.name} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2 text-foreground">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="text-muted-foreground">{formatCurrency(entry.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
