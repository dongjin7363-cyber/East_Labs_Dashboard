import { MemoEntry } from "@/lib/models/types";
import { normalizeTickerCsv } from "@/lib/services/memoService";
import { supabase } from "@/lib/supabaseClient";

export const MEMO_ENTRIES_STORAGE_KEY = "pf_memo_entries_v1";

interface UpsertMemoOptions {
  isCreate?: boolean;
}

export interface MemoRepository {
  getEntries(): Promise<MemoEntry[]>;
  upsertEntry(entry: MemoEntry, options?: UpsertMemoOptions): Promise<void>;
  deleteEntry(id: string): Promise<void>;
}

interface MemoRow {
  id?: string;
  user_id: string;
  date: string;
  buy_tickers: string;
  sell_tickers: string;
  comment: string;
  created_at: string;
  updated_at: string;
}

type RawRecord = Record<string, unknown>;

const LEGACY_TAG_STOPWORDS = new Set(["시장", "종목", "실수", "회고", "개선점", "일지"]);

function isClient(): boolean {
  return typeof window !== "undefined";
}

function toYmd(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2})/);

    if (match) {
      return match[1];
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function parseLegacyTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[,\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function migrateLegacyBuyTickers(input: RawRecord): string {
  const legacyTags = parseLegacyTags(input.tags)
    .map((tag) => tag.replace(/^#/, ""))
    .filter((tag) => tag && !LEGACY_TAG_STOPWORDS.has(tag));

  return normalizeTickerCsv(legacyTags.join(","));
}

function normalizeEntry(raw: unknown, index: number): MemoEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const date = toYmd(input.date);
  const buyTickersRaw =
    toText(input.buyTickers) ||
    toText(input.buy_tickers) ||
    migrateLegacyBuyTickers(input);
  const sellTickersRaw = toText(input.sellTickers) || toText(input.sell_tickers);
  const commentRaw =
    toText(input.comment) ||
    toText(input.body) ||
    toText(input.comment_text);

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `memo-${index}-${date}`,
    date,
    buyTickers: normalizeTickerCsv(buyTickersRaw),
    sellTickers: normalizeTickerCsv(sellTickersRaw),
    comment: commentRaw,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim() !== ""
        ? input.createdAt
        : typeof input.created_at === "string" && input.created_at.trim() !== ""
          ? input.created_at
          : new Date().toISOString(),
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim() !== ""
        ? input.updatedAt
        : typeof input.updated_at === "string" && input.updated_at.trim() !== ""
          ? input.updated_at
          : new Date().toISOString(),
  };
}

function sortEntries(entries: MemoEntry[]): MemoEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byUpdatedAt = b.updatedAt.localeCompare(a.updatedAt);

    if (byUpdatedAt !== 0) {
      return byUpdatedAt;
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

function readLocalEntries(): MemoEntry[] {
  if (!isClient()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MEMO_ENTRIES_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      return [];
    }

    return sortEntries(
      data
        .map((item, index) => normalizeEntry(item, index))
        .filter((item): item is MemoEntry => Boolean(item)),
    );
  } catch {
    return [];
  }
}

function writeLocalEntries(entries: MemoEntry[]): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    MEMO_ENTRIES_STORAGE_KEY,
    JSON.stringify(sortEntries(entries)),
  );
}

function normalizeEntryForDb(
  entry: MemoEntry,
  userId: string,
  options?: UpsertMemoOptions,
): MemoRow {
  const row: MemoRow = {
    user_id: userId,
    date: toYmd(entry.date),
    buy_tickers: normalizeTickerCsv(entry.buyTickers),
    sell_tickers: normalizeTickerCsv(entry.sellTickers),
    comment: entry.comment,
    created_at: entry.createdAt || new Date().toISOString(),
    updated_at: entry.updatedAt || new Date().toISOString(),
  };

  if (!options?.isCreate && entry.id.trim()) {
    row.id = entry.id.trim();
  }

  return row;
}

export class LocalMemoRepository implements MemoRepository {
  async getEntries(): Promise<MemoEntry[]> {
    return readLocalEntries();
  }

  async upsertEntry(entry: MemoEntry): Promise<void> {
    const normalized = normalizeEntry(entry, 0);

    if (!normalized) {
      return;
    }

    const current = readLocalEntries();
    const next = sortEntries([
      ...current.filter((item) => item.id !== normalized.id),
      normalized,
    ]);
    writeLocalEntries(next);
  }

  async deleteEntry(id: string): Promise<void> {
    const next = readLocalEntries().filter((item) => item.id !== id);
    writeLocalEntries(next);
  }
}

export class SupabaseMemoRepository implements MemoRepository {
  constructor(private readonly userId: string) {}

  async getEntries(): Promise<MemoEntry[]> {
    const { data, error } = await supabase
      .from("memo_entries")
      .select("id,user_id,date,buy_tickers,sell_tickers,comment,created_at,updated_at")
      .eq("user_id", this.userId)
      .order("date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return sortEntries(
      (data ?? [])
        .map((row, index) => normalizeEntry(row, index))
        .filter((row): row is MemoEntry => Boolean(row)),
    );
  }

  async upsertEntry(entry: MemoEntry, options?: UpsertMemoOptions): Promise<void> {
    const payload = normalizeEntryForDb(entry, this.userId, options);
    const { error } = await supabase
      .from("memo_entries")
      .upsert([payload], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const { error } = await supabase
      .from("memo_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createMemoRepository(userId?: string | null): MemoRepository {
  if (userId) {
    return new SupabaseMemoRepository(userId);
  }

  return new LocalMemoRepository();
}
