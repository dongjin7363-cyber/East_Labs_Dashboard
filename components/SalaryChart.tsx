"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SalaryChartPoint } from "@/lib/services/salaryService";
import { moneyFormat } from "@/lib/utils/money";

interface SalaryChartProps {
  data: SalaryChartPoint[];
}

export function SalaryChart({ data }: SalaryChartProps) {
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
          <XAxis dataKey="monthLabel" tick={{ fontSize: 12 }} />
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
          <Legend />
          <Bar dataKey="earnings" name="Earnings" fill="#1f9d69" radius={[4, 4, 0, 0]} />
          <Bar dataKey="spending" name="Spending" fill="#d94848" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
