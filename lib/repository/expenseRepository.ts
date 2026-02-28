import {
  EXPENSE_SUBCATEGORIES,
  ExpenseBucket,
  ExpenseEntry,
  ExpenseSubcategory,
} from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";
import {
  replaceExpenseEntries,
  listExpenseEntries,
  defaultSubcategoryForBucket,
  bucketUsesSubcategory,
} from "@/lib/services/expenseService";

interface UpsertExpenseOptions {
  isCreate?: boolean;
}

export interface ExpenseRepository {
  getEntries(): Promise<ExpenseEntry[]>;
  upsertEntry(entry: ExpenseEntry, options?: UpsertExpenseOptions): Promise<void>;
  deleteEntry(id: string): Promise<void>;
}

export const EXPENSE_ENTRIES_SYNCED_FLAG_KEY = "pf_synced_expense_entries_v1";

type RawRecord = Record<string, unknown>;

interface ExpenseEntryRow {
  id?: string;
  user_id: string;
  date: string;
  bucket: ExpenseBucket;
  subcategory: ExpenseSubcategory | null;
  amount_int: number;
  note: string;
  created_at: string;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/,/g, "").trim();

    if (!sanitized) {
      return null;
    }

    const parsed = Number(sanitized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = toFiniteNumber(value);

  if (parsed === null) {
    return fallback;
  }

  return Math.round(parsed);
}

function toYmd(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    const ymdMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);

    if (ymdMatch) {
      return ymdMatch[1];
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizeBucket(value: unknown): ExpenseBucket | null {
  if (value === "LUXURY") {
    return "PLUS";
  }

  if (
    value === "INCOME" ||
    value === "SUBSCRIPTION" ||
    value === "PLUS" ||
    value === "SPENDING"
  ) {
    return value;
  }

  return null;
}

function normalizeSubcategory(value: unknown): ExpenseSubcategory | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  return EXPENSE_SUBCATEGORIES.find((subcategory) => subcategory === value);
}

function bucketFromSubcategory(subcategory: ExpenseSubcategory): ExpenseBucket {
  if (
    subcategory === "Subscription" ||
    subcategory === "Rent" ||
    subcategory === "Debt"
  ) {
    return "SUBSCRIPTION";
  }

  if (subcategory === "Travel" || subcategory === "Luxury") {
    return "PLUS";
  }

  return "SPENDING";
}

function resolveBucketAndSubcategory(
  bucketValue: unknown,
  subcategoryValue: unknown,
): {
  bucket: ExpenseBucket | null;
  subcategory?: ExpenseSubcategory;
} {
  const bucket = normalizeBucket(bucketValue);
  const subcategory = normalizeSubcategory(subcategoryValue);

  if (subcategory) {
    return {
      bucket: bucketFromSubcategory(subcategory),
      subcategory,
    };
  }

  if (!bucket) {
    return { bucket: null };
  }

  if (!bucketUsesSubcategory(bucket)) {
    return {
      bucket,
      subcategory: undefined,
    };
  }

  return {
    bucket,
    subcategory: defaultSubcategoryForBucket(bucket),
  };
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeEntryFromUnknown(raw: unknown, index: number): ExpenseEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const normalized = resolveBucketAndSubcategory(
    input.bucket,
    input.subcategory,
  );

  if (!normalized.bucket) {
    return null;
  }

  const date = toYmd(input.date);
  const amountInt = Math.max(
    toInt(input.amountInt ?? input.amount_int ?? input.amount, 0),
    0,
  );

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `expense-entry-${index}-${date}`,
    date,
    bucket: normalized.bucket,
    subcategory: normalized.subcategory,
    amountInt,
    note: typeof input.note === "string" ? input.note.trim() : "",
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim() !== ""
        ? input.createdAt
        : typeof input.created_at === "string" && input.created_at.trim() !== ""
          ? input.created_at
          : new Date().toISOString(),
  };
}

function sortEntries(entries: ExpenseEntry[]): ExpenseEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function normalizeEntryForDb(
  entry: ExpenseEntry,
  userId: string,
  options?: UpsertExpenseOptions,
): ExpenseEntryRow {
  const normalized = resolveBucketAndSubcategory(entry.bucket, entry.subcategory);
  const bucket = normalized.bucket ?? entry.bucket;
  const row: ExpenseEntryRow = {
    user_id: userId,
    date: toYmd(entry.date),
    bucket,
    subcategory: normalized.subcategory ?? null,
    amount_int: Math.max(toInt(entry.amountInt, 0), 0),
    note: entry.note.trim(),
    created_at: entry.createdAt || new Date().toISOString(),
  };

  if (!options?.isCreate && entry.id.trim() && isValidUuid(entry.id.trim())) {
    row.id = entry.id.trim();
  }

  return row;
}

export class LocalExpenseRepository implements ExpenseRepository {
  async getEntries(): Promise<ExpenseEntry[]> {
    return sortEntries(listExpenseEntries());
  }

  async upsertEntry(entry: ExpenseEntry): Promise<void> {
    const normalized = normalizeEntryFromUnknown(entry, 0);

    if (!normalized) {
      return;
    }

    const current = listExpenseEntries();
    const next = sortEntries([
      ...current.filter((item) => item.id !== normalized.id),
      normalized,
    ]);

    replaceExpenseEntries(next);
  }

  async deleteEntry(id: string): Promise<void> {
    const next = listExpenseEntries().filter((item) => item.id !== id);
    replaceExpenseEntries(next);
  }
}

export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private readonly userId: string) {}

  async getEntries(): Promise<ExpenseEntry[]> {
    const { data, error } = await supabase
      .from("expense_entries")
      .select("id,user_id,date,bucket,subcategory,amount_int,note,created_at")
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }

    const parsed = (data ?? [])
      .map((row, index) => normalizeEntryFromUnknown(row, index))
      .filter((entry): entry is ExpenseEntry => Boolean(entry));

    return sortEntries(parsed);
  }

  async upsertEntry(
    entry: ExpenseEntry,
    options?: UpsertExpenseOptions,
  ): Promise<void> {
    const payload = normalizeEntryForDb(entry, this.userId, options);
    const { error } = await supabase
      .from("expense_entries")
      .upsert([payload], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteEntry(id: string): Promise<void> {
    const { error } = await supabase
      .from("expense_entries")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createExpenseRepository(userId?: string | null): ExpenseRepository {
  if (userId) {
    return new SupabaseExpenseRepository(userId);
  }

  return new LocalExpenseRepository();
}
