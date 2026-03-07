import { MarketRegion, MarketSnapshot } from "@/lib/models/types";
import { deserializeMarketSnapshot } from "@/lib/repository/mappers/marketSnapshotMapper";
import { supabase } from "@/lib/supabaseClient";

export interface MarketSnapshotListParams {
  marketRegion: MarketRegion | string;
  pageSlug: string;
  runDate: string;
}

export interface MarketSnapshotRepository {
  listByRunDate(params: MarketSnapshotListParams): Promise<MarketSnapshot[]>;
}

function sortSnapshots(items: MarketSnapshot[]): MarketSnapshot[] {
  return [...items].sort((a, b) => {
    const bySortOrder = a.sortOrder - b.sortOrder;

    if (bySortOrder !== 0) {
      return bySortOrder;
    }

    return a.snapshotKey.localeCompare(b.snapshotKey);
  });
}

export class SupabaseMarketSnapshotRepository
  implements MarketSnapshotRepository
{
  async listByRunDate(
    params: MarketSnapshotListParams,
  ): Promise<MarketSnapshot[]> {
    const { data, error } = await supabase
      .from("market_snapshots")
      .select("*")
      .eq("market_region", params.marketRegion)
      .eq("page_slug", params.pageSlug)
      .eq("run_date", params.runDate)
      .order("sort_order", { ascending: true })
      .order("snapshot_key", { ascending: true });

    if (error) {
      throw error;
    }

    return sortSnapshots(
      (data ?? [])
        .map((row, index) => deserializeMarketSnapshot(row, index))
        .filter((item): item is MarketSnapshot => Boolean(item)),
    );
  }
}

export function createMarketSnapshotRepository(): MarketSnapshotRepository {
  return new SupabaseMarketSnapshotRepository();
}
