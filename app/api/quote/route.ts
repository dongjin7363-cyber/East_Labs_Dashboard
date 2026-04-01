import { NextRequest, NextResponse } from "next/server";
import iconv from "iconv-lite";

const QUOTE_CACHE_TTL_MS = 45_000;
const KRX_COMPANY_CACHE_TTL_MS = 21_600_000;
const US_MARKET_TIME_ZONE = "America/New_York";

type QuoteFailureReason =
  | "NO_QUOTE"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "BAD_RESPONSE";

type QuoteSuccessResponse = {
  ok: true;
  ticker: string;
  tickerInput: string;
  market: "US" | "KR";
  currency: "USD" | "KRW";
  currentPriceInt: number;
  prevCloseInt: number | null;
  dayChangePct: number | null;
  displayName: string | null;
  tickerCode: string | null;
  logoUrl: string | null;
  price: number;
  priceInt: number;
  prevClose?: number | null;
  asOf: string;
  resolvedName?: string | null;
  resolvedCode?: string | null;
};

type QuoteFailureResponse = {
  ok: false;
  ticker: string;
  tickerInput: string;
  market: "US" | "KR";
  reason: QuoteFailureReason;
  message: string;
};

type CacheEntry = {
  expiresAt: number;
  value: QuoteSuccessResponse;
};

type DailyBar = {
  date: string;
  close: number | null;
};

const quoteCache = new Map<string, CacheEntry>();
const US_DISPLAY_NAME_FALLBACK: Record<string, string> = {
  RKLB: "Rocket Lab",
};
let krxCompanyCache:
  | {
      expiresAt: number;
      entries: Array<{ name: string; code: string }>;
    }
  | null = null;

class QuoteLookupError extends Error {
  reason: QuoteFailureReason;

  constructor(reason: QuoteFailureReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

function cacheKey(market: string, ticker: string): string {
  return `${market}:${ticker}`;
}

function getCached(market: string, ticker: string): QuoteSuccessResponse | null {
  const key = cacheKey(market, ticker);
  const entry = quoteCache.get(key);

  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    quoteCache.delete(key);
    return null;
  }

  return entry.value;
}

function setCached(market: "US" | "KR", tickerInput: string, value: QuoteSuccessResponse): void {
  quoteCache.set(cacheKey(market, tickerInput), {
    value,
    expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
  });
}

function toIsoOrNow(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value * 1000).toISOString();
  }

  return new Date().toISOString();
}

function toPriceIntUsd(price: number): number {
  return Math.round(price * 100);
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

function pickLatestAndPreviousBars(
  bars: DailyBar[],
  targetDate: string,
): {
  latest: DailyBar | null;
  previous: DailyBar | null;
} {
  const valid = bars
    .filter((bar) => bar?.date && typeof bar.close === "number" && Number.isFinite(bar.close))
    .sort((a, b) => a.date.localeCompare(b.date));

  let latestIndex = -1;

  for (let index = valid.length - 1; index >= 0; index -= 1) {
    if (valid[index].date <= targetDate) {
      latestIndex = index;
      break;
    }
  }

  if (latestIndex === -1) {
    return { latest: null, previous: null };
  }

  return {
    latest: valid[latestIndex] ?? null,
    previous: latestIndex > 0 ? valid[latestIndex - 1] ?? null : null,
  };
}

function mergeDailyBars(primary: DailyBar[], fallback: DailyBar[]): DailyBar[] {
  const closeByDate = new Map<string, number>();

  fallback.forEach((bar) => {
    if (bar.date && typeof bar.close === "number" && Number.isFinite(bar.close) && bar.close > 0) {
      closeByDate.set(bar.date, bar.close);
    }
  });

  primary.forEach((bar) => {
    if (bar.date && typeof bar.close === "number" && Number.isFinite(bar.close) && bar.close > 0) {
      closeByDate.set(bar.date, bar.close);
    }
  });

  return Array.from(closeByDate.entries())
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function debugQuoteRaw(
  scope: string,
  payload: Record<string, unknown>,
  keys: string[],
): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  const snapshot: Record<string, unknown> = {};

  keys.forEach((key) => {
    snapshot[key] = payload[key];
  });

  console.debug(`[quote][raw:${scope}]`, snapshot);
}

async function fetchUsQuoteFromFinnhub(ticker: string): Promise<{
  price: number;
  asOf: string;
  prevClose?: number;
  dayChangePct?: number;
  displayName?: string;
}> {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new QuoteLookupError("BAD_RESPONSE", "FINNHUB_API_KEY is not configured");
  }

  const response = await fetch(
    `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(
      ticker,
    )}&token=${encodeURIComponent(apiKey)}`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new QuoteLookupError("RATE_LIMIT", "Finnhub rate limit");
    }

    if (response.status === 404) {
      throw new QuoteLookupError("NO_QUOTE", "Finnhub no quote");
    }

    throw new QuoteLookupError("BAD_RESPONSE", `Finnhub request failed (${response.status})`);
  }

  const data: unknown = await response.json();

  if (typeof data !== "object" || data === null) {
    throw new QuoteLookupError("BAD_RESPONSE", "Finnhub payload is invalid");
  }

  const quoteData = data as Record<string, unknown>;
  debugQuoteRaw("US_FINNHUB", quoteData, [
    "c",
    "pc",
    "dp",
    "changePercent",
    "regularMarketChangePercent",
    "previousClose",
    "regularMarketPreviousClose",
    "name",
    "companyName",
  ]);
  const priceCandidates = [
    quoteData.c,
    quoteData.currentPrice,
    quoteData.regularMarketPrice,
    quoteData.price,
  ];
  const prevCloseCandidates = [
    quoteData.pc,
    quoteData.previousClose,
    quoteData.regularMarketPreviousClose,
  ];
  const dayChangeCandidates = [
    quoteData.dp,
    quoteData.changePercent,
    quoteData.regularMarketChangePercent,
  ];
  const displayNameCandidates = [
    quoteData.name,
    quoteData.companyName,
    quoteData.displayName,
    quoteData.shortName,
  ];
  const priceMaybe = priceCandidates
    .map((item) => Number(item))
    .find((item) => Number.isFinite(item) && item > 0);
  const prevClose = prevCloseCandidates
    .map((item) => Number(item))
    .find((item) => Number.isFinite(item) && item > 0);
  const dayChangePct = dayChangeCandidates
    .map((item) => Number(item))
    .find((item) => Number.isFinite(item));
  const displayName = displayNameCandidates
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .find((item) => item.length > 0);
  const asOf = toIsoOrNow((data as { t?: unknown }).t);

  if (typeof priceMaybe !== "number") {
    throw new QuoteLookupError("NO_QUOTE", "Finnhub current price is invalid");
  }

  if (!Number.isFinite(priceMaybe) || priceMaybe <= 0) {
    throw new QuoteLookupError("NO_QUOTE", "Finnhub current price is invalid");
  }

  const price = priceMaybe;
  const safePrevClose =
    typeof prevClose === "number" &&
    Number.isFinite(prevClose) &&
    prevClose > 0
      ? prevClose
      : undefined;
  const safeDayChangePct =
    typeof dayChangePct === "number" && Number.isFinite(dayChangePct)
      ? dayChangePct
      : typeof price === "number" &&
          Number.isFinite(price) &&
          typeof safePrevClose === "number" &&
          safePrevClose > 0
        ? ((price - safePrevClose) / safePrevClose) * 100
        : undefined;

  return {
    price,
    asOf,
    prevClose: safePrevClose,
    dayChangePct: safeDayChangePct,
    displayName,
  };
}

async function fetchUsDailyBarsFromStooqHistory(ticker: string): Promise<DailyBar[]> {
  const stooqSymbol = `${ticker.toLowerCase().replace(/\.us$/i, "")}.us`;
  const response = await fetch(
    `https://stooq.com/q/d/l/?s=${encodeURIComponent(stooqSymbol)}&i=d`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    return [];
  }

  const csvText = await response.text();
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  return lines
    .slice(1)
    .map((line) => line.split(","))
    .map((cols) => ({
      date: cols[0] ?? "",
      close: Number(cols[4]),
    }))
    .filter((bar) => bar.date !== "" && Number.isFinite(bar.close) && bar.close > 0);
}

async function fetchUsDailyBarsFromYahooHistory(ticker: string): Promise<DailyBar[]> {
  const period2 = Math.floor(Date.now() / 1000);
  const period1 = period2 - 60 * 60 * 24 * 21;
  const response = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker,
    )}?period1=${period1}&period2=${period2}&interval=1d&includeAdjustedClose=true`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    return [];
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
    return [];
  }

  const meta =
    "meta" in result && result.meta && typeof result.meta === "object" ? result.meta : null;
  const exchangeTimeZone =
    meta &&
    "exchangeTimezoneName" in meta &&
    typeof meta.exchangeTimezoneName === "string" &&
    meta.exchangeTimezoneName
      ? meta.exchangeTimezoneName
      : US_MARKET_TIME_ZONE;
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

  const bars: DailyBar[] = [];

  (timestamps as unknown[]).forEach((timestamp: unknown, index: number) => {
    const close = (closes as unknown[])[index];

    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return;
    }

    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) {
      return;
    }

    bars.push({
      date: formatDateInTimeZone(new Date(timestamp * 1000), exchangeTimeZone),
      close,
    });
  });

  return bars.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchUsDailyBars(ticker: string): Promise<DailyBar[]> {
  const stooqBars = await fetchUsDailyBarsFromStooqHistory(ticker);

  if (stooqBars.length >= 2) {
    return stooqBars;
  }

  const yahooBars = await fetchUsDailyBarsFromYahooHistory(ticker);

  if (stooqBars.length === 0) {
    return yahooBars;
  }

  return mergeDailyBars(stooqBars, yahooBars);
}

async function fetchUsCompletedSessionMetricsFromStooqHistory(ticker: string): Promise<{
  latestClose?: number;
  prevClose?: number;
  dayChangePct?: number;
  latestDate?: string;
}> {
  const bars = await fetchUsDailyBars(ticker);
  const targetDate = formatDateInTimeZone(new Date(), US_MARKET_TIME_ZONE);
  const { latest, previous } = pickLatestAndPreviousBars(bars, targetDate);

  if (!latest) {
    return {};
  }

  const latestClose =
    typeof latest.close === "number" && Number.isFinite(latest.close) && latest.close > 0
      ? latest.close
      : undefined;
  const prevClose =
    typeof previous?.close === "number" && Number.isFinite(previous.close) && previous.close > 0
      ? previous.close
      : undefined;
  const dayChangePct =
    typeof latestClose === "number" &&
    typeof prevClose === "number" &&
    prevClose > 0
      ? ((latestClose - prevClose) / prevClose) * 100
      : undefined;

  return {
    latestClose,
    prevClose,
    dayChangePct,
    latestDate: latest.date,
  };
}

async function fetchUsQuoteFromStooq(ticker: string): Promise<{
  price: number;
  asOf: string;
  prevClose?: number;
  dayChangePct?: number;
  displayName?: string;
}> {
  const stooqSymbol = `${ticker.toLowerCase().replace(/\.us$/i, "")}.us`;

  const response = await fetch(
    `https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&f=sd2t2ohlcv&h&e=csv`,
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new QuoteLookupError("RATE_LIMIT", "Stooq rate limit");
    }

    if (response.status === 404) {
      throw new QuoteLookupError("NO_QUOTE", "Stooq no quote");
    }

    throw new QuoteLookupError("BAD_RESPONSE", `Stooq request failed (${response.status})`);
  }

  const csvText = await response.text();
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new QuoteLookupError("NO_QUOTE", "Stooq payload has no quote row");
  }

  const headers = lines[0].split(",").map((field) => field.replaceAll('"', "").trim());
  const values = lines[1].split(",").map((field) => field.replaceAll('"', "").trim());
  if (process.env.NODE_ENV === "development") {
    console.debug("[quote][raw:US_STOOQ]", {
      symbol: stooqSymbol,
      headers,
      row: values,
    });
  }

  if (values.length < 2) {
    throw new QuoteLookupError("BAD_RESPONSE", "Stooq quote row is invalid");
  }

  const closeIndex = headers.findIndex((field) => field.toLowerCase() === "close");
  const closeRaw = closeIndex >= 0 ? values[closeIndex] : values[6];
  const closePrice = Number(closeRaw);
  const closePriceInt = toPriceIntUsd(closePrice);

  if (!Number.isFinite(closePriceInt) || closePriceInt <= 0) {
    throw new QuoteLookupError("NO_QUOTE", "Stooq close price is invalid");
  }

  const dateIndex = headers.findIndex((field) => field.toLowerCase() === "date");
  const timeIndex = headers.findIndex((field) => field.toLowerCase() === "time");
  const datePart = dateIndex >= 0 ? values[dateIndex] : values[1];
  const timePart = timeIndex >= 0 ? values[timeIndex] : values[2];

  let asOf = new Date().toISOString();

  if (datePart && timePart && datePart !== "N/D" && timePart !== "N/D") {
    const parsed = new Date(`${datePart}T${timePart}Z`);

    if (!Number.isNaN(parsed.getTime())) {
      asOf = parsed.toISOString();
    }
  }

  const sessionMetrics = await fetchUsCompletedSessionMetricsFromStooqHistory(ticker);

  return {
    price: closePriceInt / 100,
    asOf,
    prevClose: sessionMetrics.prevClose,
    dayChangePct: sessionMetrics.dayChangePct,
    displayName: undefined,
  };
}

async function fetchUsQuote(ticker: string): Promise<{
  price: number;
  asOf: string;
  prevClose?: number;
  dayChangePct?: number;
  displayName?: string;
}> {
  try {
    const finnhubQuote = await fetchUsQuoteFromFinnhub(ticker);
    const sessionMetrics = await fetchUsCompletedSessionMetricsFromStooqHistory(ticker);

    if (
      typeof sessionMetrics.prevClose === "number" &&
      Number.isFinite(sessionMetrics.prevClose)
    ) {
      return {
        ...finnhubQuote,
        prevClose: sessionMetrics.prevClose,
        dayChangePct:
          typeof sessionMetrics.dayChangePct === "number" &&
          Number.isFinite(sessionMetrics.dayChangePct)
            ? sessionMetrics.dayChangePct
            : finnhubQuote.dayChangePct,
      };
    }

    return finnhubQuote;
  } catch (finnhubError) {
    try {
      return await fetchUsQuoteFromStooq(ticker);
    } catch (stooqError) {
      if (stooqError instanceof QuoteLookupError) {
        throw stooqError;
      }

      if (finnhubError instanceof QuoteLookupError) {
        throw finnhubError;
      }

      throw new QuoteLookupError("BAD_RESPONSE", "quote lookup failed");
    }
  }
}

function parsePercentValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[%\s,]/g, "");

    if (!cleaned) {
      return null;
    }

    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function parseDayChangePctFromRecord(
  row: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    if (!(key in row)) {
      continue;
    }

    const parsed = parsePercentValue(row[key]);

    if (parsed === null) {
      continue;
    }

    // Some APIs expose percent as ratio (0.01 -> 1%)
    if (Math.abs(parsed) <= 1 && key.toLowerCase().includes("percent")) {
      return parsed * 100;
    }

    return parsed;
  }

  return undefined;
}

function parsePrevCloseIntFromRecord(
  row: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    if (!(key in row)) {
      continue;
    }

    const parsed = parseKrwPriceInt(row[key]);

    if (parsed && parsed > 0) {
      return parsed;
    }
  }

  return undefined;
}

function toText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `${value}`;
  }

  return "";
}

function normalizeNameToken(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function parseKrwPriceInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");

    if (!cleaned) {
      return null;
    }

    const parsed = Number(cleaned);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.round(parsed);
    }
  }

  return null;
}

function normalizeKrCode(value: unknown): string | undefined {
  const text = toText(value);

  if (!text) {
    return undefined;
  }

  const normalized = text.toUpperCase();

  if (/^[A-Z0-9]{1,12}$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function toIsoFromDateText(value: unknown): string {
  const text = toText(value);

  if (text) {
    const parsed = new Date(text);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function encodeCp949PercentKeyword(keyword: string): string {
  const encoded = iconv.encode(keyword, "cp949");

  return Array.from(encoded)
    .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
    .join("");
}

function isAsciiOnly(value: string): boolean {
  return /^[\x00-\x7F]*$/.test(value);
}

function extractKrSearchRows(payload: unknown): Array<Record<string, unknown>> {
  const findRows = (
    node: unknown,
    depth: number,
  ): Array<Record<string, unknown>> | null => {
    if (depth > 5) {
      return null;
    }

    if (Array.isArray(node)) {
      const rows = node.filter(
        (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
      );

      if (rows.some((row) => "nm" in row || "cd" in row || "nv" in row)) {
        return rows;
      }

      for (const item of node) {
        const nested = findRows(item, depth + 1);

        if (nested && nested.length > 0) {
          return nested;
        }
      }

      return null;
    }

    if (!node || typeof node !== "object") {
      return null;
    }

    for (const value of Object.values(node)) {
      const nested = findRows(value, depth + 1);

      if (nested && nested.length > 0) {
        return nested;
      }
    }

    return null;
  };

  return findRows(payload, 0) ?? [];
}

async function fetchKrSearchRows(
  tickerInput: string,
  encoding: "UTF8" | "CP949",
): Promise<Array<Record<string, unknown>>> {
  const encodedKeyword =
    encoding === "CP949"
      ? encodeCp949PercentKeyword(tickerInput)
      : encodeURIComponent(tickerInput);
  const response = await fetch(
    `https://m.stock.naver.com/api/json/search/searchListJson.nhn?keyword=${encodedKeyword}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new QuoteLookupError("RATE_LIMIT", "Naver search rate limit");
    }

    if (response.status === 404) {
      throw new QuoteLookupError("NOT_FOUND", "Naver search not found");
    }

    throw new QuoteLookupError("BAD_RESPONSE", `Naver request failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  const rows = extractKrSearchRows(payload);

  if (rows.length === 0) {
    throw new QuoteLookupError("NOT_FOUND", "Naver search rows are empty");
  }

  return rows;
}

async function fetchKrBasicQuoteByCode(code: string): Promise<{
  priceInt: number;
  prevCloseInt?: number;
  dayChangePct?: number;
  resolvedName: string;
  resolvedCode: string;
  logoUrl?: string;
  asOf: string;
}> {
  const response = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new QuoteLookupError("RATE_LIMIT", "Naver basic quote rate limit");
    }

    if (response.status === 404) {
      throw new QuoteLookupError("NOT_FOUND", "Naver basic quote not found");
    }

    throw new QuoteLookupError(
      "BAD_RESPONSE",
      `Naver basic quote request failed (${response.status})`,
    );
  }

  const payload: unknown = await response.json();

  if (!payload || typeof payload !== "object") {
    throw new QuoteLookupError("BAD_RESPONSE", "Naver basic quote payload is invalid");
  }

  const row = payload as Record<string, unknown>;
  debugQuoteRaw("KR_BASIC", row, [
    "closePrice",
    "nv",
    "prevClosePrice",
    "previousClosePrice",
    "pc",
    "compareToPreviousClosePriceRate",
    "compareToPreviousPriceRate",
    "fluctuationRate",
    "changeRate",
    "rf",
    "fr",
    "stockName",
    "itemCode",
  ]);
  const priceInt = parseKrwPriceInt(row.closePrice ?? row.nv);

  if (!priceInt || priceInt <= 0) {
    throw new QuoteLookupError("BAD_RESPONSE", "Naver basic quote price is invalid");
  }

  const comparePayload =
    row.compareToPreviousPrice && typeof row.compareToPreviousPrice === "object"
      ? (row.compareToPreviousPrice as Record<string, unknown>)
      : null;
  const compareCode = comparePayload ? toText(comparePayload.code) : "";
  const diffSignedRaw = parsePercentValue(row.compareToPreviousClosePrice);
  const diffAbs =
    typeof diffSignedRaw === "number" && Number.isFinite(diffSignedRaw)
      ? Math.abs(Math.round(diffSignedRaw))
      : undefined;
  let derivedPrevCloseInt: number | undefined;

  if (typeof diffSignedRaw === "number" && Number.isFinite(diffSignedRaw) && diffSignedRaw < 0) {
    derivedPrevCloseInt = priceInt - Math.round(diffSignedRaw);
  } else if (typeof diffAbs === "number") {
    if (compareCode === "2") {
      derivedPrevCloseInt = priceInt - diffAbs;
    } else if (compareCode === "5" || compareCode === "4") {
      derivedPrevCloseInt = priceInt + diffAbs;
    } else if (compareCode === "3") {
      derivedPrevCloseInt = priceInt;
    }
  }

  const parsedPrevCloseInt =
    parsePrevCloseIntFromRecord(row, [
      "prevClosePrice",
      "previousClosePrice",
      "pc",
      "regularMarketPreviousClose",
      "previousClose",
    ]) ??
    (typeof derivedPrevCloseInt === "number" && derivedPrevCloseInt > 0
      ? derivedPrevCloseInt
      : undefined);
  const parsedDayChangePct =
    parseDayChangePctFromRecord(row, [
      "compareToPreviousClosePriceRate",
      "compareToPreviousPriceRate",
      "fluctuationsRatio",
      "fluctuationsRate",
      "fluctuationRate",
      "changeRate",
      "rf",
      "fr",
    ]) ??
    (parsedPrevCloseInt && parsedPrevCloseInt > 0
      ? ((priceInt - parsedPrevCloseInt) / parsedPrevCloseInt) * 100
      : undefined);

  return {
    priceInt,
    prevCloseInt: parsedPrevCloseInt,
    dayChangePct: parsedDayChangePct,
    resolvedName: toText(row.stockName) || toText(row.itemName) || code,
    resolvedCode: normalizeKrCode(row.itemCode) ?? code,
    logoUrl: toText(row.itemLogoPngUrl) || toText(row.itemLogoUrl) || undefined,
    asOf: toIsoFromDateText(row.localTradedAt),
  };
}

async function ensureKrQuoteMetrics(input: {
  priceInt: number;
  prevCloseInt?: number;
  dayChangePct?: number;
  resolvedName: string;
  resolvedCode: string;
  logoUrl?: string;
  asOf: string;
}): Promise<{
  priceInt: number;
  prevCloseInt?: number;
  dayChangePct?: number;
  resolvedName: string;
  resolvedCode: string;
  logoUrl?: string;
  asOf: string;
}> {
  let nextPrevCloseInt = input.prevCloseInt;
  let nextDayChangePct = input.dayChangePct;
  let nextAsOf = input.asOf;
  let nextResolvedName = input.resolvedName;
  let nextResolvedCode = input.resolvedCode;
  let nextLogoUrl = input.logoUrl;

  if (
    nextPrevCloseInt !== undefined &&
    nextPrevCloseInt > 0 &&
    nextDayChangePct === undefined
  ) {
    nextDayChangePct = ((input.priceInt - nextPrevCloseInt) / nextPrevCloseInt) * 100;
  }

  if (nextPrevCloseInt !== undefined && nextDayChangePct !== undefined) {
    return {
      priceInt: input.priceInt,
      prevCloseInt: nextPrevCloseInt,
      dayChangePct: nextDayChangePct,
      resolvedName: nextResolvedName,
      resolvedCode: nextResolvedCode,
      logoUrl: nextLogoUrl,
      asOf: nextAsOf,
    };
  }

  try {
    const basicQuote = await fetchKrBasicQuoteByCode(input.resolvedCode);
    nextPrevCloseInt = nextPrevCloseInt ?? basicQuote.prevCloseInt;
    nextDayChangePct = nextDayChangePct ?? basicQuote.dayChangePct;
    nextAsOf = input.asOf || basicQuote.asOf;
    nextResolvedName = input.resolvedName || basicQuote.resolvedName;
    nextResolvedCode = input.resolvedCode || basicQuote.resolvedCode;
    nextLogoUrl = input.logoUrl || basicQuote.logoUrl;
  } catch {
    // Keep best-effort values from initial sources.
  }

  if (
    nextPrevCloseInt !== undefined &&
    nextPrevCloseInt > 0 &&
    nextDayChangePct === undefined
  ) {
    nextDayChangePct = ((input.priceInt - nextPrevCloseInt) / nextPrevCloseInt) * 100;
  }

  return {
    priceInt: input.priceInt,
    prevCloseInt: nextPrevCloseInt,
    dayChangePct: nextDayChangePct,
    resolvedName: nextResolvedName,
    resolvedCode: nextResolvedCode,
    logoUrl: nextLogoUrl,
    asOf: nextAsOf,
  };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtmlTags(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

function parseKrxCompanyEntries(html: string): Array<{ name: string; code: string }> {
  const rows: Array<{ name: string; code: string }> = [];
  const rowPattern =
    /<tr>\s*<td>([\s\S]*?)<\/td>[\s\S]*?<td[\s\S]*?<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;

  let match = rowPattern.exec(html);

  while (match) {
    const name = stripHtmlTags(match[1] ?? "");
    const code = normalizeKrCode(stripHtmlTags(match[2] ?? ""));

    if (name && code) {
      rows.push({ name, code });
    }

    match = rowPattern.exec(html);
  }

  return rows;
}

async function loadKrxCompanyEntries(): Promise<Array<{ name: string; code: string }>> {
  if (krxCompanyCache && Date.now() < krxCompanyCache.expiresAt) {
    return krxCompanyCache.entries;
  }

  const response = await fetch(
    "https://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13",
    {
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new QuoteLookupError("BAD_RESPONSE", `KRX list request failed (${response.status})`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const html = iconv.decode(bytes, "euc-kr");
  const entries = parseKrxCompanyEntries(html);

  if (entries.length === 0) {
    throw new QuoteLookupError("BAD_RESPONSE", "KRX list is empty");
  }

  krxCompanyCache = {
    expiresAt: Date.now() + KRX_COMPANY_CACHE_TTL_MS,
    entries,
  };

  return entries;
}

async function resolveKrCodeByName(
  tickerInput: string,
): Promise<{ name: string; code: string } | null> {
  const normalizedInput = normalizeNameToken(tickerInput);

  if (!normalizedInput) {
    return null;
  }

  const entries = await loadKrxCompanyEntries();
  const exactMatch = entries.find(
    (entry) => normalizeNameToken(entry.name) === normalizedInput,
  );

  if (exactMatch) {
    return exactMatch;
  }

  const partialMatch = entries.find((entry) => {
    const token = normalizeNameToken(entry.name);
    return token.includes(normalizedInput) || normalizedInput.includes(token);
  });

  return partialMatch ?? null;
}

function resolveBestKrRow(
  rows: Array<Record<string, unknown>>,
  query: string,
): Record<string, unknown> | null {
  if (rows.length === 0) {
    return null;
  }

  const trimmedQuery = query.trim();
  const normalizedQuery = normalizeNameToken(trimmedQuery);
  const normalizedCodeQuery = normalizeKrCode(trimmedQuery);
  const isCodeQuery = Boolean(normalizedCodeQuery);

  if (isCodeQuery) {
    const exactCode = rows.find(
      (row) => normalizeKrCode(row.cd) === normalizedCodeQuery,
    );

    if (exactCode) {
      return exactCode;
    }
  }

  const exactName = rows.find(
    (row) => normalizeNameToken(toText(row.nm)) === normalizedQuery,
  );

  if (exactName) {
    return exactName;
  }

  const includedName = rows.find((row) =>
    normalizeNameToken(toText(row.nm)).includes(normalizedQuery),
  );

  if (includedName) {
    return includedName;
  }

  return null;
}

async function fetchKrQuote(
  tickerInput: string,
): Promise<{
  priceInt: number;
  prevCloseInt?: number;
  dayChangePct?: number;
  resolvedName: string;
  resolvedCode: string;
  logoUrl?: string;
  asOf: string;
}> {
  const trimmedInput = tickerInput.trim();

  if (!trimmedInput) {
    throw new QuoteLookupError("NOT_FOUND", "KR ticker is empty");
  }

  const directCode = normalizeKrCode(trimmedInput);

  if (directCode) {
    try {
      const codeRows = await fetchKrSearchRows(directCode, "UTF8");
      const codeMatched = resolveBestKrRow(codeRows, directCode);

      if (codeMatched) {
        debugQuoteRaw("KR_SEARCH_CODE", codeMatched, [
          "nm",
          "cd",
          "nv",
          "pc",
          "prevClose",
          "previousClose",
          "rf",
          "fr",
          "changeRate",
          "fluctuationRate",
        ]);
        const resolvedName = toText(codeMatched.nm) || directCode;
        const resolvedCode = normalizeKrCode(codeMatched.cd) ?? directCode;
        const priceInt = parseKrwPriceInt(codeMatched.nv);

        if (priceInt && priceInt > 0) {
          return ensureKrQuoteMetrics({
            priceInt,
            prevCloseInt: parsePrevCloseIntFromRecord(codeMatched, [
              "pc",
              "prevClose",
              "previousClose",
            ]),
            dayChangePct: parseDayChangePctFromRecord(codeMatched, [
              "rf",
              "fr",
              "changeRate",
              "fluctuationRate",
              "compareToPreviousPriceRate",
              "compareToPreviousClosePriceRate",
            ]),
            resolvedName,
            resolvedCode,
            logoUrl: undefined,
            asOf: new Date().toISOString(),
          });
        }

        return fetchKrBasicQuoteByCode(resolvedCode);
      }
    } catch (error) {
      if (error instanceof QuoteLookupError && error.reason === "RATE_LIMIT") {
        throw error;
      }
    }

    return fetchKrBasicQuoteByCode(directCode);
  }

  let matched: Record<string, unknown> | null = null;

  try {
    const utf8Rows = await fetchKrSearchRows(trimmedInput, "UTF8");
    matched = resolveBestKrRow(utf8Rows, trimmedInput);
  } catch (error) {
    if (error instanceof QuoteLookupError && error.reason === "RATE_LIMIT") {
      throw error;
    }
  }

  if (!matched && !isAsciiOnly(trimmedInput)) {
    try {
      const cp949Rows = await fetchKrSearchRows(trimmedInput, "CP949");
      matched = resolveBestKrRow(cp949Rows, trimmedInput);
    } catch (error) {
      if (error instanceof QuoteLookupError && error.reason === "RATE_LIMIT") {
        throw error;
      }
    }
  }

  if (matched) {
    debugQuoteRaw("KR_SEARCH_NAME", matched, [
      "nm",
      "cd",
      "nv",
      "pc",
      "prevClose",
      "previousClose",
      "rf",
      "fr",
      "changeRate",
      "fluctuationRate",
    ]);
    const resolvedName = toText(matched.nm) || trimmedInput;
    const resolvedCode = normalizeKrCode(matched.cd);
    const priceInt = parseKrwPriceInt(matched.nv);

    if (priceInt && priceInt > 0) {
      if (resolvedCode) {
        const parsedPrevCloseInt = parsePrevCloseIntFromRecord(matched, [
          "pc",
          "prevClose",
          "previousClose",
        ]);
        let parsedDayChangePct = parseDayChangePctFromRecord(matched, [
          "rf",
          "fr",
          "changeRate",
          "fluctuationRate",
          "compareToPreviousPriceRate",
          "compareToPreviousClosePriceRate",
        ]);

        if (
          parsedDayChangePct === undefined &&
          parsedPrevCloseInt &&
          parsedPrevCloseInt > 0
        ) {
          parsedDayChangePct = ((priceInt - parsedPrevCloseInt) / parsedPrevCloseInt) * 100;
        }

        return ensureKrQuoteMetrics({
          priceInt,
          prevCloseInt: parsedPrevCloseInt,
          dayChangePct: parsedDayChangePct,
          resolvedName,
          resolvedCode,
          logoUrl: undefined,
          asOf: new Date().toISOString(),
        });
      }

      const mappedCode = await resolveKrCodeByName(resolvedName);

      if (mappedCode) {
        return ensureKrQuoteMetrics({
          priceInt,
          prevCloseInt: parsePrevCloseIntFromRecord(matched, [
            "pc",
            "prevClose",
            "previousClose",
          ]),
          dayChangePct: parseDayChangePctFromRecord(matched, [
            "rf",
            "fr",
            "changeRate",
            "fluctuationRate",
            "compareToPreviousPriceRate",
            "compareToPreviousClosePriceRate",
          ]),
          resolvedName,
          resolvedCode: mappedCode.code,
          logoUrl: undefined,
          asOf: new Date().toISOString(),
        });
      }
    }

    if (resolvedCode) {
      return {
        ...(await fetchKrBasicQuoteByCode(resolvedCode)),
        resolvedName,
        resolvedCode,
      };
    }
  }

  const krxEntry = await resolveKrCodeByName(trimmedInput);

  if (krxEntry) {
    const basicQuote = await fetchKrBasicQuoteByCode(krxEntry.code);

    return {
      ...basicQuote,
      resolvedName: basicQuote.resolvedName || krxEntry.name,
      resolvedCode: krxEntry.code,
    };
  }

  throw new QuoteLookupError("NOT_FOUND", "KR ticker not found");
}

export async function GET(request: NextRequest) {
  const tickerRaw =
    request.nextUrl.searchParams.get("ticker")?.trim() ??
    request.nextUrl.searchParams.get("symbol")?.trim();
  const marketRaw = request.nextUrl.searchParams.get("market")?.trim().toUpperCase();

  if (!tickerRaw || !marketRaw) {
    return NextResponse.json(
      {
        ok: false,
        ticker: tickerRaw ?? "",
        tickerInput: tickerRaw ?? "",
        market: "US",
        reason: "BAD_RESPONSE",
        message: "market and ticker query parameters are required",
      } satisfies QuoteFailureResponse,
      { status: 400 },
    );
  }

  if (marketRaw !== "US" && marketRaw !== "KR") {
    return NextResponse.json(
      {
        ok: false,
        ticker: tickerRaw,
        tickerInput: tickerRaw,
        market: "US",
        reason: "BAD_RESPONSE",
        message: "market must be US or KR",
      } satisfies QuoteFailureResponse,
      { status: 400 },
    );
  }

  const tickerInput = tickerRaw.trim();
  const normalizedKrCode = normalizeKrCode(tickerInput);
  const ticker =
    marketRaw === "US"
      ? tickerInput.toUpperCase().replace(/\s+/g, "")
      : normalizedKrCode ?? tickerInput;
  const cached = getCached(marketRaw, ticker);

  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    if (marketRaw === "KR") {
      const quote = await fetchKrQuote(tickerInput);
      const payload: QuoteSuccessResponse = {
        ok: true,
        ticker: quote.resolvedCode ?? tickerInput,
        tickerInput,
        market: "KR",
        currency: "KRW",
        currentPriceInt: quote.priceInt,
        prevCloseInt: quote.prevCloseInt ?? null,
        dayChangePct:
          quote.dayChangePct !== undefined
            ? quote.dayChangePct
            : quote.prevCloseInt && quote.prevCloseInt > 0
              ? ((quote.priceInt - quote.prevCloseInt) / quote.prevCloseInt) * 100
              : null,
        displayName: quote.resolvedName ?? null,
        tickerCode: quote.resolvedCode ?? null,
        logoUrl: quote.logoUrl ?? null,
        price: quote.priceInt,
        priceInt: quote.priceInt,
        prevClose: quote.prevCloseInt ?? null,
        asOf: quote.asOf,
        resolvedName: quote.resolvedName ?? null,
        resolvedCode: quote.resolvedCode ?? null,
      };

      setCached("KR", ticker, payload);

      if (quote.resolvedCode && quote.resolvedCode !== ticker) {
        setCached("KR", quote.resolvedCode, payload);
      }

      return NextResponse.json(payload);
    }

    const quote = await fetchUsQuote(ticker);
    const priceInt = toPriceIntUsd(quote.price);

    if (!Number.isFinite(priceInt) || priceInt <= 0) {
      throw new QuoteLookupError("BAD_RESPONSE", "priceInt conversion failed");
    }

    const safePrevClose =
      typeof quote.prevClose === "number" &&
      Number.isFinite(quote.prevClose) &&
      quote.prevClose > 0
        ? quote.prevClose
        : undefined;
    const safePrevCloseInt =
      typeof safePrevClose === "number" ? toPriceIntUsd(safePrevClose) : null;
    const safeDayChangePct =
      typeof quote.dayChangePct === "number" && Number.isFinite(quote.dayChangePct)
        ? quote.dayChangePct
        : typeof quote.price === "number" &&
            Number.isFinite(quote.price) &&
            typeof safePrevClose === "number" &&
            safePrevClose > 0
          ? ((quote.price - safePrevClose) / safePrevClose) * 100
          : null;
    const safeDisplayName =
      (typeof quote.displayName === "string" && quote.displayName.trim()) ||
      US_DISPLAY_NAME_FALLBACK[ticker] ||
      ticker;

    const payload: QuoteSuccessResponse = {
      ok: true,
      ticker,
      tickerInput,
      market: "US",
      currency: "USD",
      currentPriceInt: priceInt,
      prevCloseInt: safePrevCloseInt,
      dayChangePct: safeDayChangePct,
      displayName: safeDisplayName,
      tickerCode: ticker,
      logoUrl: null,
      price: quote.price,
      priceInt,
      prevClose: safePrevClose ?? null,
      asOf: quote.asOf,
    };

    setCached("US", ticker, payload);

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof QuoteLookupError) {
      return NextResponse.json({
        ok: false,
        ticker,
        tickerInput,
        market: marketRaw,
        reason: error.reason,
        message: error.message,
      } satisfies QuoteFailureResponse);
    }

    const message = error instanceof Error ? error.message : "quote lookup failed";

    return NextResponse.json({
      ok: false,
      ticker,
      tickerInput,
      market: marketRaw,
      reason: "BAD_RESPONSE",
      message,
    } satisfies QuoteFailureResponse);
  }
}
