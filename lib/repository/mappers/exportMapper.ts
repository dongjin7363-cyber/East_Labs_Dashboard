import { ExportItem, ExportDataPoint } from "@/lib/models/types";
import { normalizeOptionalText, toFiniteNumber } from "@/lib/repository/mappers/common";

function normalizeTextLike(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeOptionalText(value);
}

function normalizeKeyText(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value !== "string") {
    return undefined;
  }

  return value.trim() ? value : undefined;
}

function normalizeImportance(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = normalizeOptionalText(value);
  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return Array.from(normalized).filter((char) => char === "★").length;
}

function toPct(value: unknown): number | null {
  const parsed = toFiniteNumber(value);
  return typeof parsed === "number" ? parsed * 100 : null;
}

export function deserializeExportItem(raw: unknown, index: number): ExportItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const sector = normalizeOptionalText(r.sector);
  const sheetName = normalizeKeyText(r.sheet_name) ?? normalizeKeyText(r.sheetName);
  const name =
    normalizeOptionalText(r.name) ??
    normalizeOptionalText(r.item_name) ??
    normalizeOptionalText(sheetName);
  if (!sector || !name) return null;
  if (r.is_active === false || r.isActive === false) return null;

  return {
    id: sheetName ?? normalizeTextLike(r.id) ?? `export-item-${index}`,
    sector,
    name,
    importance: normalizeImportance(r.importance),
    description: normalizeOptionalText(r.description),
    relatedStocks: normalizeOptionalText(r.related_stocks) ?? normalizeOptionalText(r.relatedStocks),
    note: normalizeOptionalText(r.note),
    isActive: true,
  };
}

export function deserializeExportDataPoint(
  raw: unknown,
  index: number,
): ExportDataPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const rawYm =
    normalizeOptionalText(r.period) ??
    normalizeOptionalText(r.ym) ??
    normalizeOptionalText(r.run_date) ??
    normalizeOptionalText(r.date);
  const itemId =
    normalizeTextLike(r.sheet_name) ??
    normalizeTextLike(r.sheetName) ??
    normalizeTextLike(r.item_id) ??
    normalizeTextLike(r.itemId);
  if (!rawYm || !itemId) return null;

  // Normalize to YYYY-MM regardless of whether full date string is stored
  const ym = rawYm.length >= 7 ? rawYm.slice(0, 7) : rawYm;

  return {
    id: normalizeTextLike(r.id) ?? `export-data-${ym}-${index}`,
    itemId,
    ym,
    avgExport: toFiniteNumber(r.daily_avg) ?? toFiniteNumber(r.avg_export) ?? null,
    yoy: toPct(r.yoy),
    mom: toPct(r.mom),
    priceYoy: toPct(r.price_yoy),
    qoq: toPct(r.qoq),
    asOfDate: normalizeOptionalText(r.as_of_date) ?? normalizeOptionalText(r.asOfDate) ?? null,
    isPartial: r.is_partial === true || r.isPartial === true,
  };
}
