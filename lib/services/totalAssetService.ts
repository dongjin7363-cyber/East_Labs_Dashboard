import { PortfolioHolding, TotalAssetSnapshot } from "@/lib/models/types";
import { calculatePortfolioTotalAsset } from "@/lib/services/portfolioService";
import { createId } from "@/lib/utils/id";
import { getDatesInMonthFromYm } from "@/lib/utils/date";

export const TOTAL_ASSET_SNAPSHOTS_STORAGE_KEY = "pf_total_asset_snapshots_v1";
const TOTAL_ASSET_SCHEMA_VERSION = 1;

export const PORTFOLIO_FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
export const PORTFOLIO_DEPOSIT_STORAGE_KEY = "pf_deposit_krw_v1";
export const PORTFOLIO_CASH_STORAGE_KEY = "pf_cash_krw_v1";
export const DEFAULT_USDKRW_FX_RATE = 1350;

interface TotalAssetStorageSchema {
  schemaVersion: number;
  snapshots: TotalAssetSnapshot[];
  updatedAt: string;
}

export interface TotalAssetSnapshotInput {
  date: string;
  totalAssetKrwInt: number;
  fxRate: number;
  notes?: string;
}

export interface TotalAssetTrendPoint {
  date: string;
  totalAssetKrwInt: number | null;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return fallback;
}

function normalizeDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return new Date().toISOString().slice(0, 10);
}

function normalizeSnapshot(raw: unknown, index: number): TotalAssetSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeDate(input.date);

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `total-asset-${index}-${date}`,
    date,
    totalAssetKrwInt: toNonNegativeInt(input.totalAssetKrwInt, 0),
    fxRate: (() => {
      const rate = Number(input.fxRate);

      if (!Number.isFinite(rate) || rate <= 0) {
        return DEFAULT_USDKRW_FX_RATE;
      }

      return rate;
    })(),
    notes: typeof input.notes === "string" && input.notes.trim() !== "" ? input.notes.trim() : undefined,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim() !== ""
        ? input.createdAt
        : `${date}T00:${`${index}`.padStart(2, "0")}:00.000Z`,
  };
}

function sortSnapshotsByDate(snapshots: TotalAssetSnapshot[]): TotalAssetSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function createEmptySchema(): TotalAssetStorageSchema {
  return {
    schemaVersion: TOTAL_ASSET_SCHEMA_VERSION,
    snapshots: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeSchema(raw: unknown): TotalAssetStorageSchema {
  if (!raw || typeof raw !== "object") {
    return createEmptySchema();
  }

  const input = raw as Partial<TotalAssetStorageSchema>;

  if (input.schemaVersion !== TOTAL_ASSET_SCHEMA_VERSION) {
    return createEmptySchema();
  }

  const snapshots = Array.isArray(input.snapshots)
    ? input.snapshots
        .map((snapshot, index) => normalizeSnapshot(snapshot, index))
        .filter((snapshot): snapshot is TotalAssetSnapshot => Boolean(snapshot))
    : [];

  return {
    schemaVersion: TOTAL_ASSET_SCHEMA_VERSION,
    snapshots: sortSnapshotsByDate(snapshots),
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim() !== ""
        ? input.updatedAt
        : new Date().toISOString(),
  };
}

function readSchema(): TotalAssetStorageSchema {
  if (!isClient()) {
    return createEmptySchema();
  }

  try {
    const raw = window.localStorage.getItem(TOTAL_ASSET_SNAPSHOTS_STORAGE_KEY);

    if (!raw) {
      return createEmptySchema();
    }

    return normalizeSchema(JSON.parse(raw));
  } catch {
    return createEmptySchema();
  }
}

function writeSchema(schema: TotalAssetStorageSchema): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    TOTAL_ASSET_SNAPSHOTS_STORAGE_KEY,
    JSON.stringify({
      ...schema,
      schemaVersion: TOTAL_ASSET_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function listTotalAssetSnapshots(): TotalAssetSnapshot[] {
  return readSchema().snapshots;
}

export function getTotalAssetSnapshotByDate(date: string): TotalAssetSnapshot | undefined {
  return listTotalAssetSnapshots().find((snapshot) => snapshot.date === date);
}

export function upsertTotalAssetSnapshot(input: TotalAssetSnapshotInput): TotalAssetSnapshot[] {
  const existing = listTotalAssetSnapshots();
  const normalizedNotes = input.notes?.trim() ? input.notes.trim() : undefined;
  const parsedRate = Number(input.fxRate);
  const normalizedRate = Number.isFinite(parsedRate) && parsedRate > 0
    ? parsedRate
    : DEFAULT_USDKRW_FX_RATE;
  const normalizedAmount = Math.max(Math.round(input.totalAssetKrwInt), 0);

  const target = existing.find((snapshot) => snapshot.date === input.date);

  const next = target
    ? existing.map((snapshot) => {
        if (snapshot.date !== input.date) {
          return snapshot;
        }

        return {
          ...snapshot,
          totalAssetKrwInt: normalizedAmount,
          fxRate: normalizedRate,
          notes: normalizedNotes,
        };
      })
    : [
        ...existing,
        {
          id: createId(),
          date: input.date,
          totalAssetKrwInt: normalizedAmount,
          fxRate: normalizedRate,
          notes: normalizedNotes,
          createdAt: new Date().toISOString(),
        },
      ];

  const sorted = sortSnapshotsByDate(next);
  writeSchema({ ...readSchema(), snapshots: sorted });

  return sorted;
}

export function updateTotalAssetSnapshotNotes(
  date: string,
  notes: string,
): TotalAssetSnapshot[] {
  const existing = listTotalAssetSnapshots();
  const normalized = notes.trim();

  const next = existing.map((snapshot) => {
    if (snapshot.date !== date) {
      return snapshot;
    }

    return {
      ...snapshot,
      notes: normalized ? normalized : undefined,
    };
  });

  const sorted = sortSnapshotsByDate(next);
  writeSchema({ ...readSchema(), snapshots: sorted });

  return sorted;
}

export function deleteTotalAssetSnapshotByDate(date: string): TotalAssetSnapshot[] {
  const next = listTotalAssetSnapshots().filter((snapshot) => snapshot.date !== date);
  const sorted = sortSnapshotsByDate(next);
  writeSchema({ ...readSchema(), snapshots: sorted });

  return sorted;
}

export function buildTotalAssetTrendByMonth(
  snapshots: TotalAssetSnapshot[],
  ym: string,
): TotalAssetTrendPoint[] {
  const dates = getDatesInMonthFromYm(ym);
  const byDate = new Map(snapshots.map((snapshot) => [snapshot.date, snapshot]));

  return dates.map((date) => {
    const snapshot = byDate.get(date);

    return {
      date,
      totalAssetKrwInt: snapshot ? snapshot.totalAssetKrwInt : null,
    };
  });
}

export function calculateTotalAssetKrwFromPortfolio(options: {
  holdings: PortfolioHolding[];
  fxRate: number;
  depositKrw: number;
  cashKrw: number;
}): number {
  return calculatePortfolioTotalAsset({
    holdings: options.holdings,
    fxRate: options.fxRate,
    depositKrw: options.depositKrw,
    cashKrw: options.cashKrw,
  }).totalAssetKrw;
}

export function readPortfolioCashSettings(): {
  depositKrw: number;
  cashKrw: number;
} {
  if (!isClient()) {
    return {
      depositKrw: 0,
      cashKrw: 0,
    };
  }

  const rawDeposit = window.localStorage.getItem(PORTFOLIO_DEPOSIT_STORAGE_KEY) ?? "0";
  const rawCash = window.localStorage.getItem(PORTFOLIO_CASH_STORAGE_KEY) ?? "0";
  const hasRawDeposit = window.localStorage.getItem(PORTFOLIO_DEPOSIT_STORAGE_KEY) !== null;
  const hasRawCash = window.localStorage.getItem(PORTFOLIO_CASH_STORAGE_KEY) !== null;

  if (!hasRawDeposit && hasRawCash && /^\d+$/.test(rawCash)) {
    const legacyDeposit = Number.parseInt(rawCash, 10);
    window.localStorage.setItem(PORTFOLIO_DEPOSIT_STORAGE_KEY, `${legacyDeposit}`);
    window.localStorage.setItem(PORTFOLIO_CASH_STORAGE_KEY, "0");

    return {
      depositKrw: legacyDeposit,
      cashKrw: 0,
    };
  }

  return {
    depositKrw: toNonNegativeInt(rawDeposit, 0),
    cashKrw: toNonNegativeInt(rawCash, 0),
  };
}

export function readStoredFxRate(): number {
  if (!isClient()) {
    return DEFAULT_USDKRW_FX_RATE;
  }

  const raw = window.localStorage.getItem(PORTFOLIO_FX_STORAGE_KEY);

  if (!raw) {
    return DEFAULT_USDKRW_FX_RATE;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_USDKRW_FX_RATE;
  }

  return parsed;
}
