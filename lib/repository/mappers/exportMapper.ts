import { ExportItem, ExportDataPoint } from "@/lib/models/types";
import { normalizeOptionalText, toFiniteNumber } from "@/lib/repository/mappers/common";

function normalizeTextLike(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return normalizeOptionalText(value);
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

export function deserializeExportItem(raw: unknown, index: number): ExportItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const sector = normalizeOptionalText(r.sector);
  const name = normalizeOptionalText(r.name) ?? normalizeOptionalText(r.item_name);
  if (!sector || !name) return null;

  return {
    id: normalizeTextLike(r.id) ?? `export-item-${index}`,
    sector,
    name,
    importance: normalizeImportance(r.importance),
  };
}

export function deserializeExportDataPoint(
  raw: unknown,
  index: number,
): ExportDataPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const rawYm =
    normalizeOptionalText(r.ym) ??
    normalizeOptionalText(r.run_date) ??
    normalizeOptionalText(r.date);
  const itemId =
    normalizeTextLike(r.item_id) ?? normalizeTextLike(r.itemId);
  if (!rawYm || !itemId) return null;

  // Normalize to YYYY-MM regardless of whether full date string is stored
  const ym = rawYm.length >= 7 ? rawYm.slice(0, 7) : rawYm;

  return {
    id: normalizeTextLike(r.id) ?? `export-data-${ym}-${index}`,
    itemId,
    ym,
    avgExport: toFiniteNumber(r.avg_export) ?? null,
    yoy: toFiniteNumber(r.yoy) ?? null,
    mom: toFiniteNumber(r.mom) ?? null,
    priceYoy: toFiniteNumber(r.price_yoy) ?? null,
    qoq: toFiniteNumber(r.qoq) ?? null,
  };
}
