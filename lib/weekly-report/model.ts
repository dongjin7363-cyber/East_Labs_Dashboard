export interface WeeklyReport {
  published_date: string;
  title: string;
  headline: string;
  body_markdown: string;
}

export function parseWeeklyReport(value: unknown, filename: string): WeeklyReport {
  if (!value || typeof value !== "object") throw new Error(`Invalid report: ${filename}`);
  const report = value as Record<string, unknown>;
  for (const field of ["published_date", "title", "headline", "body_markdown"] as const) {
    if (typeof report[field] !== "string" || !report[field].trim()) {
      throw new Error(`Missing ${field}: ${filename}`);
    }
  }
  const date = report.published_date as string;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || filename !== `${date}.json`) {
    throw new Error(`Report date must match filename: ${filename}`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || parsed.getUTCDay() !== 0) {
    throw new Error(`Report publication date must be a valid Sunday: ${filename}`);
  }
  return {
    published_date: date,
    title: report.title as string,
    headline: report.headline as string,
    body_markdown: report.body_markdown as string,
  };
}

export function formatReportDate(date: string): string {
  return `${date.replace(/-/g, ".")} · 일요일`;
}
