import { MarketPost } from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";

export const MARKET_POSTS_STORAGE_KEY = "pf_market_posts_v1";

interface UpsertMarketPostOptions {
  isCreate?: boolean;
}

export interface MarketRepository {
  getPosts(): Promise<MarketPost[]>;
  upsertPost(post: MarketPost, options?: UpsertMarketPostOptions): Promise<void>;
  deletePost(id: string): Promise<void>;
}

interface MarketPostRow {
  id?: string;
  user_id: string;
  date: string;
  macro_text: string;
  indices_text: string;
  notes_text: string;
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

function normalizePost(raw: unknown, index: number): MarketPost | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const date = toYmd(input.date);

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `market-${index}-${date}`,
    date,
    macroText:
      typeof input.macroText === "string"
        ? input.macroText
        : typeof input.macro_text === "string"
          ? input.macro_text
          : "",
    indicesText:
      typeof input.indicesText === "string"
        ? input.indicesText
        : typeof input.indices_text === "string"
          ? input.indices_text
          : "",
    notesText:
      typeof input.notesText === "string"
        ? input.notesText
        : typeof input.notes_text === "string"
          ? input.notes_text
          : "",
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

function sortPosts(posts: MarketPost[]): MarketPost[] {
  return [...posts].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function readLocalPosts(): MarketPost[] {
  if (!isClient()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MARKET_POSTS_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const data = JSON.parse(raw);

    if (!Array.isArray(data)) {
      return [];
    }

    return sortPosts(
      data
        .map((item, index) => normalizePost(item, index))
        .filter((item): item is MarketPost => Boolean(item)),
    );
  } catch {
    return [];
  }
}

function writeLocalPosts(posts: MarketPost[]): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    MARKET_POSTS_STORAGE_KEY,
    JSON.stringify(sortPosts(posts)),
  );
}

function normalizePostForDb(
  post: MarketPost,
  userId: string,
  options?: UpsertMarketPostOptions,
): MarketPostRow {
  const row: MarketPostRow = {
    user_id: userId,
    date: toYmd(post.date),
    macro_text: post.macroText,
    indices_text: post.indicesText,
    notes_text: post.notesText,
    created_at: post.createdAt || new Date().toISOString(),
    updated_at: post.updatedAt || new Date().toISOString(),
  };

  if (!options?.isCreate && post.id.trim()) {
    row.id = post.id.trim();
  }

  return row;
}

export class LocalMarketRepository implements MarketRepository {
  async getPosts(): Promise<MarketPost[]> {
    return readLocalPosts();
  }

  async upsertPost(post: MarketPost): Promise<void> {
    const normalized = normalizePost(post, 0);

    if (!normalized) {
      return;
    }

    const current = readLocalPosts();
    const withoutCurrentDate = current.filter(
      (item) => item.date !== normalized.date && item.id !== normalized.id,
    );
    writeLocalPosts([...withoutCurrentDate, normalized]);
  }

  async deletePost(id: string): Promise<void> {
    const next = readLocalPosts().filter((item) => item.id !== id);
    writeLocalPosts(next);
  }
}

export class SupabaseMarketRepository implements MarketRepository {
  constructor(private readonly userId: string) {}

  async getPosts(): Promise<MarketPost[]> {
    const { data, error } = await supabase
      .from("market_posts")
      .select("id,user_id,date,macro_text,indices_text,notes_text,created_at,updated_at")
      .eq("user_id", this.userId)
      .order("date", { ascending: false });

    if (error) {
      throw error;
    }

    return sortPosts(
      (data ?? [])
        .map((row, index) => normalizePost(row, index))
        .filter((row): row is MarketPost => Boolean(row)),
    );
  }

  async upsertPost(post: MarketPost, options?: UpsertMarketPostOptions): Promise<void> {
    const payload = normalizePostForDb(post, this.userId, options);
    const { error } = await supabase
      .from("market_posts")
      .upsert([payload], { onConflict: "user_id,date" });

    if (error) {
      throw error;
    }
  }

  async deletePost(id: string): Promise<void> {
    const { error } = await supabase
      .from("market_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createMarketRepository(userId?: string | null): MarketRepository {
  if (userId) {
    return new SupabaseMarketRepository(userId);
  }

  return new LocalMarketRepository();
}
