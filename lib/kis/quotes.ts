import { KisClient } from "@/lib/kis/client";
import { getKisAccessToken } from "@/lib/kis/token";

const DOMESTIC_STOCK_PRICE_TR_ID = "FHKST01010100";
const DOMESTIC_STOCK_PRICE_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-price";
const DOMESTIC_STOCK_PRICE_2_TR_ID = "FHPST01010000";
const DOMESTIC_STOCK_PRICE_2_PATH =
  "/uapi/domestic-stock/v1/quotations/inquire-price-2";
const OVERSEAS_STOCK_PRICE_TR_ID = "HHDFS00000300";
const OVERSEAS_STOCK_PRICE_PATH =
  "/uapi/overseas-price/v1/quotations/price";
const DEFAULT_DEBUG_US_QUOTE_TICKERS = new Set(["CRCA", "TSLA", "MU"]);

interface KisDomesticQuotePayload {
  output?: Record<string, unknown>;
}

interface KisDomesticNxtQuotePayload {
  output?: Record<string, unknown>;
}

interface KisOverseasQuotePayload {
  output?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export interface KisDomesticQuote {
  code: string;
  currentPrice: number;
  prevClose?: number;
  dayChangePct?: number;
  displayName?: string;
  asOf: string;
}

export interface KisOverseasQuote {
  code: string;
  exchange: string;
  currentPrice: number;
  prevClose?: number;
  dayChangePct?: number;
  asOf: string;
}

export interface KisDomesticExtendedQuote {
  code: string;
  extendedPrice: number;
  extendedChangePct?: number;
  extendedSession: "KR_NXT";
  nxtSupported: boolean;
  asOf: string;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function parseText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function toUsdCents(value: number): number {
  return Math.round(value * 100);
}

function calculateDayChangePct(currentPrice: number, prevClose: number): number {
  return Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(4));
}

function shouldDebugOverseasQuote(ticker: string): boolean {
  if (process.env.KIS_DEBUG_US_QUOTE !== "1") {
    return false;
  }

  const configuredTickers = process.env.KIS_DEBUG_US_QUOTE_TICKERS
    ?.split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (configuredTickers && configuredTickers.length > 0) {
    return configuredTickers.includes(ticker);
  }

  return DEFAULT_DEBUG_US_QUOTE_TICKERS.has(ticker);
}

function debugDomesticNxtQuote(code: string, output: Record<string, unknown>): void {
  if (process.env.KIS_DEBUG_EXTENDED_QUOTE !== "1") {
    return;
  }

  console.debug("[kis:domestic-nxt-quote]", {
    code,
    output,
  });
}

function debugDomesticNxtQuoteMapping(
  code: string,
  details: Record<string, unknown>,
): void {
  if (process.env.KIS_DEBUG_EXTENDED_QUOTE !== "1") {
    return;
  }

  console.debug("[kis:domestic-nxt-quote:mapping]", {
    code,
    ...details,
  });
}

function debugOverseasQuoteMapping(
  ticker: string,
  exchange: string,
  rawOutput: Record<string, unknown>,
  details: Record<string, unknown>,
): void {
  if (!shouldDebugOverseasQuote(ticker)) {
    return;
  }

  console.debug("[kis:overseas-quote:mapping]", {
    ticker,
    exchange,
    rawOutput,
    ...details,
  });
}

export function normalizeDomesticStockCode(value: string): string | null {
  const digits = value.replace(/\D/g, "");

  if (!digits || digits.length > 6) {
    return null;
  }

  return digits.padStart(6, "0");
}

export function normalizeUsTicker(value: string): string | null {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export async function fetchDomesticStockQuote(
  code: string,
  client = new KisClient(),
): Promise<KisDomesticQuote> {
  const normalizedCode = normalizeDomesticStockCode(code);

  if (!normalizedCode) {
    throw new Error(`Invalid domestic stock code: ${code}`);
  }

  const accessToken = await getKisAccessToken();
  const payload = await client.request<KisDomesticQuotePayload>({
    path: DOMESTIC_STOCK_PRICE_PATH,
    accessToken,
    trId: DOMESTIC_STOCK_PRICE_TR_ID,
    searchParams: {
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: normalizedCode,
    },
  });

  const output = payload.output ?? {};
  const currentPrice = parseNumber(output.stck_prpr);

  if (!currentPrice || currentPrice <= 0) {
    throw new Error(`KIS quote has invalid current price for ${normalizedCode}`);
  }

  const prevClose = parseNumber(output.stck_sdpr);
  const dayChangePct = parseNumber(output.prdy_ctrt);

  return {
    code: normalizedCode,
    currentPrice: Math.round(currentPrice),
    prevClose:
      typeof prevClose === "number" && prevClose > 0
        ? Math.round(prevClose)
        : undefined,
    dayChangePct:
      typeof dayChangePct === "number" && Number.isFinite(dayChangePct)
        ? dayChangePct
        : undefined,
    displayName: parseText(output.hts_kor_isnm),
    asOf: new Date().toISOString(),
  };
}

export async function fetchKisOverseasQuote(
  ticker: string,
  exchange: string,
  client = new KisClient(),
): Promise<KisOverseasQuote> {
  const symbol = normalizeUsTicker(ticker);
  const normalizedExchange = exchange.trim().toUpperCase();

  if (!symbol) {
    throw new Error(`Invalid US ticker: ${ticker}`);
  }

  if (!/^[A-Z]{3,4}$/.test(normalizedExchange)) {
    throw new Error(`Invalid US exchange code: ${exchange}`);
  }

  const accessToken = await getKisAccessToken();
  const payload = await client.request<KisOverseasQuotePayload>({
    path: OVERSEAS_STOCK_PRICE_PATH,
    accessToken,
    trId: OVERSEAS_STOCK_PRICE_TR_ID,
    searchParams: {
      AUTH: "",
      EXCD: normalizedExchange,
      SYMB: symbol,
    },
  });

  const output = Array.isArray(payload.output)
    ? payload.output[0] ?? {}
    : payload.output ?? {};
  const currentPriceField = "last";
  const prevCloseField = "base";
  const rateChangeField = "rate";
  // KIS [v1_해외주식-009] 해외주식 현재체결가:
  // - last: 현재가
  // - base: 전일종가
  // - rate: 전일 대비율. Used only when base is unavailable.
  const currentPrice = parseNumber(output[currentPriceField]);

  if (!currentPrice || currentPrice <= 0) {
    throw new Error(
      `KIS overseas quote has invalid current price for ${symbol} on ${normalizedExchange}`,
    );
  }

  const prevClose = parseNumber(output[prevCloseField]);
  const rawRate = parseNumber(output[rateChangeField]);
  const currentPriceCents = toUsdCents(currentPrice);

  if (currentPriceCents <= 0) {
    throw new Error(
      `KIS overseas quote has invalid stored current price for ${symbol} on ${normalizedExchange}`,
    );
  }

  const prevCloseCents =
    typeof prevClose === "number" && prevClose > 0
      ? toUsdCents(prevClose)
      : undefined;
  const calculatedDayChangePct =
    typeof prevCloseCents === "number" && prevCloseCents > 0
      ? calculateDayChangePct(currentPriceCents, prevCloseCents)
      : undefined;
  const dayChangePct =
    typeof calculatedDayChangePct === "number" &&
    Number.isFinite(calculatedDayChangePct)
      ? calculatedDayChangePct
      : rawRate;

  debugOverseasQuoteMapping(symbol, normalizedExchange, output, {
    currentPriceField,
    currentPriceRaw: output[currentPriceField],
    currentPriceParsed: currentPrice,
    currentPriceStoredCents: currentPriceCents,
    prevCloseField,
    prevCloseRaw: output[prevCloseField],
    prevCloseParsed: prevClose,
    prevCloseStoredCents: prevCloseCents,
    rateChangeField,
    rateChangeRaw: output[rateChangeField],
    rateChangeParsed: rawRate,
    calculatedDayChangePct,
    finalDayChangePct: dayChangePct,
  });

  return {
    code: symbol,
    exchange: normalizedExchange,
    currentPrice: currentPriceCents,
    prevClose: prevCloseCents,
    dayChangePct:
      typeof dayChangePct === "number" && Number.isFinite(dayChangePct)
        ? dayChangePct
        : undefined,
    asOf: new Date().toISOString(),
  };
}

export async function fetchDomesticExtendedQuote(
  code: string,
): Promise<KisDomesticExtendedQuote | null> {
  const normalizedCode = normalizeDomesticStockCode(code);

  if (!normalizedCode) {
    throw new Error(`Invalid domestic stock code: ${code}`);
  }

  // Deprecated: this used to call KIS [국내주식-076] 시간외현재가
  // (/uapi/domestic-stock/v1/quotations/inquire-overtime-price,
  // FHPST02300000). Do not use 시간외 단일가 fields
  // (ovtm_untp_prpr, ovtm_untp_prdy_ctrt, ovtm_untp_sdpr) for the portfolio
  // "장외 등락률"; that column is now KRX 대비 NXT 괴리율 only.
  return null;
}

export async function fetchDomesticNxtQuote(
  code: string,
  krxCurrentPrice: number,
  client = new KisClient(),
): Promise<KisDomesticExtendedQuote | null> {
  const normalizedCode = normalizeDomesticStockCode(code);

  if (!normalizedCode) {
    throw new Error(`Invalid domestic stock code: ${code}`);
  }

  if (!Number.isFinite(krxCurrentPrice) || krxCurrentPrice <= 0) {
    return null;
  }

  const accessToken = await getKisAccessToken();
  const payload = await client.request<KisDomesticNxtQuotePayload>({
    path: DOMESTIC_STOCK_PRICE_2_PATH,
    accessToken,
    trId: DOMESTIC_STOCK_PRICE_2_TR_ID,
    searchParams: {
      // KIS [v1_국내주식-054] 주식현재가 시세2:
      // - J: KRX, NX: NXT, UN: 통합
      FID_COND_MRKT_DIV_CODE: "NX",
      FID_INPUT_ISCD: normalizedCode,
    },
  });

  const output = payload.output ?? {};
  debugDomesticNxtQuote(normalizedCode, output);

  // KIS [v1_국내주식-054] 주식현재가 시세2 with FID_COND_MRKT_DIV_CODE=NX:
  // - stck_prpr: NXT 현재가
  // - rprs_mrkt_kor_name: 대표 시장 한글 명
  // Portfolio "장외 등락률" = (NXT 현재가 - KRX 현재가) / KRX 현재가 * 100.
  const nxtPrice = parseNumber(output.stck_prpr);

  if (!nxtPrice || nxtPrice <= 0) {
    debugDomesticNxtQuoteMapping(normalizedCode, {
      result: "null",
      reason: "missing or non-positive NXT stck_prpr",
      nxtPriceField: "stck_prpr",
      nxtPrice,
      krxCurrentPrice,
      marketName: parseText(output.rprs_mrkt_kor_name),
    });
    return null;
  }

  const nxtChangePct = Number(
    (((nxtPrice - krxCurrentPrice) / krxCurrentPrice) * 100).toFixed(4),
  );

  debugDomesticNxtQuoteMapping(normalizedCode, {
    result: "mapped",
    nxtPriceField: "stck_prpr",
    nxtPrice,
    krxCurrentPrice,
    nxtChangePct,
    formula: "(nxtPrice - krxCurrentPrice) / krxCurrentPrice * 100",
    marketName: parseText(output.rprs_mrkt_kor_name),
  });

  return {
    code: normalizedCode,
    extendedPrice: Math.round(nxtPrice),
    extendedChangePct: nxtChangePct,
    extendedSession: "KR_NXT",
    nxtSupported: true,
    asOf: new Date().toISOString(),
  };
}
