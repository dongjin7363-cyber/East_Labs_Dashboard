import { MarketSnapshotViewer } from "@/components/market/MarketSnapshotViewer";
import { MARKET_SNAPSHOT_PAGES } from "@/lib/market/marketPages";

export default function MarketUsSectorMomentumPage() {
  return <MarketSnapshotViewer {...MARKET_SNAPSHOT_PAGES.usSectorEtfMomentum} />;
}
