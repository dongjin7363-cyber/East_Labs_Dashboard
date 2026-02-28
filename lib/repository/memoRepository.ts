import { MemoEntry } from "@/lib/models/types";
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
  title: string | null;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

type RawRecord = Record<string, unknown>;

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

function toTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30);
  }

  return [];
}

function normalizeEntry(raw: unknown, index: number): MemoEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const body =
    typeof input.body === "string" && input.body.trim() !== ""
      ? input.body
      : "";
  const date = toYmd(input.date);

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `memo-${index}-${date}`,
    date,
    title:
      typeof input.title === "string" && input.title.trim() !== ""
        ? input.title.trim()
        : undefined,
    body,
    tags: toTags(input.tags),
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

    return b.updatedAt.localeCompare(a.updatedAt);
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
    title:
      typeof entry.title === "string" && entry.title.trim() !== ""
        ? entry.title.trim()
        : null,
    body: entry.body.trim(),
    tags: toTags(entry.tags),
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
    const withoutCurrentDate = current.filter(
      (item) => item.date !== normalized.date && item.id !== normalized.id,
    );
    writeLocalEntries([...withoutCurrentDate, normalized]);
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
      .select("id,user_id,date,title,body,tags,created_at,updated_at")
      .eq("user_id", this.userId)
      .order("date", { ascending: false });

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
      .upsert([payload], { onConflict: "user_id,date" });

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
