"use client";

import { EmptyChartState } from "@/components/common/EmptyChartState";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MonthlyNetPoint } from "@/lib/services/realizedTradeService";
import { moneyFormat } from "@/lib/utils/money";

interface MonthlyNetChartProps {
  data: MonthlyNetPoint[];
}

const POSITIVE_BAR = "#1f9d69";
const NEGATIVE_BAR = "#d94848";
const ZERO_BAR = "#b8c3cf";

export function MonthlyNetChart({ data }: MonthlyNetChartProps) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
          <XAxis dataKey="month" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) =>
              typeof value === "number"
                ? new Intl.NumberFormat("ko-KR").format(value)
                : `${value}`
            }
          />
          <ReferenceLine y={0} stroke="#97a6b7" strokeWidth={1.2} />
          <Tooltip
            formatter={(value) => {
              const amount = Number(value);

              if (!Number.isFinite(amount)) {
                return "-";
              }

              return moneyFormat("KRW", amount);
            }}
          />
          <Bar dataKey="netPnlInt" radius={[4, 4, 0, 0]}>
            {data.map((point) => (
              <Cell
                key={`${point.month}-${point.netPnlInt}`}
                fill={
                  point.netPnlInt > 0
                    ? POSITIVE_BAR
                    : point.netPnlInt < 0
                      ? NEGATIVE_BAR
                      : ZERO_BAR
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
