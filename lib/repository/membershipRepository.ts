import {
  MembershipCategory,
  MEMBERSHIP_CATEGORIES,
  MembershipPost,
} from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";

export const MEMBERSHIP_POSTS_STORAGE_KEY = "pf_membership_posts_v1";

interface UpsertMembershipPostOptions {
  isCreate?: boolean;
}

export interface MembershipRepository {
  getPosts(): Promise<MembershipPost[]>;
  upsertPost(
    post: MembershipPost,
    options?: UpsertMembershipPostOptions,
  ): Promise<void>;
  deletePost(id: string): Promise<void>;
}

interface MembershipPostRow {
  id?: string;
  user_id: string;
  title: string;
  category: MembershipCategory;
  body: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

type RawRecord = Record<string, unknown>;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeCategory(value: unknown): MembershipCategory {
  if (typeof value === "string") {
    const matched = MEMBERSHIP_CATEGORIES.find((item) => item === value);

    if (matched) {
      return matched;
    }
  }

  return "시장";
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }

  return false;
}

function normalizePost(raw: unknown, index: number): MembershipPost | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const title =
    typeof input.title === "string" && input.title.trim() !== ""
      ? input.title.trim()
      : "";

  if (!title) {
    return null;
  }

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `membership-${index}-${Date.now()}`,
    title,
    category: normalizeCategory(input.category),
    body: typeof input.body === "string" ? input.body : "",
    isPublic: normalizeBoolean(input.isPublic ?? input.is_public),
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

function sortPosts(posts: MembershipPost[]): MembershipPost[] {
  return [...posts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function readLocalPosts(): MembershipPost[] {
  if (!isClient()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(MEMBERSHIP_POSTS_STORAGE_KEY);

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
        .filter((item): item is MembershipPost => Boolean(item)),
    );
  } catch {
    return [];
  }
}

function writeLocalPosts(posts: MembershipPost[]): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    MEMBERSHIP_POSTS_STORAGE_KEY,
    JSON.stringify(sortPosts(posts)),
  );
}

function normalizePostForDb(
  post: MembershipPost,
  userId: string,
  options?: UpsertMembershipPostOptions,
): MembershipPostRow {
  const row: MembershipPostRow = {
    user_id: userId,
    title: post.title.trim(),
    category: normalizeCategory(post.category),
    body: post.body,
    is_public: post.isPublic,
    created_at: post.createdAt || new Date().toISOString(),
    updated_at: post.updatedAt || new Date().toISOString(),
  };

  if (!options?.isCreate && post.id.trim()) {
    row.id = post.id.trim();
  }

  return row;
}

export class LocalMembershipRepository implements MembershipRepository {
  async getPosts(): Promise<MembershipPost[]> {
    return readLocalPosts();
  }

  async upsertPost(post: MembershipPost): Promise<void> {
    const normalized = normalizePost(post, 0);

    if (!normalized) {
      return;
    }

    const current = readLocalPosts();
    const next = sortPosts([
      ...current.filter((item) => item.id !== normalized.id),
      normalized,
    ]);
    writeLocalPosts(next);
  }

  async deletePost(id: string): Promise<void> {
    const next = readLocalPosts().filter((item) => item.id !== id);
    writeLocalPosts(next);
  }
}

export class SupabaseMembershipRepository implements MembershipRepository {
  constructor(private readonly userId: string) {}

  async getPosts(): Promise<MembershipPost[]> {
    const { data, error } = await supabase
      .from("membership_posts")
      .select("id,user_id,title,category,body,is_public,created_at,updated_at")
      .eq("user_id", this.userId)
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return sortPosts(
      (data ?? [])
        .map((row, index) => normalizePost(row, index))
        .filter((row): row is MembershipPost => Boolean(row)),
    );
  }

  async upsertPost(
    post: MembershipPost,
    options?: UpsertMembershipPostOptions,
  ): Promise<void> {
    const payload = normalizePostForDb(post, this.userId, options);
    const { error } = await supabase
      .from("membership_posts")
      .upsert([payload], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deletePost(id: string): Promise<void> {
    const { error } = await supabase
      .from("membership_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createMembershipRepository(
  userId?: string | null,
): MembershipRepository {
  if (userId) {
    return new SupabaseMembershipRepository(userId);
  }

  return new LocalMembershipRepository();
}
