import { MarketSnapshotViewer } from "@/components/market/MarketSnapshotViewer";
import { MARKET_SNAPSHOT_PAGES } from "@/lib/market/marketPages";

export default function MarketKrSectorTrendPage() {
  return <MarketSnapshotViewer {...MARKET_SNAPSHOT_PAGES.krSectorEtfTrend} />;
}
