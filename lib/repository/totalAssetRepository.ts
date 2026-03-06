import { TotalAssetSnapshot } from "@/lib/models/types";
import {
  deleteTotalAssetSnapshotByDate,
  listTotalAssetSnapshots,
  replaceTotalAssetSnapshots,
  upsertTotalAssetSnapshot,
} from "@/lib/services/totalAssetService";
import { supabase } from "@/lib/supabaseClient";

export const TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY =
  "pf_synced_total_asset_snapshots_v1";

export interface TotalAssetRepository {
  getSnapshots(): Promise<TotalAssetSnapshot[]>;
  upsertSnapshot(snapshot: TotalAssetSnapshot): Promise<void>;
  deleteSnapshot(date: string): Promise<void>;
}

interface TotalAssetSnapshotRow {
  user_id: string;
  date: string;
  total_asset_krw_int: number;
  fx_rate: number;
  memo: string | null;
  updated_at: string;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/,/g, "").trim(), 10);

    if (Number.isFinite(parsed)) {
      return Math.max(Math.round(parsed), 0);
    }
  }

  return 0;
}

function toPositiveFloat(value: unknown, fallback = 1350): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());

    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

function normalizeSnapshot(raw: unknown, index: number): TotalAssetSnapshot | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeOptionalText(input.date);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `total-asset-${index}-${date}`,
    date,
    totalAssetKrwInt: toNonNegativeInt(
      input.total_asset_krw_int ?? input.totalAssetKrwInt,
    ),
    fxRate: toPositiveFloat(input.fx_rate ?? input.fxRate),
    memo: normalizeOptionalText(input.memo),
    createdAt:
      normalizeOptionalText(input.created_at) ??
      normalizeOptionalText(input.updated_at) ??
      normalizeOptionalText(input.createdAt) ??
      normalizeOptionalText(input.updatedAt) ??
      new Date().toISOString(),
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

function toRow(
  snapshot: TotalAssetSnapshot,
  userId: string,
): TotalAssetSnapshotRow {
  return {
    user_id: userId,
    date: snapshot.date,
    total_asset_krw_int: toNonNegativeInt(snapshot.totalAssetKrwInt),
    fx_rate: toPositiveFloat(snapshot.fxRate),
    memo: normalizeOptionalText(snapshot.memo) ?? null,
    updated_at: new Date().toISOString(),
  };
}

export class LocalTotalAssetRepository implements TotalAssetRepository {
  async getSnapshots(): Promise<TotalAssetSnapshot[]> {
    return sortSnapshotsByDate(listTotalAssetSnapshots());
  }

  async upsertSnapshot(snapshot: TotalAssetSnapshot): Promise<void> {
    upsertTotalAssetSnapshot({
      date: snapshot.date,
      totalAssetKrwInt: snapshot.totalAssetKrwInt,
      fxRate: snapshot.fxRate,
      memo: snapshot.memo,
    });
  }

  async deleteSnapshot(date: string): Promise<void> {
    deleteTotalAssetSnapshotByDate(date);
  }
}

export class SupabaseTotalAssetRepository implements TotalAssetRepository {
  constructor(private readonly userId: string) {}

  async getSnapshots(): Promise<TotalAssetSnapshot[]> {
    const { data, error } = await supabase
      .from("total_asset_snapshots")
      .select("*")
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }

    return sortSnapshotsByDate(
      (data ?? [])
        .map((row, index) => normalizeSnapshot(row, index))
        .filter((snapshot): snapshot is TotalAssetSnapshot => Boolean(snapshot)),
    );
  }

  async upsertSnapshot(snapshot: TotalAssetSnapshot): Promise<void> {
    const row = toRow(snapshot, this.userId);
    const { error } = await supabase
      .from("total_asset_snapshots")
      .upsert([row], { onConflict: "user_id,date" });

    if (error) {
      throw error;
    }
  }

  async deleteSnapshot(date: string): Promise<void> {
    const { error } = await supabase
      .from("total_asset_snapshots")
      .delete()
      .eq("user_id", this.userId)
      .eq("date", date);

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

export function writeSnapshotsToLocalStorage(
  snapshots: TotalAssetSnapshot[],
): void {
  replaceTotalAssetSnapshots(sortSnapshotsByDate(snapshots));
}
