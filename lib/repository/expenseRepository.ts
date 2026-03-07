import { ExpenseEntry } from "@/lib/models/types";
import {
  deserializeExpenseEntry,
  serializeExpenseEntryRow,
} from "@/lib/repository/mappers/expenseEntryMapper";
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

function sortEntries(entries: ExpenseEntry[]): ExpenseEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
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
        .map((row, index) => deserializeExpenseEntry(row, index))
        .filter((entry): entry is ExpenseEntry => Boolean(entry)),
    );
  }

  async upsertEntry(entry: ExpenseEntry, options?: UpsertEntryOptions): Promise<void> {
    const row = serializeExpenseEntryRow(entry, this.userId, options);
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
