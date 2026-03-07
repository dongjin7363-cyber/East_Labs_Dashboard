import { MarketSnapshot } from "@/lib/models/types";
import { normalizeIsoString, normalizeOptionalText } from "@/lib/repository/mappers/common";

export interface MarketSnapshotRow {
  id?: string;
  run_date: string;
  snapshot_key: string;
  title: string;
  symbol: string;
  category: string;
  section: string;
  source_url: string;
  image_url: string;
  sort_order: number | null;
  updated_at: string | null;
}

const REMOVED_SYMBOLS = new Set([
  "PHXE",
  "VTI",
  "IVV",
  "KLAC",
  "HPE",
  "STX",
  "PSTG",
  "AMKR",
  "ASX",
  "BKR",
  "SLB",
]);

function normalizeSection(section: string): string {
  const normalized = section.trim();

  if (normalized === "주요살피는 종목군") {
    return "Main Watchlist";
  }

  return normalized || "Other";
}

function normalizeCategory(category: string): string {
  const normalized = category.trim();

  if (!normalized) {
    return "Other";
  }

  if (normalized.toLowerCase() === "index") {
    return "Index";
  }

  if (normalized.toLowerCase() === "sector") {
    return "Sector";
  }

  if (normalized.toLowerCase() === "stock") {
    return "Stock";
  }

  return normalized;
}

export function deserializeMarketSnapshot(
  raw: unknown,
  index: number,
): MarketSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const symbol = (
    normalizeOptionalText(input.symbol) ??
    normalizeOptionalText(input.ticker)
  )?.toUpperCase();

  if (!symbol || REMOVED_SYMBOLS.has(symbol)) {
    return null;
  }

  const snapshotKey =
    normalizeOptionalText(input.snapshotKey) ??
    normalizeOptionalText(input.snapshot_key) ??
    symbol.toLowerCase();
  const runDate =
    normalizeOptionalText(input.runDate) ??
    normalizeOptionalText(input.run_date);
  const imageUrl =
    normalizeOptionalText(input.imageUrl) ??
    normalizeOptionalText(input.image_url);

  if (!runDate || !imageUrl) {
    return null;
  }

  const sortOrderRaw = input.sortOrder ?? input.sort_order;
  const sortOrder =
    typeof sortOrderRaw === "number" && Number.isFinite(sortOrderRaw)
      ? sortOrderRaw
      : 0;

  return {
    id:
      normalizeOptionalText(input.id) ??
      `market-snapshot-${runDate}-${snapshotKey}-${index}`,
    runDate,
    snapshotKey,
    title: normalizeOptionalText(input.title) ?? symbol,
    symbol,
    category: normalizeCategory(normalizeOptionalText(input.category) ?? ""),
    section: normalizeSection(normalizeOptionalText(input.section) ?? ""),
    sourceUrl:
      normalizeOptionalText(input.sourceUrl) ??
      normalizeOptionalText(input.source_url) ??
      "",
    imageUrl,
    sortOrder,
    updatedAt: normalizeIsoString(input.updatedAt ?? input.updated_at),
  };
}

export function getMarketCategoryBadgeTone(category: string): string {
  const normalized = category.toLowerCase();

  if (normalized === "index") {
    return "is-index";
  }

  if (normalized === "sector") {
    return "is-sector";
  }

  if (normalized === "stock") {
    return "is-stock";
  }

  return "is-other";
}
