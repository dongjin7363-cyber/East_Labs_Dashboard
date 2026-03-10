import { NextResponse } from "next/server";
import {
  createEmptyIndexHistorySeries,
  IndexHistoryPoint,
  IndexHistorySeriesMap,
} from "@/lib/asset-trend/benchmark";
import { getDatesInRange } from "@/lib/utils/date";

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
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
}

interface CacheEntry {
  payload: IndexHistoryResponse;
  expiresAt: number;
}

const historyCache = new Map<string, CacheEntry>();

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

  for (let page = 1; page <= 10; page += 1) {
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

    const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

    if (date < from || date > to) {
      return;
    }

    points.push({ date, close });
  });

  return sortHistory(points);
}

async function fetchSp500History(from: string, to: string): Promise<IndexHistoryPoint[]> {
  try {
    return await fetchStooqIndexHistory("^spx", from, to);
  } catch {
    return fetchYahooIndexHistory("^GSPC", from, to);
  }
}

function getCached(key: string): IndexHistoryResponse | null {
  const cached = historyCache.get(key);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt < Date.now()) {
    historyCache.delete(key);
    return null;
  }

  return cached.payload;
}

function setCached(key: string, payload: IndexHistoryResponse): void {
  historyCache.set(key, {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const from = requestUrl.searchParams.get("from");
  const to = requestUrl.searchParams.get("to");

  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return NextResponse.json({ error: "invalid date range" }, { status: 400 });
  }

  const dates = getDatesInRange(from, to);

  if (dates.length === 0 || dates.length > 62) {
    return NextResponse.json({ error: "date range is too large" }, { status: 400 });
  }

  const cacheKey = `${from}:${to}`;
  const cached = getCached(cacheKey);

  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
      },
    });
  }

  const errors: string[] = [];
  const series = createEmptyIndexHistorySeries();
  const [kospiResult, kosdaqResult, sp500Result] = await Promise.allSettled([
    fetchNaverIndexHistory("KOSPI", from, to),
    fetchNaverIndexHistory("KOSDAQ", from, to),
    fetchSp500History(from, to),
  ]);

  if (kospiResult.status === "fulfilled") {
    series.kospi = kospiResult.value;
  } else {
    errors.push("KOSPI");
  }

  if (kosdaqResult.status === "fulfilled") {
    series.kosdaq = kosdaqResult.value;
  } else {
    errors.push("KOSDAQ");
  }

  if (sp500Result.status === "fulfilled") {
    series.sp500 = sp500Result.value;
  } else {
    errors.push("S&P");
  }

  const payload: IndexHistoryResponse = { from, to, series, errors };
  setCached(cacheKey, payload);

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600",
    },
  });
}
