import { MarketPlaceholderPage } from "@/components/market/MarketPlaceholderPage";
import { MARKET_NEWS_PLACEHOLDER_CARDS } from "@/lib/market/marketPages";

export default function MarketNewsPage() {
  return <MarketPlaceholderPage title="News" cards={MARKET_NEWS_PLACEHOLDER_CARDS} />;
}
