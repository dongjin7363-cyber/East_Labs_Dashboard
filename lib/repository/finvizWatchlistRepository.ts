import { FinvizWatchlistItem } from "@/lib/models/types";
import { normalizeOptionalText, toFiniteNumber } from "@/lib/repository/mappers/common";
import { supabase } from "@/lib/supabaseClient";

function defaultChartUrl(ticker: string): string {
  return `https://finviz.com/chart.ashx?t=${encodeURIComponent(ticker)}&ty=c&ta=1&p=d&s=l`;
}

function normalizeText(value: unknown): string {
  return normalizeOptionalText(value) ?? "";
}

function normalizeStar(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const level = Math.max(0, Math.min(3, Math.round(value)));
    return level > 0 ? "★".repeat(level) : "";
  }

  const text = normalizeText(value);
  const numericLevel = Number.parseInt(text, 10);
  const level = Number.isFinite(numericLevel)
    ? Math.max(0, Math.min(3, numericLevel))
    : Math.max(0, Math.min(3, Array.from(text).filter((char) => char === "★").length));
  return level > 0 ? "★".repeat(level) : "";
}

function deserializeFinvizWatchlistItem(raw: unknown, index: number): FinvizWatchlistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const ticker = normalizeText(r.ticker).toUpperCase();
  const sector = normalizeText(r.sector);
  const displayName = normalizeText(r.display_name) || normalizeText(r.displayName);
  if (!ticker || !sector || !displayName) return null;

  return {
    id: normalizeText(r.id) || `finviz-watchlist-${index}`,
    ticker,
    sector,
    displayName,
    keywords: normalizeText(r.keywords),
    star: normalizeStar(r.star),
    chartUrl: normalizeText(r.chart_url) || normalizeText(r.chartUrl) || defaultChartUrl(ticker),
    sortOrder: toFiniteNumber(r.sort_order) ?? toFiniteNumber(r.sortOrder) ?? index,
    isActive: r.is_active !== false && r.isActive !== false,
    createdAt: normalizeText(r.created_at) || normalizeText(r.createdAt),
    updatedAt: normalizeText(r.updated_at) || normalizeText(r.updatedAt),
  };
}

export async function fetchFinvizWatchlist(): Promise<FinvizWatchlistItem[]> {
  const { data, error } = await supabase
    .from("market_finviz_watchlist")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .map((row, index) => deserializeFinvizWatchlistItem(row, index))
    .filter((item): item is FinvizWatchlistItem => Boolean(item));
}
