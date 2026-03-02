import { MembershipCategory, MembershipPost, MembershipVisibility } from "@/lib/models/types";
import { getMonthRangeFromYm } from "@/lib/utils/date";

const LEGACY_CATEGORY_MAP: Record<string, MembershipCategory> = {
  시장: "Market",
  종목: "KR",
  코인: "Coin",
  리포트: "Market",
};

export function normalizeMembershipCategory(value: unknown): MembershipCategory {
  if (typeof value === "string") {
    const normalized = value.trim();

    if (normalized === "Market" || normalized === "KR" || normalized === "US" || normalized === "Coin") {
      return normalized;
    }

    if (LEGACY_CATEGORY_MAP[normalized]) {
      return LEGACY_CATEGORY_MAP[normalized];
    }
  }

  return "Market";
}

export function normalizeMembershipVisibility(value: unknown): MembershipVisibility {
  if (typeof value === "string") {
    const normalized = value.trim();

    if (normalized === "Public" || normalized === "Private") {
      return normalized;
    }

    if (normalized.toLowerCase() === "true") {
      return "Public";
    }

    if (normalized.toLowerCase() === "false") {
      return "Private";
    }
  }

  if (typeof value === "boolean") {
    return value ? "Public" : "Private";
  }

  return "Private";
}

export function listMembershipPostsByMonth(
  posts: MembershipPost[],
  month: string,
): MembershipPost[] {
  const range = getMonthRangeFromYm(month);

  return posts.filter((post) => post.date >= range.from && post.date <= range.to);
}

export function listMembershipPostsByDate(
  posts: MembershipPost[],
  date: string,
): MembershipPost[] {
  return posts
    .filter((post) => post.date === date)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildMembershipCountByDate(posts: MembershipPost[]): Record<string, number> {
  return posts.reduce<Record<string, number>>((acc, post) => {
    acc[post.date] = (acc[post.date] ?? 0) + 1;
    return acc;
  }, {});
}

export function isMembershipMatched(post: MembershipPost, keyword: string): boolean {
  const normalized = keyword.trim().toLowerCase();

  if (!normalized) {
    return true;
  }

  return (
    post.title.toLowerCase().includes(normalized) ||
    post.category.toLowerCase().includes(normalized) ||
    post.body.toLowerCase().includes(normalized)
  );
}
