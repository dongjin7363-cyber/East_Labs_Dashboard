import { getDatesInRange } from "@/lib/date/calendar";
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

export interface AssetTrendBenchmarkSummaryValue {
  periodReturnPct: number | null;
  dailyReturnPct: number | null;
}

export interface AssetTrendBenchmarkBuildResult {
  data: AssetTrendBenchmarkPoint[];
  summary: Record<AssetTrendBenchmarkKey, AssetTrendBenchmarkSummaryValue>;
  diagnostics: Record<AssetTrendBenchmarkKey, AssetTrendBenchmarkSeriesDiagnostics>;
}

export interface AssetTrendBenchmarkSeriesDiagnostics {
  baseSource: "previous" | "fallback" | "none";
  rawPointCount: number;
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

function findLatestEntryBeforeDate(
  valueByDate: Map<string, number>,
  targetDate: string,
): { date: string; value: number } | null {
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

  if (latestDate === null || latestValue === null) {
    return null;
  }

  return {
    date: latestDate,
    value: latestValue,
  };
}

function findLatestEntryOnOrBeforeDate(
  valueByDate: Map<string, number>,
  targetDate: string,
): { date: string; value: number } | null {
  let latestDate: string | null = null;
  let latestValue: number | null = null;

  for (const [date, value] of valueByDate.entries()) {
    if (!isFinitePositiveNumber(value) || date > targetDate) {
      continue;
    }

    if (latestDate === null || date > latestDate) {
      latestDate = date;
      latestValue = value;
    }
  }

  if (latestDate === null || latestValue === null) {
    return null;
  }

  return {
    date: latestDate,
    value: latestValue,
  };
}

function findFirstEntryOnOrAfterDate(
  valueByDate: Map<string, number>,
  targetDate: string,
  endDate: string,
): { date: string; value: number } | null {
  let earliestDate: string | null = null;
  let earliestValue: number | null = null;

  for (const [date, value] of valueByDate.entries()) {
    if (!isFinitePositiveNumber(value) || date < targetDate || date > endDate) {
      continue;
    }

    if (earliestDate === null || date < earliestDate) {
      earliestDate = date;
      earliestValue = value;
    }
  }

  if (earliestDate === null || earliestValue === null) {
    return null;
  }

  return {
    date: earliestDate,
    value: earliestValue,
  };
}

function emptySummaryValue(): AssetTrendBenchmarkSummaryValue {
  return {
    periodReturnPct: null,
    dailyReturnPct: null,
  };
}

function buildNormalizedSeriesResult(
  dates: string[],
  valueByDate: Map<string, number>,
  compareStartDate: string,
  compareEndDate: string,
): {
  returnMap: Map<string, number | null>;
  summary: AssetTrendBenchmarkSummaryValue;
  diagnostics: AssetTrendBenchmarkSeriesDiagnostics;
} {
  const rawPointCount = Array.from(valueByDate.entries()).filter(
    ([date, value]) =>
      isFinitePositiveNumber(value) && date >= compareStartDate && date <= compareEndDate,
  ).length;

  if (dates.length === 0) {
    return {
      returnMap: new Map(),
      summary: emptySummaryValue(),
      diagnostics: {
        baseSource: "none",
        rawPointCount,
      },
    };
  }

  const previousBaseEntry = findLatestEntryBeforeDate(valueByDate, compareStartDate);
  const fallbackBaseEntry = findFirstEntryOnOrAfterDate(
    valueByDate,
    compareStartDate,
    compareEndDate,
  );
  const baseEntry = previousBaseEntry ?? fallbackBaseEntry;
  const baseSource: AssetTrendBenchmarkSeriesDiagnostics["baseSource"] = previousBaseEntry
    ? "previous"
    : fallbackBaseEntry
      ? "fallback"
      : "none";

  if (!baseEntry) {
    return {
      returnMap: new Map(dates.map((date) => [date, null])),
      summary: emptySummaryValue(),
      diagnostics: {
        baseSource,
        rawPointCount,
      },
    };
  }

  let lastValue: number | null = baseEntry.value;
  const returnMap = new Map<string, number | null>(
    dates.map((date) => {
      if (baseSource === "fallback" && date < baseEntry.date) {
        return [date, null] as const;
      }

      const rawValue = valueByDate.get(date);
      const value = isFinitePositiveNumber(rawValue) ? rawValue : lastValue;

      if (!isFinitePositiveNumber(value)) {
        return [date, null] as const;
      }

      lastValue = value;

      return [date, ((value / baseEntry.value) - 1) * 100] as const;
    }),
  );

  const lastDate = dates[dates.length - 1];
  const periodReturnPct = returnMap.get(lastDate) ?? null;

  const currentEntry = findLatestEntryOnOrBeforeDate(valueByDate, compareEndDate);
  let dailyReturnPct: number | null = null;

  if (currentEntry && currentEntry.date >= compareStartDate) {
    const previousEntry = findLatestEntryBeforeDate(valueByDate, currentEntry.date);

    if (previousEntry) {
      dailyReturnPct = ((currentEntry.value / previousEntry.value) - 1) * 100;
    }
  }

  return {
    returnMap,
    summary: {
      periodReturnPct,
      dailyReturnPct,
    },
    diagnostics: {
      baseSource,
      rawPointCount,
    },
  };
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
  indexSeries: IndexHistorySeriesMap;
  compareStartDate: string;
  compareEndDate: string;
}): AssetTrendBenchmarkBuildResult {
  const dates = getDatesInRange(options.compareStartDate, options.compareEndDate);
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

  const portfolioResult = buildNormalizedSeriesResult(
    dates,
    portfolioValueByDate,
    options.compareStartDate,
    options.compareEndDate,
  );
  const kospiResult = buildNormalizedSeriesResult(
    dates,
    kospiValueByDate,
    options.compareStartDate,
    options.compareEndDate,
  );
  const kosdaqResult = buildNormalizedSeriesResult(
    dates,
    kosdaqValueByDate,
    options.compareStartDate,
    options.compareEndDate,
  );
  const sp500Result = buildNormalizedSeriesResult(
    dates,
    sp500ValueByDate,
    options.compareStartDate,
    options.compareEndDate,
  );

  return {
    data: dates.map((date) => ({
      date,
      portfolio: portfolioResult.returnMap.get(date) ?? null,
      kospi: kospiResult.returnMap.get(date) ?? null,
      kosdaq: kosdaqResult.returnMap.get(date) ?? null,
      sp500: sp500Result.returnMap.get(date) ?? null,
    })),
    summary: {
      portfolio: portfolioResult.summary,
      kospi: kospiResult.summary,
      kosdaq: kosdaqResult.summary,
      sp500: sp500Result.summary,
    },
    diagnostics: {
      portfolio: portfolioResult.diagnostics,
      kospi: kospiResult.diagnostics,
      kosdaq: kosdaqResult.diagnostics,
      sp500: sp500Result.diagnostics,
    },
  };
}
