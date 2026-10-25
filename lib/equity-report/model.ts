export const SECTION_TITLES = [
  "Regime", "Weekly Takeaway", "01 Weekly Market Dashboard",
  "02 Macro & Economic Conditions", "03 Equity Market & Earnings",
  "04 Bonds Commodities & Crypto", "05 Next Week Watchlist",
] as const;
export const REQUIRED_ASSETS = ["kospi", "kosdaq", "sp500", "nasdaq", "us2y", "us10y", "kr3y", "kr10y", "gold", "bitcoin"] as const;
export interface MarketSeries {
  id: string; label: string; unit: string; kind: "price" | "yield";
  source_name: string; source_url: string; as_of: string;
  // Exchange-local session dates; BTC uses a consistent UTC daily cutoff.
  points: { date: string; value: number }[];
  note: string;
}
export interface ScheduledEquityReport {
  schema_version: 1; report_type: "east_weekly_equity";
  published_date: string; generated_at: string; cutoff_at: string;
  title: string; headline: string; body_markdown: string;
  dashboard: MarketSeries[];
}
export interface ArchivedEquityReport {
  schema_version: 2; report_type: "east_weekly_equity";
  publication_mode: "user_supplied_archive";
  published_date: string; imported_at: string; source_description: string;
  title: string; headline: string; body_markdown: string; period: string;
  performance: { label: string; change: number }[];
}
export type EquityReport = ScheduledEquityReport | ArchivedEquityReport;

function parseArchive(value: unknown, filename: string): ArchivedEquityReport {
  const r = value as ArchivedEquityReport;
  check(r.report_type === "east_weekly_equity" && r.publication_mode === "user_supplied_archive", "Invalid archive provenance");
  check(dateValue(r.published_date) && filename === `${r.published_date}.json` && new Date(r.published_date).getUTCDay() === 6, "Invalid archive date");
  check(timestamp(r.imported_at) && kstDate(new Date(r.imported_at)) >= r.published_date, "Invalid import timestamp");
  for (const key of ["source_description", "title", "headline", "body_markdown", "period"] as const) check(typeof r[key] === "string" && r[key].trim(), `Missing archive ${key}`);
  check(r.title.startsWith("EAST Weekly Equity Report"), "Wrong archive title");
  const headings = [...r.body_markdown.matchAll(/^## (.+)$/gm)];
  check(headings.length === SECTION_TITLES.length && headings.every((h, i) => h[1].trim() === SECTION_TITLES[i]), "Archive section order mismatch");
  check(Array.isArray(r.performance) && r.performance.length > 0 && r.performance.length <= 20, "Missing archive chart");
  check(new Set(r.performance.map(p => p.label)).size === r.performance.length, "Duplicate archive chart labels");
  for (const p of r.performance) check(typeof p.label === "string" && p.label.trim() && typeof p.change === "number" && Number.isFinite(p.change), "Invalid archive chart value");
  return r;
}
function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function dateValue(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}
export function kstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}
export function weeklyChange(series: MarketSeries): number {
  const first = series.points[0].value;
  const last = series.points[series.points.length - 1].value;
  return series.kind === "yield" ? (last - first) * 100 : (last / first - 1) * 100;
}
export function parseEquityReport(value: unknown, filename: string): EquityReport {
  check(value && typeof value === "object", "Invalid equity report");
  if ((value as { schema_version?: number }).schema_version === 2) return parseArchive(value, filename);
  const r = value as ScheduledEquityReport;
  check(r.schema_version === 1 && r.report_type === "east_weekly_equity", "Wrong report type/version");
  check(dateValue(r.published_date) && filename === `${r.published_date}.json` && new Date(r.published_date).getUTCDay() === 6, "Publication must match a Saturday filename");
  check(timestamp(r.generated_at) && timestamp(r.cutoff_at), "Explicit timestamp timezones required");
  const start = Date.parse(`${r.published_date}T06:00:00+09:00`);
  const deadline = Date.parse(`${r.published_date}T07:00:00+09:00`);
  check(Date.parse(r.generated_at) >= start && Date.parse(r.generated_at) < deadline, "Generate between 06:00 and 07:00 KST");
  check(Date.parse(r.cutoff_at) <= Date.parse(r.generated_at) && Date.parse(r.cutoff_at) >= start - 3600000, "Invalid report cutoff");
  for (const key of ["title", "headline", "body_markdown"] as const) check(typeof r[key] === "string" && r[key].trim(), `Missing ${key}`);
  check(r.title.startsWith("EAST Weekly Equity Report"), "Wrong title");
  check(!/chatgpt-content-reference|\uE200|\uE201/.test(r.body_markdown), "Unresolved source markers");
  const headings = [...r.body_markdown.matchAll(/^## (.+)$/gm)];
  check(headings.length === SECTION_TITLES.length && headings.every((h, i) => h[1].trim() === SECTION_TITLES[i]), "Required section order mismatch");
  for (let i = 2; i < headings.length; i++) {
    const section = r.body_markdown.slice(headings[i].index, headings[i + 1]?.index);
    check(/^### Market Read-through\s*\n\s*\S/m.test(section), `Missing Market Read-through: ${SECTION_TITLES[i]}`);
  }
  const macro = r.body_markdown.slice(headings[3].index, headings[4].index);
  check(/\|\s*지표\s*\|\s*실제치\s*\|\s*예상치\s*\|\s*직전치\s*\|\s*마켓 해석\s*\|/.test(macro), "Macro comparison columns required");
  for (let i = 3; i < headings.length; i++) {
    check(/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(r.body_markdown.slice(headings[i].index, headings[i + 1]?.index)), `Missing section sources: ${SECTION_TITLES[i]}`);
  }
  check(Array.isArray(r.dashboard) && r.dashboard.length >= REQUIRED_ASSETS.length && r.dashboard.length <= 20, "Dashboard coverage missing");
  check(new Set(r.dashboard.map(s => s.id)).size === r.dashboard.length, "Duplicate assets");
  const publication = Date.parse(r.published_date);
  for (const id of REQUIRED_ASSETS) check(r.dashboard.some(s => s.id === id), `Missing asset ${id}`);
  for (const s of r.dashboard) {
    for (const key of ["id", "label", "unit", "source_name"] as const) check(typeof s[key] === "string" && s[key].trim(), `Missing asset ${key}`);
    check(typeof s.note === "string", "Asset note required (empty allowed)");
    check(s.kind === "price" || s.kind === "yield", "Invalid series kind");
    if (["us2y", "us10y", "kr3y", "kr10y"].includes(s.id)) check(s.kind === "yield" && s.unit === "%", "Treasury series must be yields in percent");
    else check(s.kind === "price", "Non-bond series must be prices");
    check(typeof s.source_url === "string" && /^https?:\/\//.test(s.source_url), "Source URL required");
    try { new URL(s.source_url); } catch { throw new Error("Invalid source URL"); }
    check(timestamp(s.as_of) && Date.parse(s.as_of) <= Date.parse(r.cutoff_at) && Date.parse(s.as_of) >= publication - 3 * 86400000, "Stale/future asset as-of timestamp");
    check(Array.isArray(s.points) && s.points.length >= 2 && s.points.length <= 10, "Need previous-week baseline and current-week observations");
    s.points.forEach((p, i) => {
      check(dateValue(p.date) && typeof p.value === "number" && Number.isFinite(p.value), "Invalid observation");
      check(s.kind === "yield" || p.value > 0, "Price must be positive");
      check(i === 0 || p.date > s.points[i - 1].date, "Observations must be sorted and unique");
      check(p.date < r.published_date, "Only completed prior sessions allowed");
    });
    const first = Date.parse(s.points[0].date), last = Date.parse(s.points[s.points.length - 1].date);
    check(first >= publication - 11 * 86400000 && first <= publication - 8 * 86400000, "Baseline must be prior week's close");
    check(last >= publication - 4 * 86400000, "Latest close is stale");
    if (first !== publication - 8 * 86400000 || last !== publication - 86400000) check(s.note.trim(), "Explain holiday/observation cutoff");
  }
  return r;
}
export function validatePublication(value: unknown, date: string, now = new Date()): EquityReport {
  const r = parseEquityReport(value, `${date}.json`);
  check(r.schema_version === 1, "Scheduled publication cannot import an archive");
  check(kstDate(now) === date && now.getTime() >= Date.parse(`${date}T07:00:00+09:00`), "Publish only on the same Saturday at/after 07:00 KST");
  check(Date.parse(r.generated_at) <= now.getTime(), "Future draft");
  return r;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
export function publicationDecision(draft: unknown, existing: unknown | null, date: string, now = new Date()): "create" | "unchanged" {
  validatePublication(draft, date, now);
  if (existing === null) return "create";
  parseEquityReport(existing, `${date}.json`);
  check(canonical(draft) === canonical(existing), "Published report conflicts with draft; never overwrite");
  return "unchanged";
}
