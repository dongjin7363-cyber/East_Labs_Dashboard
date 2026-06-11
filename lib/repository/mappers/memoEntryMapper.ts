import {
  DEFAULT_MEMO_TYPE,
  MEMO_SENTIMENTS,
  MEMO_TYPES,
  MemoEntry,
  MemoSentiment,
  MemoType,
} from "@/lib/models/types";
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
  title: string;
  content: string;
  memo_type: string;
  sentiment: string | null;
  buy_tickers: string;
  sell_tickers: string;
  comment: string;
  image_paths: string[] | null;
  created_at: string;
  updated_at: string;
}

function normalizeMemoType(value: unknown): MemoType {
  const normalized = normalizeOptionalText(value);
  const matched = MEMO_TYPES.find((type) => type === normalized);
  return matched ?? DEFAULT_MEMO_TYPE;
}

function normalizeSentiment(value: unknown): MemoSentiment | "" {
  const normalized = normalizeOptionalText(value);
  const matched = MEMO_SENTIMENTS.find((sentiment) => sentiment === normalized);
  return matched ?? "";
}

function firstContentLine(value: string): string | null {
  const firstLine = value
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "");

  return firstLine ?? null;
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

  const legacyComment =
    normalizeOptionalText(input.comment) ??
    normalizeOptionalText(input.body) ??
    "";
  const content = normalizeOptionalText(input.content) ?? legacyComment;
  const title =
    normalizeOptionalText(input.title) ??
    firstContentLine(content) ??
    "Untitled Memo";

  return {
    id: normalizeOptionalText(input.id) ?? `memo-entry-${index}`,
    date,
    title,
    content,
    memoType: normalizeMemoType(input.memoType ?? input.memo_type),
    sentiment: normalizeSentiment(input.sentiment),
    buyTickers:
      normalizeOptionalText(input.buyTickers) ??
      normalizeOptionalText(input.buy_tickers) ??
      "",
    sellTickers:
      normalizeOptionalText(input.sellTickers) ??
      normalizeOptionalText(input.sell_tickers) ??
      "",
    comment: legacyComment || content,
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
  const sentiment = normalizeSentiment(entry.sentiment);
  const row: MemoEntryRow = {
    user_id: userId,
    date: entry.date,
    title: normalizeOptionalText(entry.title) ?? firstContentLine(entry.content) ?? "Untitled Memo",
    content: normalizeOptionalText(entry.content) ?? normalizeOptionalText(entry.comment) ?? "",
    memo_type: normalizeMemoType(entry.memoType),
    sentiment: sentiment || null,
    buy_tickers: normalizeOptionalText(entry.buyTickers) ?? "",
    sell_tickers: normalizeOptionalText(entry.sellTickers) ?? "",
    comment:
      normalizeOptionalText(entry.comment) ??
      normalizeOptionalText(entry.content) ??
      "",
    image_paths: entry.imagePaths.length > 0 ? [...entry.imagePaths] : [],
    created_at: normalizeIsoString(entry.createdAt),
    updated_at: normalizeIsoString(entry.updatedAt),
  };

  if (!options?.isCreate && entry.id.trim()) {
    row.id = entry.id.trim();
  }

  return row;
}
