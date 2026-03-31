export const ASSET_TREND_INDEX_HISTORY_CONFIG = {
  kospi: {
    label: "KOSPI",
    providers: [{ type: "naver", symbol: "KOSPI" }],
  },
  kosdaq: {
    label: "KOSDAQ",
    providers: [{ type: "naver", symbol: "KOSDAQ" }],
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
