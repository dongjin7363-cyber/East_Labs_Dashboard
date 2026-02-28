import { TotalAssetSnapshot } from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";
import {
  DEFAULT_USDKRW_FX_RATE,
  listTotalAssetSnapshots,
  replaceTotalAssetSnapshots,
} from "@/lib/services/totalAssetService";

interface UpsertTotalAssetOptions {
  isCreate?: boolean;
}

export interface TotalAssetRepository {
  getSnapshots(): Promise<TotalAssetSnapshot[]>;
  upsertSnapshot(
    snapshot: TotalAssetSnapshot,
    options?: UpsertTotalAssetOptions,
  ): Promise<void>;
  deleteSnapshotByDate(date: string): Promise<void>;
}

export const TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY =
  "pf_synced_total_asset_snapshots_v1";

type RawRecord = Record<string, unknown>;

interface TotalAssetSnapshotRow {
  id?: string;
  user_id: string;
  date: string;
  total_asset_krw_int: number;
  fx_rate: number;
  notes: string | null;
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

function normalizeFxRate(value: unknown): number {
  const parsed = toFiniteNumber(value);

  if (parsed === null || parsed <= 0) {
    return DEFAULT_USDKRW_FX_RATE;
  }

  return parsed;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeSnapshotFromUnknown(
  raw: unknown,
  index: number,
): TotalAssetSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const date = toYmd(input.date);

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `total-asset-${index}-${date}`,
    date,
    totalAssetKrwInt: Math.max(
      toInt(input.totalAssetKrwInt ?? input.total_asset_krw_int, 0),
      0,
    ),
    fxRate: normalizeFxRate(input.fxRate ?? input.fx_rate),
    notes:
      typeof input.notes === "string" && input.notes.trim() !== ""
        ? input.notes.trim()
        : undefined,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim() !== ""
        ? input.createdAt
        : typeof input.created_at === "string" && input.created_at.trim() !== ""
          ? input.created_at
          : new Date().toISOString(),
  };
}

function sortSnapshotsByDate(
  snapshots: TotalAssetSnapshot[],
): TotalAssetSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function normalizeSnapshotForDb(
  snapshot: TotalAssetSnapshot,
  userId: string,
  options?: UpsertTotalAssetOptions,
): TotalAssetSnapshotRow {
  const row: TotalAssetSnapshotRow = {
    user_id: userId,
    date: toYmd(snapshot.date),
    total_asset_krw_int: Math.max(toInt(snapshot.totalAssetKrwInt, 0), 0),
    fx_rate: normalizeFxRate(snapshot.fxRate),
    notes: snapshot.notes?.trim() ? snapshot.notes.trim() : null,
    created_at: snapshot.createdAt || new Date().toISOString(),
  };

  if (!options?.isCreate && snapshot.id.trim() && isValidUuid(snapshot.id.trim())) {
    row.id = snapshot.id.trim();
  }

  return row;
}

export class LocalTotalAssetRepository implements TotalAssetRepository {
  async getSnapshots(): Promise<TotalAssetSnapshot[]> {
    return sortSnapshotsByDate(listTotalAssetSnapshots());
  }

  async upsertSnapshot(snapshot: TotalAssetSnapshot): Promise<void> {
    const normalized = normalizeSnapshotFromUnknown(snapshot, 0);

    if (!normalized) {
      return;
    }

    const current = listTotalAssetSnapshots();
    const next = sortSnapshotsByDate([
      ...current.filter((item) => item.date !== normalized.date),
      normalized,
    ]);

    replaceTotalAssetSnapshots(next);
  }

  async deleteSnapshotByDate(date: string): Promise<void> {
    const next = listTotalAssetSnapshots().filter((item) => item.date !== date);
    replaceTotalAssetSnapshots(next);
  }
}

export class SupabaseTotalAssetRepository implements TotalAssetRepository {
  constructor(private readonly userId: string) {}

  async getSnapshots(): Promise<TotalAssetSnapshot[]> {
    const { data, error } = await supabase
      .from("total_asset_snapshots")
      .select("id,user_id,date,total_asset_krw_int,fx_rate,notes,created_at")
      .eq("user_id", this.userId)
      .order("date", { ascending: true });

    if (error) {
      throw error;
    }

    const parsed = (data ?? [])
      .map((row, index) => normalizeSnapshotFromUnknown(row, index))
      .filter((snapshot): snapshot is TotalAssetSnapshot => Boolean(snapshot));

    return sortSnapshotsByDate(parsed);
  }

  async upsertSnapshot(
    snapshot: TotalAssetSnapshot,
    options?: UpsertTotalAssetOptions,
  ): Promise<void> {
    const payload = normalizeSnapshotForDb(snapshot, this.userId, options);
    const { error } = await supabase
      .from("total_asset_snapshots")
      .upsert([payload], { onConflict: "user_id,date" });

    if (error) {
      throw error;
    }
  }

  async deleteSnapshotByDate(date: string): Promise<void> {
    const { error } = await supabase
      .from("total_asset_snapshots")
      .delete()
      .eq("user_id", this.userId)
      .eq("date", toYmd(date));

    if (error) {
      throw error;
    }
  }
}

export function createTotalAssetRepository(
  userId?: string | null,
): TotalAssetRepository {
  if (userId) {
    return new SupabaseTotalAssetRepository(userId);
  }

  return new LocalTotalAssetRepository();
}
