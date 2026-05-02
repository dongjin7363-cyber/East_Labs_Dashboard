"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ExportDataPoint } from "@/lib/models/types";

interface Props {
  data: ExportDataPoint[];
}

function formatYm(ym: string): string {
  const parts = ym.split("-");
  if (parts.length < 2) return ym;
  return `${parts[0].slice(2)}.${parts[1]}`;
}

export function ExportQoqChart({ data }: Props) {
  const chartData = data
    .filter((d) => d.qoq !== null)
    .map((d) => ({ ym: formatYm(d.ym), qoq: d.qoq }));

  if (chartData.length === 0) {
    return <div className="export-chart-empty">데이터 없음</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 48, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" vertical={false} />
        <XAxis
          dataKey="ym"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          width={44}
        />
        <Tooltip
          formatter={(value) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return "-";
            return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5eaf1" }}
        />
        <Bar dataKey="qoq" name="QoQ%" maxBarSize={28} radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={(entry.qoq ?? 0) >= 0 ? "#22c55e" : "#ef4444"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
