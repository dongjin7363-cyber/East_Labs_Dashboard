"use client";

import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
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

function compute3mAvg(values: (number | null)[], i: number): number | null {
  const window = [values[i], values[i - 1] ?? null, values[i - 2] ?? null];
  const valid = window.filter((v): v is number => v !== null);
  if (valid.length < 3) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function ExportMomChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="export-chart-empty">데이터 없음</div>;
  }

  const moms = data.map((d) => d.mom);
  const chartData = data.map((d, i) => ({
    ym: formatYm(d.ym),
    mom: d.mom,
    avg3m: compute3mAvg(moms, i),
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" vertical={false} />
        <XAxis
          dataKey="ym"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          width={44}
        />
        <Tooltip
          formatter={(value, name) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return ["-", name];
            return [`${n > 0 ? "+" : ""}${n.toFixed(1)}%`, name];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5eaf1" }}
        />
        <Legend
          verticalAlign="top"
          align="left"
          wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          iconType="plainline"
          iconSize={16}
        />
        <Bar dataKey="mom" name="MoM%" maxBarSize={20}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={(entry.mom ?? 0) >= 0 ? "#22c55e" : "#ef4444"}
            />
          ))}
        </Bar>
        <Line
          dataKey="avg3m"
          name="3개월 평균"
          stroke="#94a3b8"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
