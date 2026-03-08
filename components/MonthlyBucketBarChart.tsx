"use client";

import { EmptyState } from "@/components/common/EmptyState";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { moneyFormat } from "@/lib/utils/money";

export interface MonthlyBucketBarPoint {
  category: "Income" | "Subscription" | "Plus" | "Spending";
  amountInt: number;
}

interface MonthlyBucketBarChartProps {
  data: MonthlyBucketBarPoint[];
}

const BAR_COLORS: Record<MonthlyBucketBarPoint["category"], string> = {
  Income: "#d94848",
  Subscription: "#2563eb",
  Plus: "#f97316",
  Spending: "#111111",
};

export function MonthlyBucketBarChart({ data }: MonthlyBucketBarChartProps) {
  if (data.length === 0) {
    return <EmptyState title="차트 데이터가 없습니다." compact />;
  }

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 20, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
          <YAxis
            tick={{ fontSize: 12 }}
            tickFormatter={(value) =>
              typeof value === "number"
                ? new Intl.NumberFormat("ko-KR").format(value)
                : `${value}`
            }
          />
          <Tooltip
            formatter={(value) => {
              const amount = Number(value);

              if (!Number.isFinite(amount)) {
                return "-";
              }

              return moneyFormat("KRW", amount);
            }}
          />
          <Bar dataKey="amountInt" radius={[6, 6, 0, 0]}>
            {data.map((item) => (
              <Cell key={item.category} fill={BAR_COLORS[item.category]} />
            ))}
            <LabelList
              dataKey="amountInt"
              position="top"
              formatter={(value: unknown) => {
                const amount = Number(value);

                if (!Number.isFinite(amount)) {
                  return "";
                }

                return moneyFormat("KRW", amount);
              }}
              style={{ fill: "#334155", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
