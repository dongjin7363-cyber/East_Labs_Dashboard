export const QUALITY = [
  "tam",
  "adoption",
  "revenue",
  "margin",
  "fcf",
  "moat",
  "capital",
  "rs",
] as const;
export const DELTA = [
  "fundamental_acceleration",
  "narrative_change",
  "tam_expansion",
  "strategic_scarcity",
  "product_mix",
  "catalyst_density",
  "expectation_gap",
  "institutional_confirmation",
] as const;
export const LABELS: Record<string, string> = {
  tam: "TAM",
  adoption: "Adoption",
  revenue: "Revenue",
  margin: "Margin",
  fcf: "FCF",
  moat: "Moat",
  capital: "Capital",
  rs: "Relative Strength",
  fundamental_acceleration: "Fundamental Acceleration",
  narrative_change: "Narrative Change",
  tam_expansion: "TAM Expansion",
  strategic_scarcity: "Strategic Scarcity",
  product_mix: "New Product / Mix",
  catalyst_density: "Catalyst Density",
  expectation_gap: "Expectation Gap",
  institutional_confirmation: "Institutional / RS",
};
export type ComponentKey = (typeof QUALITY)[number] | (typeof DELTA)[number];
export type Component = {
  score: number;
  reason: string;
  evidence_ids: string[];
};
export type Evidence = {
  id: string;
  headline: string;
  source: string;
  source_type: "primary" | "analyst" | "news" | "social";
  url: string;
  published_at: string;
  summary: string;
  materiality: number;
  novelty: number;
  confidence: number;
  sentiment: "positive" | "negative" | "neutral";
};
export type Assessment = {
  research?: {
    origin: "historical_reassessment";
    version: string;
    researched_at: string;
    cutoff: string;
    limitations: string[];
    missing: string[];
    releases: { published_at: string; url: string; metrics: Record<string, number> }[];
    prices: { date: string; open: number; high: number; low: number; close: number; volume: number }[];
    price_url: string;
    return_1w: number;
    return_4w: number;
    spy_return_4w: number;
    excess_4w: number;
  };
  components: Record<ComponentKey, Component>;
  narrative_momentum: number;
  market_confirmation: number;
  confidence: number;
  thesis: string;
  risks: string[];
  drivers: { label: string; impact: number; evidence_ids: string[] }[];
  evidence: Evidence[];
};
export type Snapshot = Assessment & {
  ticker: string;
  week_date: string;
  quality_score: number;
  delta_score: number;
  super_score: number;
  classification: string;
  created_at: string;
};
export type Watch = { ticker: string; created_at: string; active: boolean };
export type Ranked = Snapshot & {
  rank: number;
  wow: number | null;
  fourWeek: number | null;
  rankChange: number | null;
};
export const WEEK = 7 * 86400000;
export const BENCHMARKS = ["SPY", "QQQ", "MAGS"];
export function weekDate(now = new Date()): string {
  // Saturday 00:00 UTC is Saturday 09:00 KST, including US DST changes.
  const date = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 1) % 7));
  return date.toISOString().slice(0, 10);
}
export function nextUpdate(now = new Date()): string {
  return new Date(Date.parse(weekDate(now)) + WEEK).toISOString();
}
export function normalizeTicker(value: unknown): string {
  if (typeof value !== "string") throw new Error("티커를 입력해 주세요.");
  const ticker = value.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z0-9]{1,2})?$/.test(ticker))
    throw new Error("미국 종목 티커를 확인해 주세요. 예: NVDA, BRK.B");
  return ticker;
}
export function safeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
function bounded(value: unknown, max: number, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new Error(`Invalid ${label}`);
  return value;
}
export function validateAssessment(input: unknown, cutoff: Date): Assessment {
  const a = input as Assessment;
  if (
    !a ||
    !a.components ||
    !Array.isArray(a.evidence) ||
    a.evidence.length < 2 ||
    a.evidence.length > 40
  )
    throw new Error("Insufficient evidence");
  const ids = new Set<string>();
  for (const e of a.evidence) {
    if (
      !e.id ||
      ids.has(e.id) ||
      !safeUrl(e.url) ||
      !e.headline ||
      !e.summary ||
      !e.source
    )
      throw new Error("Invalid evidence");
    const date = Date.parse(e.published_at);
    if (!Number.isFinite(date) || date > cutoff.getTime())
      throw new Error("Evidence after snapshot cutoff");
    if (
      !["primary", "analyst", "news", "social"].includes(e.source_type) ||
      !["positive", "negative", "neutral"].includes(e.sentiment)
    )
      throw new Error("Invalid evidence type");
    for (const key of ["novelty", "materiality", "confidence"] as const)
      bounded(e[key], 1, key);
    ids.add(e.id);
  }
  if (!a.evidence.some((e) => e.source_type === "primary"))
    throw new Error("Primary evidence required");
  for (const key of [...QUALITY, ...DELTA]) {
    const c = a.components[key];
    if (
      !c ||
      !c.reason ||
      !Array.isArray(c.evidence_ids) ||
      !c.evidence_ids.length ||
      c.evidence_ids.some((id) => !ids.has(id))
    )
      throw new Error(`Missing evidence for ${key}`);
    bounded(c.score, 5, key);
    if (
      c.score > 3 &&
      c.evidence_ids.every(
        (id) => a.evidence.find((e) => e.id === id)?.source_type === "social",
      )
    )
      throw new Error("Social-only high score rejected");
  }
  bounded(a.narrative_momentum, 100, "narrative");
  bounded(a.market_confirmation, 100, "market");
  bounded(a.confidence, 1, "confidence");
  if (
    typeof a.thesis !== "string" ||
    !a.thesis ||
    !Array.isArray(a.risks) ||
    !a.risks.every((r) => typeof r === "string") ||
    !Array.isArray(a.drivers)
  )
    throw new Error("Missing assessment rationale");
  for (const d of a.drivers)
    if (
      !d.label ||
      typeof d.impact !== "number" ||
      !Number.isFinite(d.impact) ||
      Math.abs(d.impact) > 100 ||
      !Array.isArray(d.evidence_ids) ||
      !d.evidence_ids.length ||
      d.evidence_ids.some((id) => !ids.has(id))
    )
      throw new Error("Invalid change driver");
  return a;
}
export function scores(a: Assessment) {
  const round = (n: number) => Math.round(n * 10) / 10;
  const quality_score = round(
    QUALITY.reduce((sum, k) => sum + a.components[k].score, 0),
  );
  const delta_score = round(
    DELTA.reduce((sum, k) => sum + a.components[k].score, 0),
  );
  const super_score = round(
    (quality_score / 40) * 30 +
      (delta_score / 40) * 45 +
      a.narrative_momentum * 0.15 +
      a.market_confirmation * 0.1,
  );
  const classification =
    delta_score >= 30
      ? quality_score >= 30
        ? "Super Stock"
        : "High-risk Inflection"
      : quality_score >= 30
        ? "Compounder"
        : "Story / Early Stage";
  return { quality_score, delta_score, super_score, classification };
}
export function rankSnapshots(
  all: Snapshot[],
  week: string,
  cohort: string[],
): Ranked[] {
  const sort = (date: string) =>
    all
      .filter((s) => s.week_date === date && cohort.includes(s.ticker))
      .sort(
        (a, b) =>
          b.super_score - a.super_score || a.ticker.localeCompare(b.ticker),
      );
  const previous = sort(
    new Date(Date.parse(week) - WEEK).toISOString().slice(0, 10),
  );
  const four = sort(
    new Date(Date.parse(week) - 4 * WEEK).toISOString().slice(0, 10),
  );
  return sort(week).map((s, index) => {
    const p = previous.find((x) => x.ticker === s.ticker),
      f = four.find((x) => x.ticker === s.ticker);
    return {
      ...s,
      rank: index + 1,
      wow: p ? Math.round((s.super_score - p.super_score) * 10) / 10 : null,
      fourWeek: f
        ? Math.round((s.super_score - f.super_score) * 10) / 10
        : null,
      rankChange: p ? previous.indexOf(p) - index : null,
    };
  });
}
