import { ExpenseEntry } from "@/lib/models/types";
import { listExpenseEntries, replaceExpenseEntries } from "@/lib/services/expenseService";
import { supabase } from "@/lib/supabaseClient";

interface UpsertEntryOptions {
  isCreate?: boolean;
}

export interface ExpenseRepository {
  getEntries(): Promise<ExpenseEntry[]>;
  upsertEntry(entry: ExpenseEntry, options?: UpsertEntryOptions): Promise<void>;
  deleteEntry(id: string): Promise<void>;
}

export const EXPENSE_ENTRIES_SYNCED_FLAG_KEY = "pf_synced_expense_entries_v1";

interface ExpenseEntryRow {
  id?: string;
  user_id: string;
  date: string;
  bucket: string;
  subcategory: string | null;
  amount_int: number;
  note: string;
  created_at: string;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/,/g, "").trim(), 10);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return 0;
}

function normalizeEntry(raw: unknown, index: number): ExpenseEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeOptionalText(input.date) ?? "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const bucket = normalizeOptionalText(input.bucket);
  if (
    bucket !== "INCOME" &&
    bucket !== "SUBSCRIPTION" &&
    bucket !== "PLUS" &&
    bucket !== "SPENDING"
  ) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `expense-entry-${index}`,
    date,
    bucket,
    subcategory: normalizeOptionalText(input.subcategory) as ExpenseEntry["subcategory"],
    amountInt: toNonNegativeInt(input.amount_int ?? input.amountInt),
    note: normalizeOptionalText(input.note) ?? "",
    createdAt:
      normalizeOptionalText(input.created_at) ??
      normalizeOptionalText(input.createdAt) ??
      new Date().toISOString(),
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

function toRow(entry: ExpenseEntry, userId: string, options?: UpsertEntryOptions): ExpenseEntryRow {
  const row: ExpenseEntryRow = {
    user_id: userId,
    date: entry.date,
    bucket: entry.bucket,
    subcategory: normalizeOptionalText(entry.subcategory) ?? null,
    amount_int: toNonNegativeInt(entry.amountInt),
    note: normalizeOptionalText(entry.note) ?? "",
    created_at: entry.createdAt,
  };

  if (!options?.isCreate && entry.id.trim()) {
    row.id = entry.id.trim();
  }

  return row;
}

export class LocalExpenseRepository implements ExpenseRepository {
  async getEntries(): Promise<ExpenseEntry[]> {
    return sortEntries(listExpenseEntries());
  }

  async upsertEntry(entry: ExpenseEntry): Promise<void> {
    const current = listExpenseEntries();
    const next = [...current.filter((item) => item.id !== entry.id), entry];
    replaceExpenseEntries(sortEntries(next));
  }

  async deleteEntry(id: string): Promise<void> {
    const current = listExpenseEntries();
    replaceExpenseEntries(sortEntries(current.filter((item) => item.id !== id)));
  }
}

export class SupabaseExpenseRepository implements ExpenseRepository {
  constructor(private readonly userId: string) {}

  async getEntries(): Promise<ExpenseEntry[]> {
    const { data, error } = await supabase
      .from("expense_entries")
      .select("id,date,bucket,subcategory,amount_int,note,created_at")
      .eq("user_id", this.userId);

    if (error) {
      console.error("[expenses] failed to load entries", error);
      return [];
    }

    return sortEntries(
      (data ?? [])
        .map((row, index) => normalizeEntry(row, index))
        .filter((entry): entry is ExpenseEntry => Boolean(entry)),
    );
  }

  async upsertEntry(entry: ExpenseEntry, options?: UpsertEntryOptions): Promise<void> {
    const row = toRow(entry, this.userId, options);
    const { error } = await supabase
      .from("expense_entries")
      .upsert([row], { onConflict: "id" });

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

