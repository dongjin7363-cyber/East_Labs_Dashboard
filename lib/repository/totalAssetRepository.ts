import { TotalAssetSnapshot } from "@/lib/models/types";
import {
  deserializeTotalAssetSnapshot,
  serializeTotalAssetSnapshotRow,
} from "@/lib/repository/mappers/totalAssetSnapshotMapper";
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

function sortSnapshotsByDate(snapshots: TotalAssetSnapshot[]): TotalAssetSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
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
        .map((row, index) => deserializeTotalAssetSnapshot(row, index))
        .filter((snapshot): snapshot is TotalAssetSnapshot => Boolean(snapshot)),
    );
  }

  async upsertSnapshot(snapshot: TotalAssetSnapshot): Promise<void> {
    const row = serializeTotalAssetSnapshotRow(snapshot, this.userId);
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
