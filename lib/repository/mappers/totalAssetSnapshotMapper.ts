import { TotalAssetSnapshot } from "@/lib/models/types";
import {
  normalizeIsoString,
  normalizeOptionalText,
  normalizeYmd,
  toNonNegativeInt,
  toPositiveFloat,
} from "@/lib/repository/mappers/common";

const DEFAULT_FX_RATE = 1350;

export interface TotalAssetSnapshotRow {
  user_id: string;
  date: string;
  total_asset_krw_int: number;
  fx_rate: number;
  memo: string | null;
  updated_at: string;
}

export function deserializeTotalAssetSnapshot(
  raw: unknown,
  index: number,
): TotalAssetSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeYmd(input.date);

  if (!date) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `total-asset-${index}-${date}`,
    date,
    totalAssetKrwInt: toNonNegativeInt(
      input.totalAssetKrwInt ?? input.total_asset_krw_int,
    ),
    fxRate: toPositiveFloat(input.fxRate ?? input.fx_rate, DEFAULT_FX_RATE),
    memo:
      normalizeOptionalText(input.memo) ??
      normalizeOptionalText(input.notes),
    createdAt: normalizeIsoString(
      input.createdAt ?? input.created_at ?? input.updatedAt ?? input.updated_at,
    ),
  };
}

export function serializeTotalAssetSnapshotRow(
  snapshot: TotalAssetSnapshot,
  userId: string,
): TotalAssetSnapshotRow {
  return {
    user_id: userId,
    date: snapshot.date,
    total_asset_krw_int: toNonNegativeInt(snapshot.totalAssetKrwInt),
    fx_rate: toPositiveFloat(snapshot.fxRate, DEFAULT_FX_RATE),
    memo: normalizeOptionalText(snapshot.memo) ?? null,
    updated_at: new Date().toISOString(),
  };
}
