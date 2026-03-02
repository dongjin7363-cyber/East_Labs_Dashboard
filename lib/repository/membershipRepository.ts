import { MembershipPost } from "@/lib/models/types";
import {
  normalizeMembershipCategory,
  normalizeMembershipVisibility,
} from "@/lib/services/membershipService";
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
  date: string;
  title: string;
  category: string;
  visibility: string;
  body: string;
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

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  return "";
}

function normalizePost(raw: unknown, index: number): MembershipPost | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const title = toText(input.title);

  if (!title) {
    return null;
  }

  const createdAt =
    toText(input.createdAt) ||
    toText(input.created_at) ||
    new Date().toISOString();

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `membership-${index}-${Date.now()}`,
    userId: toText(input.userId) || toText(input.user_id) || undefined,
    date: toYmd(input.date ?? createdAt),
    title,
    category: normalizeMembershipCategory(input.category),
    visibility: normalizeMembershipVisibility(
      input.visibility ?? input.isPublic ?? input.is_public,
    ),
    body: toText(input.body),
    createdAt,
    updatedAt:
      toText(input.updatedAt) ||
      toText(input.updated_at) ||
      new Date().toISOString(),
  };
}

function sortPosts(posts: MembershipPost[]): MembershipPost[] {
  return [...posts].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
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
    date: toYmd(post.date),
    title: post.title.trim(),
    category: normalizeMembershipCategory(post.category),
    visibility: normalizeMembershipVisibility(post.visibility),
    body: post.body,
    created_at: post.createdAt || new Date().toISOString(),
    updated_at: post.updatedAt || new Date().toISOString(),
  };

  if (!options?.isCreate && post.id.trim()) {
    row.id = post.id.trim();
  }

  return row;
}

export class LocalMembershipRepository implements MembershipRepository {
  constructor(private readonly viewerUserId?: string | null) {}

  async getPosts(): Promise<MembershipPost[]> {
    const all = readLocalPosts();

    if (this.viewerUserId) {
      return all;
    }

    return all.filter((post) => post.visibility === "Public");
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
  constructor(private readonly viewerUserId?: string | null) {}

  async getPosts(): Promise<MembershipPost[]> {
    let query = supabase
      .from("membership_posts")
      .select("id,user_id,date,title,category,visibility,body,created_at,updated_at")
      .order("date", { ascending: false })
      .order("updated_at", { ascending: false });

    if (this.viewerUserId) {
      query = query.or(`visibility.eq.Public,user_id.eq.${this.viewerUserId}`);
    } else {
      query = query.eq("visibility", "Public");
    }

    const { data, error } = await query;

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
    if (!this.viewerUserId) {
      throw new Error("로그인 후 저장할 수 있습니다.");
    }

    const payload = normalizePostForDb(post, this.viewerUserId, options);
    const { error } = await supabase
      .from("membership_posts")
      .upsert([payload], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deletePost(id: string): Promise<void> {
    if (!this.viewerUserId) {
      throw new Error("로그인 후 삭제할 수 있습니다.");
    }

    const { error } = await supabase
      .from("membership_posts")
      .delete()
      .eq("id", id)
      .eq("user_id", this.viewerUserId);

    if (error) {
      throw error;
    }
  }
}

export function createMembershipRepository(
  userId?: string | null,
): MembershipRepository {
  return new SupabaseMembershipRepository(userId);
}
