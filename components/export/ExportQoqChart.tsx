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

function formatQuarter(ym: string): string {
  const [year, month] = ym.split("-");
  const quarter = Math.ceil(Number(month) / 3);
  return `${year.slice(2)}.Q${quarter}`;
}

function buildQuarterChartData(data: ExportDataPoint[]) {
  if (data.some((d) => d.qoq !== null)) {
    return data
      .filter((d) => d.qoq !== null)
      .map((d) => ({ label: formatYm(d.ym), qoq: d.qoq, isPartial: d.isPartial }));
  }

  const quarterRows = new Map<string, { values: number[]; isPartial: boolean }>();

  for (const point of data) {
    if (point.avgExport === null) continue;

    const key = formatQuarter(point.ym);
    const row = quarterRows.get(key) ?? { values: [], isPartial: false };
    row.values.push(point.avgExport);
    row.isPartial = row.isPartial || point.isPartial;
    quarterRows.set(key, row);
  }

  const quarters = [...quarterRows.entries()].map(([label, row]) => ({
    label,
    avgExport: row.values.reduce((sum, value) => sum + value, 0) / row.values.length,
    isPartial: row.isPartial,
  }));

  return quarters.map((quarter, index) => {
    const previous = quarters[index - 1];
    const qoq =
      previous && previous.avgExport !== 0
        ? ((quarter.avgExport - previous.avgExport) / previous.avgExport) * 100
        : null;

    return {
      label: quarter.label,
      qoq,
      isPartial: quarter.isPartial,
    };
  });
}

export function ExportQoqChart({ data }: Props) {
  const chartData = buildQuarterChartData(data).filter((d) => d.qoq !== null);
  const latestPartialIndex = chartData[chartData.length - 1]?.isPartial
    ? chartData.length - 1
    : -1;

  return (
    <>
      {chartData.length === 0 ? (
        <div className="export-chart-empty">데이터 없음</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickMargin={8}
              tickLine={false}
              axisLine={false}
              height={28}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickMargin={8}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              width={48}
            />
            <Tooltip
              labelFormatter={(label, payload) => {
                const row = Array.isArray(payload) ? payload[0]?.payload : null;
                return row?.isPartial ? `${label} · 잠정치` : `${label}`;
              }}
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
                  fill={
                    i === latestPartialIndex
                      ? "#f97316"
                      : (entry.qoq ?? 0) >= 0
                        ? "#22c55e"
                        : "#ef4444"
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </>
  );
}
