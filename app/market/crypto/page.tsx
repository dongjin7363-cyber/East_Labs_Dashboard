import { MarketSnapshotViewer } from "@/components/market/MarketSnapshotViewer";

export default function MarketCryptoPage() {
  return (
    <MarketSnapshotViewer
      title="Crypto"
      marketRegion="crypto"
      pageSlug="daily-market"
    />
  );
}
