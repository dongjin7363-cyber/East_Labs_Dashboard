import { getMonthDays } from "@/lib/date/calendar";
import { TotalAssetSnapshot } from "@/lib/models/types";

export type AssetTrendBenchmarkKey = "portfolio" | "kospi" | "kosdaq" | "sp500";

export interface IndexHistoryPoint {
  date: string;
  close: number;
}

export interface IndexHistorySeriesMap {
  kospi: IndexHistoryPoint[];
  kosdaq: IndexHistoryPoint[];
  sp500: IndexHistoryPoint[];
}

export interface AssetTrendBenchmarkPoint {
  date: string;
  portfolio: number | null;
  kospi: number | null;
  kosdaq: number | null;
  sp500: number | null;
}

export const ASSET_TREND_BENCHMARK_META: Record<
  AssetTrendBenchmarkKey,
  { label: string; color: string }
> = {
  portfolio: { label: "Portfolio", color: "#111827" },
  kospi: { label: "KOSPI", color: "#d35b5b" },
  kosdaq: { label: "KOSDAQ", color: "#4b7fd9" },
  sp500: { label: "S&P", color: "#36a66b" },
};

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function findLatestValueBeforeDate(
  valueByDate: Map<string, number>,
  targetDate: string,
): number | null {
  let latestDate: string | null = null;
  let latestValue: number | null = null;

  for (const [date, value] of valueByDate.entries()) {
    if (!isFinitePositiveNumber(value) || date >= targetDate) {
      continue;
    }

    if (latestDate === null || date > latestDate) {
      latestDate = date;
      latestValue = value;
    }
  }

  return latestValue;
}

function buildNormalizedReturnMap(
  dates: string[],
  valueByDate: Map<string, number>,
): Map<string, number | null> {
  if (dates.length === 0) {
    return new Map();
  }

  const monthStart = dates[0];
  const priorBaseValue = findLatestValueBeforeDate(valueByDate, monthStart);
  const firstInMonthDate = dates.find((date) => isFinitePositiveNumber(valueByDate.get(date)));
  const fallbackBaseValue =
    typeof firstInMonthDate === "string" ? valueByDate.get(firstInMonthDate) : null;
  const baseValue = isFinitePositiveNumber(priorBaseValue)
    ? priorBaseValue
    : isFinitePositiveNumber(fallbackBaseValue)
      ? fallbackBaseValue
      : null;
  const seriesStartDate =
    isFinitePositiveNumber(priorBaseValue) ? monthStart : firstInMonthDate ?? null;

  if (!isFinitePositiveNumber(baseValue) || !seriesStartDate) {
    return new Map(dates.map((date) => [date, null]));
  }
  let lastValue: number | null = isFinitePositiveNumber(priorBaseValue) ? priorBaseValue : null;

  return new Map(
    dates.map((date) => {
      if (date < seriesStartDate) {
        return [date, null] as const;
      }

      const rawValue = valueByDate.get(date);
      const value = isFinitePositiveNumber(rawValue) ? rawValue : lastValue;

      if (!isFinitePositiveNumber(value)) {
        return [date, null] as const;
      }

      lastValue = value;

      return [date, ((value / baseValue) - 1) * 100] as const;
    }),
  );
}

export function createEmptyIndexHistorySeries(): IndexHistorySeriesMap {
  return {
    kospi: [],
    kosdaq: [],
    sp500: [],
  };
}

export function buildAssetTrendBenchmarkData(options: {
  snapshots: TotalAssetSnapshot[];
  ym: string;
  indexSeries: IndexHistorySeriesMap;
  endDate?: string;
}): AssetTrendBenchmarkPoint[] {
  const dates = getMonthDays(options.ym).filter((date) =>
    options.endDate ? date <= options.endDate : true,
  );
  const portfolioValueByDate = new Map(
    options.snapshots.map((snapshot) => [snapshot.date, snapshot.totalAssetKrwInt]),
  );
  const kospiValueByDate = new Map(
    options.indexSeries.kospi.map((point) => [point.date, point.close]),
  );
  const kosdaqValueByDate = new Map(
    options.indexSeries.kosdaq.map((point) => [point.date, point.close]),
  );
  const sp500ValueByDate = new Map(
    options.indexSeries.sp500.map((point) => [point.date, point.close]),
  );

  const portfolioReturns = buildNormalizedReturnMap(dates, portfolioValueByDate);
  const kospiReturns = buildNormalizedReturnMap(dates, kospiValueByDate);
  const kosdaqReturns = buildNormalizedReturnMap(dates, kosdaqValueByDate);
  const sp500Returns = buildNormalizedReturnMap(dates, sp500ValueByDate);

  return dates.map((date) => ({
    date,
    portfolio: portfolioReturns.get(date) ?? null,
    kospi: kospiReturns.get(date) ?? null,
    kosdaq: kosdaqReturns.get(date) ?? null,
    sp500: sp500Returns.get(date) ?? null,
  }));
}
