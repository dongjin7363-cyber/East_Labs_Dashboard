"use client";

import {
  Cell,
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
  const totalAmount = filteredData.reduce((sum, item) => sum + item.amountInt, 0);

  return (
    filteredData.length === 0 ? (
      <div className="empty-state">지출 세부항목 데이터가 없습니다.</div>
    ) : (
      <div className="expense-pie-layout">
        <div className="chart-wrap expense-subcategory-pie-chart">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <Pie
                data={filteredData}
                dataKey="amountInt"
                nameKey="subcategory"
                cx="50%"
                cy="50%"
                innerRadius={54}
                outerRadius={92}
                strokeWidth={0}
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
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="expense-pie-legend">
          {filteredData.map((item) => {
            const percentRaw = totalAmount > 0 ? (item.amountInt / totalAmount) * 100 : 0;
            const percentText =
              Math.abs(percentRaw - Math.round(percentRaw)) < 0.05
                ? `${Math.round(percentRaw)}%`
                : `${percentRaw.toFixed(1)}%`;

            return (
              <li key={item.subcategory}>
                <span
                  className="expense-pie-legend-dot"
                  style={{ backgroundColor: PIE_COLORS[item.subcategory] }}
                />
                <span className="expense-pie-legend-label">{item.subcategory}</span>
                <span className="expense-pie-legend-value">
                  {moneyFormat("KRW", item.amountInt)}
                </span>
                <span className="expense-pie-legend-ratio">({percentText})</span>
              </li>
            );
          })}
        </ul>
      </div>
    )
  );
}
