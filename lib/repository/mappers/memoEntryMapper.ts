import { MemoEntry } from "@/lib/models/types";
import {
  normalizeIsoString,
  normalizeOptionalText,
  normalizeStringArray,
  normalizeYmd,
} from "@/lib/repository/mappers/common";

export interface MemoEntryRow {
  id?: string;
  user_id: string;
  date: string;
  buy_tickers: string;
  sell_tickers: string;
  comment: string;
  image_paths: string[] | null;
  created_at: string;
  updated_at: string;
}

export function deserializeMemoEntry(raw: unknown, index: number): MemoEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeYmd(input.date);

  if (!date) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `memo-entry-${index}`,
    date,
    buyTickers:
      normalizeOptionalText(input.buyTickers) ??
      normalizeOptionalText(input.buy_tickers) ??
      "",
    sellTickers:
      normalizeOptionalText(input.sellTickers) ??
      normalizeOptionalText(input.sell_tickers) ??
      "",
    comment:
      normalizeOptionalText(input.comment) ??
      normalizeOptionalText(input.body) ??
      "",
    imagePaths: normalizeStringArray(input.imagePaths ?? input.image_paths),
    imageSignedUrls:
      input.imageSignedUrls && typeof input.imageSignedUrls === "object"
        ? (input.imageSignedUrls as Record<string, string | null>)
        : undefined,
    createdAt: normalizeIsoString(input.createdAt ?? input.created_at),
    updatedAt: normalizeIsoString(input.updatedAt ?? input.updated_at),
  };
}

export function serializeMemoEntryRow(
  entry: MemoEntry,
  userId: string,
  options?: { isCreate?: boolean },
): MemoEntryRow {
  const row: MemoEntryRow = {
    user_id: userId,
    date: entry.date,
    buy_tickers: normalizeOptionalText(entry.buyTickers) ?? "",
    sell_tickers: normalizeOptionalText(entry.sellTickers) ?? "",
    comment: normalizeOptionalText(entry.comment) ?? "",
    image_paths: entry.imagePaths.length > 0 ? [...entry.imagePaths] : [],
    created_at: normalizeIsoString(entry.createdAt),
    updated_at: normalizeIsoString(entry.updatedAt),
  };

  if (!options?.isCreate && entry.id.trim()) {
    row.id = entry.id.trim();
  }

  return row;
}
