"use client";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AnalysisPoint, compact, pct } from "@/lib/exportAnalysis";

export function ExportPriceChart({ data, level }: { data: AnalysisPoint[]; level: boolean }) {
  if (!data.some(p => level ? p.price != null : p.priceYoy != null)) return <div className="export-chart-empty">원본에 판가 데이터가 없습니다.</div>;
  const rows = data.map(p => ({ ...p, label: p.ym.slice(2).replace("-", ".") }));
  return <ResponsiveContainer width="100%" height={274}>
    <ComposedChart data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} accessibilityLayer>
      <CartesianGrid strokeDasharray="3 4" stroke="#e8edf4" vertical={false} />
      <XAxis dataKey="label" minTickGap={24} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
      <YAxis yAxisId="price" width={49} tickFormatter={v => level ? compact(v) : `${v}%`} tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} domain={[0,"auto"]} />
      <YAxis yAxisId="delta" orientation="right" width={54} tickFormatter={v => `${v}${level ? "%" : "%p"}`} tick={{ fontSize: 10, fill: "#7c3aed" }} axisLine={false} tickLine={false} />
      <ReferenceLine yAxisId="delta" y={0} stroke="#b8c5d5" />
      <Tooltip labelFormatter={(_, payload) => `${payload?.[0]?.payload?.ym ?? ""}${payload?.[0]?.payload?.isPartial ? " · 잠정" : ""}`} formatter={(v, name) => [name === "ASP" ? `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} USD/kg` : pct(Number(v), name === "YoY Δ" ? "%p" : "%"), name]} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e2e8f0" }} />
      <Bar yAxisId="price" dataKey={level ? "price" : "priceYoy"} name={level ? "ASP" : "ASP YoY"} maxBarSize={32} radius={[2,2,0,0]} isAnimationActive={false}>
        {rows.map(p => <Cell key={p.ym} fill={(level ? p.price ?? 0 : p.priceYoy ?? 0) >= 0 ? "#a5d5c8" : "#edb4b4"} />)}
      </Bar>
      <Line yAxisId="delta" dataKey={level ? "priceMom" : "priceDelta"} name={level ? "ASP MoM" : "YoY Δ"} stroke="#7c3aed" strokeWidth={2.2} dot={rows.length <= 13 ? { r: 2.5, fill: "#fff" } : false} isAnimationActive={false} />
    </ComposedChart>
  </ResponsiveContainer>;
}
