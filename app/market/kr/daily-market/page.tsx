import { MarketSnapshotViewer } from "@/components/market/MarketSnapshotViewer";
import { MARKET_SNAPSHOT_PAGES } from "@/lib/market/marketPages";

export default function MarketKrDailyPage() {
  return <MarketSnapshotViewer {...MARKET_SNAPSHOT_PAGES.krDaily} />;
}
