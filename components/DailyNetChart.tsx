"use client";

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
import { DailyNetPoint } from "@/lib/services/realizedTradeService";
import { moneyFormat } from "@/lib/utils/money";

interface DailyNetChartProps {
  data: DailyNetPoint[];
}

const POSITIVE_BAR = "#1f9d69";
const NEGATIVE_BAR = "#d94848";

export function DailyNetChart({ data }: DailyNetChartProps) {
  if (data.length === 0) {
    return <div className="empty-state">차트 데이터가 없습니다.</div>;
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            angle={-30}
            textAnchor="end"
            interval="preserveStartEnd"
            height={56}
          />
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
              if (value === null || value === undefined) {
                return "-";
              }

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
                key={`${point.date}-${point.netPnlInt}`}
                fill={
                  typeof point.netPnlInt !== "number"
                    ? "transparent"
                    : point.netPnlInt >= 0
                      ? POSITIVE_BAR
                      : NEGATIVE_BAR
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
