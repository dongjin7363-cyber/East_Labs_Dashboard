import { MarketRegion } from "@/lib/models/types";

export interface MarketSnapshotPageConfig {
  title: string;
  marketRegion: MarketRegion;
  pageSlug: string;
}

export interface MarketPlaceholderCard {
  id: string;
  title: string;
  body: string;
  meta: string;
}

export const MARKET_SNAPSHOT_PAGES = {
  cryptoDaily: {
    title: "Crypto",
    marketRegion: "crypto",
    pageSlug: "daily-market",
  },
  krDaily: {
    title: "KR Daily Market",
    marketRegion: "kr",
    pageSlug: "daily-market",
  },
  krSectorEtfTrend: {
    title: "KR Sector ETF Trend",
    marketRegion: "kr",
    pageSlug: "sector-etf-trend",
  },
  krSectorEtfMomentum: {
    title: "KR Sector ETF Momentum",
    marketRegion: "kr",
    pageSlug: "sector-etf-momentum",
  },
  usDaily: {
    title: "US Daily Market",
    marketRegion: "us",
    pageSlug: "daily-market",
  },
  usSectorEtfTrend: {
    title: "US Sector ETF Trend",
    marketRegion: "us",
    pageSlug: "sector-etf-trend",
  },
  usSectorEtfMomentum: {
    title: "US Sector ETF Momentum",
    marketRegion: "us",
    pageSlug: "sector-etf-momentum",
  },
} satisfies Record<string, MarketSnapshotPageConfig>;

export const MARKET_NEWS_PLACEHOLDER_CARDS: MarketPlaceholderCard[] = [
  {
    id: "news-1",
    title: "오늘의 요약",
    body: "시장 주요 이슈와 섹터 흐름을 여기에 기록합니다.",
    meta: "Daily Brief",
  },
  {
    id: "news-2",
    title: "Macro",
    body: "금리/달러/유가 등 매크로 포인트를 정리합니다.",
    meta: "Template",
  },
  {
    id: "news-3",
    title: "Indices",
    body: "주요 지수와 상대강도 체크 결과를 정리합니다.",
    meta: "Template",
  },
];
