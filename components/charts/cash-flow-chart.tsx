"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface CashFlowPoint {
  month: string;
  receita: number;
  despesa: number;
  projected?: boolean;
}

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function CashFlowChart({
  data,
  projectionStartMonth,
}: {
  data: CashFlowPoint[];
  projectionStartMonth?: string;
}) {
  const lastMonth = data[data.length - 1]?.month;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ left: 0, right: 12, top: 12, bottom: 0 }}>
        <defs>
          <linearGradient id="receitaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="despesaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#262e3d" vertical={false} />
        <XAxis
          dataKey="month"
          stroke="#94a3b8"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#94a3b8"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(value: number) =>
            value >= 1000 ? `${(value / 1000).toFixed(0)}k` : `${value}`
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#151b23",
            border: "1px solid #262e3d",
            borderRadius: 8,
            color: "#ffffff",
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value: number) => formatCurrency(value)}
        />
        {projectionStartMonth && lastMonth && (
          <>
            <ReferenceArea
              x1={projectionStartMonth}
              x2={lastMonth}
              fill="#c9a227"
              fillOpacity={0.06}
              strokeOpacity={0}
            />
            <ReferenceLine
              x={projectionStartMonth}
              stroke="#c9a227"
              strokeDasharray="4 4"
              label={{
                value: "Projeção",
                position: "insideTopRight",
                fill: "#c9a227",
                fontSize: 11,
              }}
            />
          </>
        )}
        <Area
          type="monotone"
          dataKey="receita"
          name="Receitas"
          stroke="#10b981"
          fill="url(#receitaGradient)"
          strokeWidth={2}
        />
        <Area
          type="monotone"
          dataKey="despesa"
          name="Despesas"
          stroke="#ef4444"
          fill="url(#despesaGradient)"
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
