export const ASSET_TREND_INDEX_HISTORY_CONFIG = {
  kospi: {
    label: "KOSPI",
    providers: [
      { type: "yahoo", symbol: "^KS11" },
      { type: "stooq", symbol: "^kospi" },
    ],
  },
  kosdaq: {
    label: "KOSDAQ",
    providers: [
      { type: "yahoo", symbol: "^KQ11" },
      { type: "stooq", symbol: "^kosdaq" },
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
