import { MemoEntry } from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";
import { getMonthRangeFromYm } from "@/lib/utils/date";

const MEMO_STORAGE_KEY = "pf_memo_entries_v1";
export const MEMO_ENTRIES_SYNCED_FLAG_KEY = "pf_synced_memo_entries_v1";
const MEMO_IMAGE_BUCKET = "memo-images";

interface MemoEntryRow {
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

export interface MemoRepository {
  getEntriesByMonth(ym: string): Promise<MemoEntry[]>;
  getEntriesByDate(date: string): Promise<MemoEntry[]>;
  getAllEntries(): Promise<MemoEntry[]>;
  upsertEntry(entry: MemoEntry, options?: { isCreate?: boolean }): Promise<void>;
  deleteEntry(id: string): Promise<void>;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeImagePaths(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeMemoEntry(raw: unknown, index: number): MemoEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeOptionalText(input.date);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const buyTickers =
    normalizeOptionalText(input.buy_tickers) ??
    normalizeOptionalText(input.buyTickers) ??
    "";
  const sellTickers =
    normalizeOptionalText(input.sell_tickers) ??
    normalizeOptionalText(input.sellTickers) ??
    "";
  const comment =
    normalizeOptionalText(input.comment) ??
    normalizeOptionalText(input.body) ??
    "";

  return {
    id: normalizeOptionalText(input.id) ?? `memo-entry-${index}`,
    date,
    buyTickers,
    sellTickers,
    comment,
    imagePaths: normalizeImagePaths(input.image_paths ?? input.imagePaths),
    createdAt:
      normalizeOptionalText(input.created_at) ??
      normalizeOptionalText(input.createdAt) ??
      new Date().toISOString(),
    updatedAt:
      normalizeOptionalText(input.updated_at) ??
      normalizeOptionalText(input.updatedAt) ??
      new Date().toISOString(),
  };
}

function sortEntries(entries: MemoEntry[]): MemoEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function filterByDate(entries: MemoEntry[], date: string): MemoEntry[] {
  return entries.filter((entry) => entry.date === date);
}

function filterByMonth(entries: MemoEntry[], ym: string): MemoEntry[] {
  const range = getMonthRangeFromYm(ym);
  return entries.filter((entry) => entry.date >= range.from && entry.date <= range.to);
}

function readLocalEntries(): MemoEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MEMO_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return sortEntries(
      parsed
        .map((item, index) => normalizeMemoEntry(item, index))
        .filter((entry): entry is MemoEntry => Boolean(entry)),
    );
  } catch {
    return [];
  }
}

function writeLocalEntries(entries: MemoEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(sortEntries(entries)));
}

function toRow(
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
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };

  if (!options?.isCreate && entry.id.trim()) {
    row.id = entry.id.trim();
  }

  return row;
}

async function withSignedUrls(entry: MemoEntry): Promise<MemoEntry> {
  if (entry.imagePaths.length === 0) {
    return entry;
  }

  const signedUrlMap: Record<string, string | null> = {};
  await Promise.all(
    entry.imagePaths.map(async (path) => {
      try {
        const { data, error } = await supabase.storage
          .from(MEMO_IMAGE_BUCKET)
          .createSignedUrl(path, 60 * 60);

        if (error || !data?.signedUrl) {
          signedUrlMap[path] = null;
          return;
        }

        signedUrlMap[path] = data.signedUrl;
      } catch {
        signedUrlMap[path] = null;
      }
    }),
  );

  return {
    ...entry,
    imageSignedUrls: signedUrlMap,
  };
}

export class LocalMemoRepository implements MemoRepository {
  async getAllEntries(): Promise<MemoEntry[]> {
    return readLocalEntries();
  }

  async getEntriesByMonth(ym: string): Promise<MemoEntry[]> {
    return filterByMonth(readLocalEntries(), ym);
  }

  async getEntriesByDate(date: string): Promise<MemoEntry[]> {
    return filterByDate(readLocalEntries(), date);
  }

  async upsertEntry(entry: MemoEntry): Promise<void> {
    const current = readLocalEntries();
    const next = [...current.filter((item) => item.id !== entry.id), entry];
    writeLocalEntries(next);
  }

  async deleteEntry(id: string): Promise<void> {
    const current = readLocalEntries();
    writeLocalEntries(current.filter((entry) => entry.id !== id));
  }
}

export class SupabaseMemoRepository implements MemoRepository {
  constructor(private readonly userId: string) {}

  async getAllEntries(): Promise<MemoEntry[]> {
    const { data, error } = await supabase
      .from("memo_entries")
      .select("*")
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }

    const parsed = sortEntries(
      (data ?? [])
        .map((row, index) => normalizeMemoEntry(row, index))
        .filter((entry): entry is MemoEntry => Boolean(entry)),
    );

    const withUrls = await Promise.all(parsed.map((entry) => withSignedUrls(entry)));
    return withUrls;
  }

  async getEntriesByMonth(ym: string): Promise<MemoEntry[]> {
    return filterByMonth(await this.getAllEntries(), ym);
  }

  async getEntriesByDate(date: string): Promise<MemoEntry[]> {
    return filterByDate(await this.getAllEntries(), date);
  }

  async upsertEntry(entry: MemoEntry, options?: { isCreate?: boolean }): Promise<void> {
    const row = toRow(entry, this.userId, options);
    const { error } = await supabase
      .from("memo_entries")
      .upsert([row], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const current = await this.getAllEntries();
    const target = current.find((entry) => entry.id === id);

    const { error } = await supabase
      .from("memo_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }

    if (target && target.imagePaths.length > 0) {
      void supabase.storage.from(MEMO_IMAGE_BUCKET).remove(target.imagePaths);
    }
  }
}

export function createMemoRepository(userId?: string | null): MemoRepository {
  if (userId) {
    return new SupabaseMemoRepository(userId);
  }

  return new LocalMemoRepository();
}

export function getLocalMemoEntries(): MemoEntry[] {
  return readLocalEntries();
}

export function replaceLocalMemoEntries(entries: MemoEntry[]): void {
  writeLocalEntries(entries);
}
