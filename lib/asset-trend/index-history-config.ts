export const ASSET_TREND_INDEX_HISTORY_CONFIG = {
  kospi: {
    label: "KOSPI",
    providers: [
      { type: "stooq", symbol: "^kospi" },
      { type: "yahoo", symbol: "^KS11" },
    ],
  },
  kosdaq: {
    label: "KOSDAQ",
    providers: [
      { type: "stooq", symbol: "^kosdaq" },
      { type: "yahoo", symbol: "^KQ11" },
    ],
  },
  sp500: {
    label: "S&P",
    providers: [
      { type: "yahoo", symbol: "^GSPC" },
      { type: "fred", symbol: "SP500" },
      { type: "stooq", symbol: "^spx" },
    ],
  },
} as const;

export type AssetTrendIndexHistorySeriesKey =
  keyof typeof ASSET_TREND_INDEX_HISTORY_CONFIG;

export type AssetTrendIndexHistoryProvider =
  (typeof ASSET_TREND_INDEX_HISTORY_CONFIG)[AssetTrendIndexHistorySeriesKey]["providers"][number];
