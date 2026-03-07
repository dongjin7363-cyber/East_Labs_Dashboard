import { MemoEntry } from "@/lib/models/types";
import {
  deserializeMemoEntry,
  serializeMemoEntryRow,
} from "@/lib/repository/mappers/memoEntryMapper";
import { supabase } from "@/lib/supabaseClient";
import { getMonthRangeFromYm } from "@/lib/utils/date";

const MEMO_STORAGE_KEY = "pf_memo_entries_v1";
export const MEMO_ENTRIES_SYNCED_FLAG_KEY = "pf_synced_memo_entries_v1";
const MEMO_IMAGE_BUCKET = "memo-images";

export interface MemoRepository {
  getEntriesByMonth(ym: string): Promise<MemoEntry[]>;
  getEntriesByDate(date: string): Promise<MemoEntry[]>;
  getAllEntries(): Promise<MemoEntry[]>;
  upsertEntry(entry: MemoEntry, options?: { isCreate?: boolean }): Promise<void>;
  deleteEntry(id: string): Promise<void>;
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
        .map((item, index) => deserializeMemoEntry(item, index))
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

  const canonical = sortEntries(entries).map((entry, index) => {
    const normalized = deserializeMemoEntry(entry, index);
    return normalized ?? entry;
  });

  window.localStorage.setItem(MEMO_STORAGE_KEY, JSON.stringify(canonical));
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
        .map((row, index) => deserializeMemoEntry(row, index))
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
    const row = serializeMemoEntryRow(entry, this.userId, options);
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
