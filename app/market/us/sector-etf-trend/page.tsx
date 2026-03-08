import { MarketSnapshotViewer } from "@/components/market/MarketSnapshotViewer";

export default function MarketUsSectorTrendPage() {
  return (
    <MarketSnapshotViewer
      title="US Sector ETF Trend"
      marketRegion="us"
      pageSlug="sector-etf-trend"
    />
  );
}
