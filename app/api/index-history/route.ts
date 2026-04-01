import { unstable_noStore as noStore } from "next/cache";
import { NextResponse } from "next/server";
import {
  createEmptyIndexHistorySeries,
  IndexHistoryPoint,
  IndexHistorySeriesMap,
} from "@/lib/asset-trend/benchmark";
import {
  ASSET_TREND_INDEX_HISTORY_CONFIG,
  AssetTrendIndexHistoryProvider,
} from "@/lib/asset-trend/index-history-config";
import { getDatesInRange } from "@/lib/utils/date";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_RANGE_DAYS = 370;
const MAX_NAVER_PAGES = 30;
const NO_STORE_CACHE_CONTROL =
  "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0";
const NAVER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: "https://finance.naver.com/",
  "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
};
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

interface IndexHistoryResponse {
  from: string;
  to: string;
  series: IndexHistorySeriesMap;
  errors: string[];
  debug?: {
    sp500: {
      providers: Array<{
        type: AssetTrendIndexHistoryProvider["type"];
        symbol: string;
        status: "fulfilled" | "rejected";
        pointCount: number;
        error: string | null;
      }>;
      mergedPointCount: number;
    };
  };
}

function isValidDateString(value: string | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

function parseNumberText(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortHistory(points: IndexHistoryPoint[]): IndexHistoryPoint[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date));
}

function mergeHistoryPoints(
  primaryPoints: IndexHistoryPoint[],
  secondaryPoints: IndexHistoryPoint[],
): IndexHistoryPoint[] {
  const pointsByDate = new Map<string, number>();

  secondaryPoints.forEach((point) => {
    pointsByDate.set(point.date, point.close);
  });
  primaryPoints.forEach((point) => {
    pointsByDate.set(point.date, point.close);
  });

  return sortHistory(
    Array.from(pointsByDate.entries()).map(([date, close]) => ({
      date,
      close,
    })),
  );
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function readLastPoint(points: IndexHistoryPoint[]): IndexHistoryPoint | null {
  return points.length > 0 ? points[points.length - 1] ?? null : null;
}

function parseNaverIndexRows(html: string): IndexHistoryPoint[] {
  const results: IndexHistoryPoint[] = [];
  const rowRegex =
    /<tr[^>]*>\s*<td[^>]*class="date"[^>]*>(\d{4}\.\d{2}\.\d{2})<\/td>([\s\S]*?)<\/tr>/gi;

  for (const match of html.matchAll(rowRegex)) {
    const date = match[1].replace(/\./g, "-");
    const cells = Array.from(
      match[2].matchAll(/<td[^>]*class="number_1"[^>]*>([\s\S]*?)<\/td>/gi),
    );

    if (cells.length === 0) {
      continue;
    }

    const close = parseNumberText(stripHtml(cells[0][1]));

    if (!close || close <= 0) {
      continue;
    }

    results.push({ date, close });
  }

  return results;
}

async function fetchNaverIndexHistory(
  code: "KOSPI" | "KOSDAQ",
  from: string,
  to: string,
): Promise<IndexHistoryPoint[]> {
  const collected: IndexHistoryPoint[] = [];
  const seen = new Set<string>();

  for (let page = 1; page <= MAX_NAVER_PAGES; page += 1) {
    const response = await fetch(
      `https://finance.naver.com/sise/sise_index_day.naver?code=${code}&page=${page}`,
      {
        headers: NAVER_HEADERS,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`Naver ${code} history failed: ${response.status}`);
    }

    const rows = parseNaverIndexRows(await response.text());

    if (rows.length === 0) {
      break;
    }

    let reachedOlderRows = false;

    for (const row of rows) {
      if (seen.has(row.date)) {
        continue;
      }

      seen.add(row.date);

      if (row.date < from) {
        reachedOlderRows = true;
        continue;
      }

      if (row.date > to) {
        continue;
      }

      collected.push(row);
    }

    if (reachedOlderRows) {
      break;
    }
  }

  return sortHistory(collected);
}

function parseStooqHistoryCsv(text: string, from: string, to: string): IndexHistoryPoint[] {
  if (!text.includes(",")) {
    return [];
  }

  const lines = text.trim().split(/\r?\n/);

  if (lines.length <= 1) {
    return [];
  }

  const points: IndexHistoryPoint[] = [];

  for (const line of lines.slice(1)) {
    const [date, , , , close] = line.split(",");

    if (!date || !close || close === "N/D") {
      continue;
    }

    if (date < from || date > to) {
      continue;
    }

    const parsedClose = Number(close);

    if (!Number.isFinite(parsedClose) || parsedClose <= 0) {
      continue;
    }

    points.push({ date, close: parsedClose });
  }

  return sortHistory(points);
}

function parseFredHistoryCsv(text: string, from: string, to: string): IndexHistoryPoint[] {
  const lines = text.trim().split(/\r?\n/);

  if (lines.length <= 1) {
    return [];
  }

  const points: IndexHistoryPoint[] = [];

  for (const line of lines.slice(1)) {
    const [date, close] = line.split(",");

    if (!date || !close || close === ".") {
      continue;
    }

    if (date < from || date > to) {
      continue;
    }

    const parsedClose = Number(close);

    if (!Number.isFinite(parsedClose) || parsedClose <= 0) {
      continue;
    }

    points.push({ date, close: parsedClose });
  }

  return sortHistory(points);
}

async function fetchStooqIndexHistory(
  symbol: string,
  from: string,
  to: string,
): Promise<IndexHistoryPoint[]> {
  const response = await fetch(
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`,
    {
      headers: DEFAULT_HEADERS,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Stooq ${symbol} history failed: ${response.status}`);
  }

  return parseStooqHistoryCsv(await response.text(), from, to);
}

async function fetchYahooIndexHistory(
  symbol: string,
  from: string,
  to: string,
): Promise<IndexHistoryPoint[]> {
  const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(new Date(`${to}T23:59:59Z`).getTime() / 1000);
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      symbol,
    )}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`,
    {
      headers: DEFAULT_HEADERS,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Yahoo ${symbol} history failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  const result =
    payload &&
    typeof payload === "object" &&
    "chart" in payload &&
    payload.chart &&
    typeof payload.chart === "object" &&
    "result" in payload.chart &&
    Array.isArray(payload.chart.result)
      ? payload.chart.result[0]
      : null;

  if (!result || typeof result !== "object") {
    throw new Error(`Yahoo ${symbol} payload invalid`);
  }

  const meta =
    "meta" in result && result.meta && typeof result.meta === "object" ? result.meta : null;
  const exchangeTimeZone =
    meta &&
    "exchangeTimezoneName" in meta &&
    typeof meta.exchangeTimezoneName === "string" &&
    meta.exchangeTimezoneName
      ? meta.exchangeTimezoneName
      : "UTC";

  const timestamps =
    "timestamp" in result && Array.isArray(result.timestamp) ? result.timestamp : [];
  const quoteNode =
    "indicators" in result &&
    result.indicators &&
    typeof result.indicators === "object" &&
    "quote" in result.indicators &&
    Array.isArray(result.indicators.quote)
      ? result.indicators.quote[0]
      : null;
  const closes =
    quoteNode &&
    typeof quoteNode === "object" &&
    "close" in quoteNode &&
    Array.isArray(quoteNode.close)
      ? quoteNode.close
      : [];

  const points: IndexHistoryPoint[] = [];

  (timestamps as unknown[]).forEach((timestamp: unknown, index: number) => {
    const close = (closes as unknown[])[index];

    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return;
    }

    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      return;
    }

    const date = formatDateInTimeZone(new Date(timestamp * 1000), exchangeTimeZone);

    if (date < from || date > to) {
      return;
    }

    points.push({ date, close });
  });

  return sortHistory(points);
}

async function fetchFredIndexHistory(
  symbol: string,
  from: string,
  to: string,
): Promise<IndexHistoryPoint[]> {
  const response = await fetch(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(symbol)}`,
    {
      headers: DEFAULT_HEADERS,
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`FRED ${symbol} history failed: ${response.status}`);
  }

  return parseFredHistoryCsv(await response.text(), from, to);
}

async function fetchSp500History(
  from: string,
  to: string,
): Promise<{
  points: IndexHistoryPoint[];
  debug: NonNullable<IndexHistoryResponse["debug"]>["sp500"];
}> {
  const providers = ASSET_TREND_INDEX_HISTORY_CONFIG.sp500.providers;
  const providerResults = await Promise.allSettled(
    providers.map((provider) => fetchHistoryForProvider(provider, from, to)),
  );

  const successfulSeries = providerResults.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const mergedPoints = successfulSeries.reduce<IndexHistoryPoint[]>(
    (allPoints, points) => mergeHistoryPoints(points, allPoints),
    [],
  );
  const debug = {
    providers: providers.map((provider, index) => {
      const result = providerResults[index];

      if (result?.status === "fulfilled") {
        return {
          type: provider.type,
          symbol: provider.symbol,
          status: "fulfilled" as const,
          pointCount: result.value.length,
          error: null,
        };
      }

      return {
        type: provider.type,
        symbol: provider.symbol,
        status: "rejected" as const,
        pointCount: 0,
        error:
          result?.status === "rejected"
            ? result.reason instanceof Error
              ? result.reason.message
              : String(result.reason)
            : "provider result missing",
      };
    }),
    mergedPointCount: mergedPoints.length,
  };

  if (process.env.NODE_ENV !== "production") {
    console.debug("[api/index-history] sp500", {
      requestedSymbol: providers[0]?.symbol ?? null,
      compareEndDate: to,
      compareStartDate: from,
      fetchedPointCount: mergedPoints.length,
      firstValidPoint: mergedPoints[0] ?? null,
      lastValidPoint: readLastPoint(mergedPoints),
      providerResults: debug.providers,
    });
  }

  if (mergedPoints.length > 0) {
    return {
      points: mergedPoints,
      debug,
    };
  }

  return {
    points: mergedPoints,
    debug,
  };
}

async function fetchHistoryForProvider(
  provider: AssetTrendIndexHistoryProvider,
  from: string,
  to: string,
): Promise<IndexHistoryPoint[]> {
  if (provider.type === "naver") {
    return fetchNaverIndexHistory(provider.symbol, from, to);
  }

  if (provider.type === "yahoo") {
    return fetchYahooIndexHistory(provider.symbol, from, to);
  }

  if (provider.type === "fred") {
    return fetchFredIndexHistory(provider.symbol, from, to);
  }

  return fetchStooqIndexHistory(provider.symbol, from, to);
}

async function fetchConfiguredIndexHistory(
  key: keyof IndexHistorySeriesMap,
  from: string,
  to: string,
): Promise<IndexHistoryPoint[]> {
  const config = ASSET_TREND_INDEX_HISTORY_CONFIG[key];

  const provider = config.providers[0];
  return fetchHistoryForProvider(provider, from, to);
}

export async function GET(request: Request) {
  noStore();

  const requestUrl = new URL(request.url);
  const from = requestUrl.searchParams.get("from");
  const to = requestUrl.searchParams.get("to");
  const shouldIncludeDebug = requestUrl.searchParams.get("debug") === "1";

  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return NextResponse.json(
      { error: "invalid date range" },
      {
        status: 400,
        headers: {
          "Cache-Control": NO_STORE_CACHE_CONTROL,
        },
      },
    );
  }

  const dates = getDatesInRange(from, to);

  if (dates.length === 0 || dates.length > MAX_RANGE_DAYS) {
    return NextResponse.json(
      { error: "date range is too large" },
      {
        status: 400,
        headers: {
          "Cache-Control": NO_STORE_CACHE_CONTROL,
        },
      },
    );
  }

  const errors: string[] = [];
  const series = createEmptyIndexHistorySeries();
  const [kospiResult, kosdaqResult, sp500Result] = await Promise.allSettled([
    fetchConfiguredIndexHistory("kospi", from, to),
    fetchConfiguredIndexHistory("kosdaq", from, to),
    fetchSp500History(from, to),
  ]);

  if (kospiResult.status === "fulfilled") {
    series.kospi = kospiResult.value;
  }

  if (series.kospi.length === 0) {
    errors.push("KOSPI");
  }

  if (kosdaqResult.status === "fulfilled") {
    series.kosdaq = kosdaqResult.value;
  }

  if (series.kosdaq.length === 0) {
    errors.push("KOSDAQ");
  }

  if (sp500Result.status === "fulfilled") {
    series.sp500 = sp500Result.value.points;
  }

  if (series.sp500.length === 0) {
    errors.push("S&P");
  }

  const payload: IndexHistoryResponse = { from, to, series, errors };

  if (shouldIncludeDebug && sp500Result.status === "fulfilled") {
    payload.debug = {
      sp500: sp500Result.value.debug,
    };
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": NO_STORE_CACHE_CONTROL,
    },
  });
}
