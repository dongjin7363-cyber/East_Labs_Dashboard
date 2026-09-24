import { ExportDataPoint, ExportItem } from "@/lib/models/types";

export type AnalysisPoint = ExportDataPoint & {
  priceMom: number | null;
  priceDelta: number | null;
  quantityMom: number | null;
  quantityYoy: number | null;
  yoyDelta: number | null;
};

export function change(current: number | null | undefined, previous: number | null | undefined): number | null {
  return current == null || previous == null || previous <= 0 ? null : (current / previous - 1) * 100;
}

export function difference(current: number | null | undefined, previous: number | null | undefined): number | null {
  return current == null || previous == null ? null : current - previous;
}

export function monthOffset(ym: string, offset: number): string {
  const [year, month] = ym.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

export function analyze(data: ExportDataPoint[]): AnalysisPoint[] {
  const byMonth = new Map(data.map(p => [p.ym, p]));
  return data.map(p => {
    const prev = byMonth.get(monthOffset(p.ym, -1));
    const year = byMonth.get(monthOffset(p.ym, -12));
    return { ...p,
      priceMom: change(p.price, prev?.price),
      priceDelta: difference(p.priceYoy, prev?.priceYoy),
      quantityMom: change(p.dailyQuantity, prev?.dailyQuantity),
      quantityYoy: change(p.dailyQuantity, year?.dailyQuantity),
      yoyDelta: difference(p.yoy, prev?.yoy),
    };
  });
}

export function attentionSectors(items: ExportItem[], data: Record<string, ExportDataPoint[]>): Map<string, string> {
  const sectorScores = new Map<string, { sum: number; count: number; names: string[] }>();
  const latestMonth = Object.values(data).flatMap(rows => rows.slice(-1).map(p => p.ym)).sort().pop();
  for (const item of items.filter(i => i.importance >= 3)) {
    const latest = analyze(data[item.id] ?? []).at(-1);
    if (!latest || latest.ym !== latestMonth || latest.yoyDelta == null) continue;
    const row = sectorScores.get(item.sector) ?? { sum: 0, count: 0, names: [] };
    row.sum += Math.abs(latest.yoyDelta);
    row.count++;
    row.names.push(item.name);
    sectorScores.set(item.sector, row);
  }
  return new Map([...sectorScores.entries()].sort((a,b) => b[1].sum/b[1].count - a[1].sum/a[1].count).slice(0,3)
    .filter(([,r]) => r.sum > 0)
    .map(([sector,r]) => [sector, `이번 달 주요 품목 YoY 변화폭 상위 섹터 · ${r.names.join(", ")} · 매수 신호 아님`]));
}

export function attentionItems(items: ExportItem[], data: Record<string, ExportDataPoint[]>): Map<string, string> {
  const latestMonth = Object.values(data).flatMap(rows => rows.slice(-1).map(p => p.ym)).sort().pop();
  const sectors = new Map<string, { id: string; delta: number }[]>();
  for (const item of items.filter(i => i.importance >= 3)) {
    const latest = analyze(data[item.id] ?? []).at(-1);
    if (!latest || latest.ym !== latestMonth || latest.yoyDelta == null || latest.yoyDelta === 0) continue;
    const rows = sectors.get(item.sector) ?? [];
    rows.push({ id: item.id, delta: latest.yoyDelta });
    sectors.set(item.sector, rows);
  }
  return new Map([...sectors.values()].flatMap(rows => rows.sort((a,b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0,3)
    .map(row => [row.id, `이번 달 주요 변화 · 금액 YoY Δ ${pct(row.delta, "%p")} (전월 대비)`] as [string, string])));
}

export function pct(value: number | null | undefined, unit = "%"): string {
  return value == null || !Number.isFinite(value) ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}${unit}`;
}

export function compact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value/1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value/1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value/1e3).toFixed(1)}K`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function trend(yoy: number | null, delta: number | null): string {
  if (yoy == null || delta == null) return "추세 확인 중";
  if (delta === 0) return yoy >= 0 ? "성장 · 유지" : "역성장 · 유지";
  return yoy >= 0 ? (delta > 0 ? "성장 · 가속" : "성장 · 감속") : (delta > 0 ? "역성장 · 회복" : "역성장 · 악화");
}
