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

function formatPct(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`;
}

function formatCompactNumber(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(n / 1_000)}K`;
  return Math.round(n).toLocaleString();
}

export function ExportMainChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="export-chart-empty">데이터 없음</div>;
  }

  const chartData = data.map((d) => ({
    ym: formatYm(d.ym),
    avgExport: d.avgExport,
    yoy: d.yoy,
    priceYoy: d.priceYoy,
    isPartial: d.isPartial,
  }));
  const latestPartialIndex = data[data.length - 1]?.isPartial ? data.length - 1 : -1;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={chartData} margin={{ top: 8, right: 48, left: 24, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" vertical={false} />
        <XAxis
          dataKey="ym"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={formatCompactNumber}
          width={66}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 11, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
          width={44}
        />
        <Tooltip
          labelFormatter={(label, payload) => {
            const row = Array.isArray(payload) ? payload[0]?.payload : null;
            return row?.isPartial ? `${label} · 잠정치` : `${label}`;
          }}
          formatter={(value, name) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return ["-", name];
            if (name === "일평균수출") return [n.toLocaleString(), name];
            return [formatPct(n), name];
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
        <Bar
          yAxisId="left"
          dataKey="avgExport"
          name="일평균수출"
          fill="#93c5fd"
          radius={[3, 3, 0, 0]}
          maxBarSize={24}
        >
          {chartData.map((_, index) => (
            <Cell
              key={index}
              fill={index === latestPartialIndex ? "#f97316" : "#93c5fd"}
            />
          ))}
        </Bar>
        <Line
          yAxisId="right"
          dataKey="yoy"
          name="YoY%"
          stroke="#2563eb"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId="right"
          dataKey="priceYoy"
          name="판가YoY%"
          stroke="#f97316"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
