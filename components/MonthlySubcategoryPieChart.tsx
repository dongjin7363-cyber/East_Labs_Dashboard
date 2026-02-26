"use client";

import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { ExpenseSubcategory } from "@/lib/models/types";
import { moneyFormat } from "@/lib/utils/money";

export interface MonthlySubcategoryPiePoint {
  subcategory: ExpenseSubcategory;
  amountInt: number;
}

interface MonthlySubcategoryPieChartProps {
  data: MonthlySubcategoryPiePoint[];
}

interface PieLabelPayload {
  subcategory?: string;
  percent?: number;
  value?: number;
  amountInt?: number;
}

const PIE_COLORS: Record<ExpenseSubcategory, string> = {
  Spending: "#111111",
  Debt: "#ef4444",
  Subscription: "#2563eb",
  Rent: "#0ea5e9",
  Travel: "#10b981",
  Luxury: "#f97316",
};

export function MonthlySubcategoryPieChart({
  data,
}: MonthlySubcategoryPieChartProps) {
  const filteredData = data.filter((item) => item.amountInt > 0);

  return (
    filteredData.length === 0 ? (
      <div className="empty-state">지출 세부항목 데이터가 없습니다.</div>
    ) : (
      <div className="chart-wrap expense-subcategory-pie-chart">
        <ResponsiveContainer width="100%" height={320}>
          <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <Pie
              data={filteredData}
              dataKey="amountInt"
              nameKey="subcategory"
              cx="50%"
              cy="50%"
              outerRadius={95}
              label={(payload: PieLabelPayload) => {
                const name = typeof payload.subcategory === "string" ? payload.subcategory : "";
                const amount = Number(payload.amountInt ?? payload.value ?? 0);
                const percentRaw =
                  typeof payload.percent === "number" ? payload.percent * 100 : 0;
                const percentText =
                  Math.abs(percentRaw - Math.round(percentRaw)) < 0.05
                    ? `${Math.round(percentRaw)}`
                    : `${percentRaw.toFixed(1)}`;

                return `${name} ${moneyFormat("KRW", amount)} (${percentText}%)`;
              }}
              labelLine={false}
            >
              {filteredData.map((item) => (
                <Cell key={item.subcategory} fill={PIE_COLORS[item.subcategory]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value, name) => {
                const amount = Number(value);

                if (!Number.isFinite(amount)) {
                  return "-";
                }

                return [moneyFormat("KRW", amount), `${name}`];
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    )
  );
}
