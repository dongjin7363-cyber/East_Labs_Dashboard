import { MemoEntry } from "@/lib/models/types";
import { getMonthRangeFromYm } from "@/lib/utils/date";

export interface MemoDraftInput {
  date: string;
  buyTickers: string;
  sellTickers: string;
  comment: string;
}

export function normalizeTickerCsv(input: string): string {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

export function listMemoEntriesByMonth(entries: MemoEntry[], month: string): MemoEntry[] {
  const range = getMonthRangeFromYm(month);

  return entries.filter((entry) => entry.date >= range.from && entry.date <= range.to);
}

export function listMemoEntriesByDate(entries: MemoEntry[], date: string): MemoEntry[] {
  return entries
    .filter((entry) => entry.date === date)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildMemoCountByDate(entries: MemoEntry[]): Record<string, number> {
  return entries.reduce<Record<string, number>>((acc, entry) => {
    acc[entry.date] = (acc[entry.date] ?? 0) + 1;
    return acc;
  }, {});
}

export function isMemoMatched(entry: MemoEntry, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    entry.buyTickers.toLowerCase().includes(normalized) ||
    entry.sellTickers.toLowerCase().includes(normalized) ||
    entry.comment.toLowerCase().includes(normalized)
  );
}
