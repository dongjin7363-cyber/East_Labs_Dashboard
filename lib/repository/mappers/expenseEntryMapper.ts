import {
  ExpenseBucket,
  ExpenseEntry,
  EXPENSE_SUBCATEGORIES,
  ExpenseSubcategory,
} from "@/lib/models/types";
import {
  normalizeIsoString,
  normalizeOptionalText,
  normalizeYmd,
  toNonNegativeInt,
} from "@/lib/repository/mappers/common";

export interface ExpenseEntryRow {
  id?: string;
  user_id: string;
  date: string;
  bucket: string;
  subcategory: string | null;
  amount_int: number;
  note: string;
  created_at: string;
}

function normalizeBucket(value: unknown): ExpenseBucket | null {
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

  return EXPENSE_SUBCATEGORIES.find((item) => item === value);
}

export function deserializeExpenseEntry(
  raw: unknown,
  index: number,
): ExpenseEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeYmd(input.date);
  const bucket = normalizeBucket(input.bucket);

  if (!date || !bucket) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `expense-entry-${index}`,
    date,
    bucket,
    subcategory: normalizeSubcategory(input.subcategory),
    amountInt: toNonNegativeInt(input.amountInt ?? input.amount_int),
    note: normalizeOptionalText(input.note) ?? "",
    createdAt: normalizeIsoString(input.createdAt ?? input.created_at),
  };
}

export function serializeExpenseEntryRow(
  entry: ExpenseEntry,
  userId: string,
  options?: { isCreate?: boolean },
): ExpenseEntryRow {
  const row: ExpenseEntryRow = {
    user_id: userId,
    date: entry.date,
    bucket: entry.bucket,
    subcategory: normalizeOptionalText(entry.subcategory) ?? null,
    amount_int: toNonNegativeInt(entry.amountInt),
    note: normalizeOptionalText(entry.note) ?? "",
    created_at: normalizeIsoString(entry.createdAt),
  };

  if (!options?.isCreate && entry.id.trim()) {
    row.id = entry.id.trim();
  }

  return row;
}
