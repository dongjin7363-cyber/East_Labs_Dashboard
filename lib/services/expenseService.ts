import {
  EXPENSE_SUBCATEGORIES,
  ExpenseBucket,
  ExpenseEntry,
  ExpenseSubcategory,
} from "@/lib/models/types";
import { createId } from "@/lib/utils/id";

const EXPENSE_ENTRIES_STORAGE_KEY = "pf_expense_entries_v1";
const EXPENSE_ENTRIES_SCHEMA_VERSION = 1;

interface ExpenseStorageSchema {
  schemaVersion: number;
  entries: ExpenseEntry[];
  updatedAt: string;
}

export interface ExpenseEntryInput {
  date: string;
  bucket: ExpenseBucket;
  subcategory?: ExpenseSubcategory;
  amountInt: number;
  note: string;
}

export interface ExpenseBucketTotals {
  INCOME: number;
  SUBSCRIPTION: number;
  PLUS: number;
  SPENDING: number;
}

export type ExpenseSubcategoryTotals = Record<ExpenseSubcategory, number>;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function emptySchema(): ExpenseStorageSchema {
  return {
    schemaVersion: EXPENSE_ENTRIES_SCHEMA_VERSION,
    entries: [],
    updatedAt: new Date().toISOString(),
  };
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

function normalizeSubcategoryValue(value: unknown): ExpenseSubcategory | undefined {
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

export function bucketUsesSubcategory(bucket: ExpenseBucket): boolean {
  return bucket !== "INCOME";
}

export function subcategoryOptionsForBucket(
  bucket: ExpenseBucket,
): ExpenseSubcategory[] {
  if (bucket === "SUBSCRIPTION") {
    return ["Subscription", "Rent", "Debt"];
  }

  if (bucket === "PLUS") {
    return ["Travel", "Luxury"];
  }

  if (bucket === "SPENDING") {
    return ["Spending"];
  }

  return [];
}

export function defaultSubcategoryForBucket(
  bucket: ExpenseBucket,
): ExpenseSubcategory | undefined {
  const options = subcategoryOptionsForBucket(bucket);

  return options[0];
}

function resolveBucketAndSubcategory(
  bucket: ExpenseBucket | null,
  subcategoryValue: unknown,
): {
  bucket: ExpenseBucket | null;
  subcategory?: ExpenseSubcategory;
} {
  const normalizedSubcategory = normalizeSubcategoryValue(subcategoryValue);

  if (normalizedSubcategory) {
    return {
      bucket: bucketFromSubcategory(normalizedSubcategory),
      subcategory: normalizedSubcategory,
    };
  }

  if (!bucket) {
    return { bucket: null };
  }

  if (!bucketUsesSubcategory(bucket)) {
    return { bucket, subcategory: undefined };
  }

  return {
    bucket,
    subcategory: defaultSubcategoryForBucket(bucket),
  };
}

function normalizeEntry(raw: unknown, index: number): ExpenseEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const normalized = resolveBucketAndSubcategory(
    normalizeBucket(input.bucket),
    input.subcategory,
  );

  if (!normalized.bucket) {
    return null;
  }

  const date = typeof input.date === "string" ? input.date : "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  const amountRaw =
    typeof input.amountInt === "number"
      ? input.amountInt
      : typeof input.amountInt === "string" && /^\d+$/.test(input.amountInt.trim())
        ? Number.parseInt(input.amountInt, 10)
        : NaN;

  if (!Number.isFinite(amountRaw) || amountRaw < 0) {
    return null;
  }

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `expense-entry-${index}`,
    date,
    bucket: normalized.bucket,
    subcategory: normalized.subcategory,
    amountInt: Math.round(amountRaw),
    note: typeof input.note === "string" ? input.note.trim() : "",
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim() !== ""
        ? input.createdAt
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

function normalizeSchema(raw: unknown): ExpenseStorageSchema {
  if (!raw || typeof raw !== "object") {
    return emptySchema();
  }

  const input = raw as Partial<ExpenseStorageSchema>;

  if (input.schemaVersion !== EXPENSE_ENTRIES_SCHEMA_VERSION) {
    return emptySchema();
  }

  const entries = Array.isArray(input.entries)
    ? input.entries
        .map((entry, index) => normalizeEntry(entry, index))
        .filter((entry): entry is ExpenseEntry => Boolean(entry))
    : [];

  return {
    schemaVersion: EXPENSE_ENTRIES_SCHEMA_VERSION,
    entries: sortEntries(entries),
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim() !== ""
        ? input.updatedAt
        : new Date().toISOString(),
  };
}

function readSchema(): ExpenseStorageSchema {
  if (!isClient()) {
    return emptySchema();
  }

  try {
    const raw = window.localStorage.getItem(EXPENSE_ENTRIES_STORAGE_KEY);

    if (!raw) {
      return emptySchema();
    }

    return normalizeSchema(JSON.parse(raw));
  } catch {
    return emptySchema();
  }
}

function writeSchema(schema: ExpenseStorageSchema): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    EXPENSE_ENTRIES_STORAGE_KEY,
    JSON.stringify({
      ...schema,
      schemaVersion: EXPENSE_ENTRIES_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function listExpenseEntries(): ExpenseEntry[] {
  return readSchema().entries;
}

export function addExpenseEntry(input: ExpenseEntryInput): ExpenseEntry[] {
  const normalized = resolveBucketAndSubcategory(input.bucket, input.subcategory);
  const bucket = normalized.bucket ?? input.bucket;

  const entry: ExpenseEntry = {
    id: createId(),
    date: input.date,
    bucket,
    subcategory: normalized.subcategory,
    amountInt: Math.max(Math.round(input.amountInt), 0),
    note: input.note.trim(),
    createdAt: new Date().toISOString(),
  };

  const updated = sortEntries([...listExpenseEntries(), entry]);
  writeSchema({ ...readSchema(), entries: updated });

  return updated;
}

export function updateExpenseEntry(
  id: string,
  input: ExpenseEntryInput,
): ExpenseEntry[] {
  const updated = sortEntries(
    listExpenseEntries().map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const normalized = resolveBucketAndSubcategory(input.bucket, input.subcategory);
      const bucket = normalized.bucket ?? input.bucket;

      return {
        ...entry,
        date: input.date,
        bucket,
        subcategory: normalized.subcategory,
        amountInt: Math.max(Math.round(input.amountInt), 0),
        note: input.note.trim(),
      };
    }),
  );

  writeSchema({ ...readSchema(), entries: updated });
  return updated;
}

export function deleteExpenseEntry(id: string): ExpenseEntry[] {
  const updated = sortEntries(listExpenseEntries().filter((entry) => entry.id !== id));
  writeSchema({ ...readSchema(), entries: updated });

  return updated;
}

export function listExpenseEntriesByMonth(
  entries: ExpenseEntry[],
  ym: string,
): ExpenseEntry[] {
  const prefix = `${ym}-`;

  return entries.filter((entry) => entry.date.startsWith(prefix));
}

export function listExpenseEntriesByCell(
  entries: ExpenseEntry[],
  date: string,
  bucket: ExpenseBucket,
): ExpenseEntry[] {
  return entries
    .filter((entry) => {
      const normalized = resolveBucketAndSubcategory(entry.bucket, entry.subcategory);

      return entry.date === date && normalized.bucket === bucket;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function buildExpenseCellSumMap(
  entries: ExpenseEntry[],
): Map<string, number> {
  const map = new Map<string, number>();

  entries.forEach((entry) => {
    const normalized = resolveBucketAndSubcategory(entry.bucket, entry.subcategory);

    if (!normalized.bucket) {
      return;
    }

    const key = `${entry.date}|${normalized.bucket}`;
    map.set(key, (map.get(key) ?? 0) + entry.amountInt);
  });

  return map;
}

function emptyBucketTotals(): ExpenseBucketTotals {
  return {
    INCOME: 0,
    SUBSCRIPTION: 0,
    PLUS: 0,
    SPENDING: 0,
  };
}

function emptySubcategoryTotals(): ExpenseSubcategoryTotals {
  return {
    Spending: 0,
    Debt: 0,
    Subscription: 0,
    Rent: 0,
    Travel: 0,
    Luxury: 0,
  };
}

export function summarizeExpenseBuckets(entries: ExpenseEntry[]): ExpenseBucketTotals {
  const totals = emptyBucketTotals();

  entries.forEach((entry) => {
    const normalized = resolveBucketAndSubcategory(entry.bucket, entry.subcategory);

    if (!normalized.bucket) {
      return;
    }

    totals[normalized.bucket] += entry.amountInt;
  });

  return totals;
}

export function summarizeExpenseSubcategories(
  entries: ExpenseEntry[],
): ExpenseSubcategoryTotals {
  const totals = emptySubcategoryTotals();

  entries.forEach((entry) => {
    const normalized = resolveBucketAndSubcategory(entry.bucket, entry.subcategory);

    if (!normalized.bucket || !bucketUsesSubcategory(normalized.bucket)) {
      return;
    }

    const subcategory = normalized.subcategory;

    if (!subcategory) {
      return;
    }

    totals[subcategory] += entry.amountInt;
  });

  return totals;
}

export function computeDailyNetFromBucketTotals(totals: ExpenseBucketTotals): number {
  return totals.INCOME - (totals.SUBSCRIPTION + totals.PLUS + totals.SPENDING);
}

export const expenseEntriesStorageMeta = {
  key: EXPENSE_ENTRIES_STORAGE_KEY,
  schemaVersion: EXPENSE_ENTRIES_SCHEMA_VERSION,
};
