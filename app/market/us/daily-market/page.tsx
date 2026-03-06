import { MarketSnapshotViewer } from "@/components/market/MarketSnapshotViewer";

export default function MarketUsDailyPage() {
  return (
    <MarketSnapshotViewer
      title="US Daily Market"
      marketRegion="us"
      pageSlug="daily-market"
    />
  );
}
