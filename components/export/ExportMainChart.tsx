"use client";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnalysisPoint, compact, pct } from "@/lib/exportAnalysis";

export function ExportMainChart({ data, quantity = false, trade = "수출" }: { data: AnalysisPoint[]; quantity?: boolean; trade?: string }) {
  if (!data.length) return <div className="export-chart-empty">데이터 없음</div>;
  const rows = data.map(p => ({ ...p, label: p.ym.slice(2).replace("-", "."), value: quantity ? p.dailyQuantity : p.avgExport, growth: quantity ? p.quantityYoy : p.yoy, monthly: quantity ? p.quantityMom : p.mom }));
  return <ResponsiveContainer width="100%" height={274}>
    <ComposedChart data={rows} margin={{ top: 6, right: 10, left: 0, bottom: 4 }} accessibilityLayer>
      <CartesianGrid strokeDasharray="3 4" stroke="#e8edf4" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} minTickGap={28} />
      <YAxis yAxisId="value" tickFormatter={compact} width={65} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
      <YAxis yAxisId="growth" orientation="right" tickFormatter={v => `${v}%`} width={53} tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
      <ReferenceLine yAxisId="growth" y={0} stroke="#b8c5d5" strokeDasharray="3 3" />
      <Tooltip labelFormatter={(_, payload) => {
        const p = payload?.[0]?.payload;
        return `${p?.ym ?? ""}${p?.isPartial ? ` · 잠정${p.dataThrough ? ` (${p.dataThrough.slice(5)}까지)` : ""}` : ""}`;
      }} formatter={(v, name) => [name === `일평균 ${trade}${quantity ? "량" : "액"}` ? `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 1 })} ${quantity ? "kg/일" : "USD/일"}` : pct(Number(v)), name]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0" }} />
      <Legend verticalAlign="top" align="left" iconSize={12} wrapperStyle={{ fontSize: 11, paddingBottom: 14 }} />
      <Bar yAxisId="value" dataKey="value" name={`일평균 ${trade}${quantity ? "량" : "액"}`} fill="#aec9ef" radius={[3,3,0,0]} maxBarSize={32} isAnimationActive={false}>
        {rows.map(p => <Cell key={p.ym} fill={p.isPartial ? "#f4a261" : "#aec9ef"} />)}
      </Bar>
      <Line yAxisId="growth" dataKey="growth" name="YoY" stroke="#315ed6" strokeWidth={2.2} dot={rows.length <= 13 ? { r: 2.6, fill: "#fff", strokeWidth: 1.5 } : false} activeDot={{ r: 4 }} isAnimationActive={false} />
      <Line yAxisId="growth" dataKey="monthly" name="MoM" stroke="#0d9488" strokeWidth={1.8} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
    </ComposedChart>
  </ResponsiveContainer>;
}
