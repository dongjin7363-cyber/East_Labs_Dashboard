export const ASSET_TREND_INDEX_HISTORY_CONFIG = {
  kospi: {
    label: "KOSPI",
    providers: [
      { type: "naver_api", symbol: "KOSPI" },
      { type: "yahoo", symbol: "^KS11" },
    ],
  },
  kosdaq: {
    label: "KOSDAQ",
    providers: [
      { type: "naver_api", symbol: "KOSDAQ" },
      { type: "yahoo", symbol: "^KQ11" },
    ],
  },
  sp500: {
    label: "S&P",
    providers: [
      { type: "fred", symbol: "SP500" },
      { type: "yahoo", symbol: "^GSPC" },
      { type: "stooq", symbol: "^spx" },
    ],
  },
} as const;

export type AssetTrendIndexHistorySeriesKey =
  keyof typeof ASSET_TREND_INDEX_HISTORY_CONFIG;

export type AssetTrendIndexHistoryProvider =
  (typeof ASSET_TREND_INDEX_HISTORY_CONFIG)[AssetTrendIndexHistorySeriesKey]["providers"][number];
