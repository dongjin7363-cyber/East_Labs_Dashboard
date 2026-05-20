import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchDomesticNxtQuote,
  fetchDomesticStockQuote,
  normalizeDomesticStockCode,
} from "@/lib/kis/quotes";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

const KIS_QUOTE_REQUEST_DELAY_MS = 350;
const KIS_RATE_LIMIT_RETRY_DELAYS_MS = [1000, 2000] as const;

type Market = "KR" | "US";

interface PortfolioHoldingQuoteRow {
  id: string;
  user_id: string;
  market: Market;
  ticker: string;
  ticker_code: string | null;
  current_price_int: number | null;
  quote_disabled?: boolean | null;
}

interface DomesticExtendedQuoteUpdate {
  extendedPrice?: number;
  extendedChangePct?: number;
  extendedSession: "KR_NXT" | "NONE";
  nxtSupported: boolean;
  asOf: string;
}

export interface QuoteUpdateSuccess {
  id: string;
  ticker: string;
  code: string;
  currentPrice: number;
}

export interface QuoteUpdateFailure {
  id?: string;
  ticker: string;
  reason: string;
}

export interface ExtendedQuoteUpdateSummary {
  requested: boolean;
  schemaReady: boolean;
  updated: number;
  nullCount: number;
  failed: QuoteUpdateFailure[];
}

export interface UpdatePortfolioQuotesOptions {
  userId?: string;
  supabase?: SupabaseClient;
  includeExtended?: boolean;
}

export interface UpdatePortfolioQuotesResult {
  ok: boolean;
  scanned: number;
  updated: QuoteUpdateSuccess[];
  failed: QuoteUpdateFailure[];
  skipped: QuoteUpdateFailure[];
  extended: ExtendedQuoteUpdateSummary;
  startedAt: string;
  finishedAt: string;
}

function resolveDomesticCode(row: PortfolioHoldingQuoteRow): string | null {
  const candidates = [row.ticker_code, row.ticker];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }

    const normalized = normalizeDomesticStockCode(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isKisRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return /초당\s*거래건수를\s*초과|rate\s*limit|too\s*many\s*requests|EGW00201/i.test(
    message,
  );
}

async function fetchDomesticStockQuoteWithRetry(
  code: string,
): Promise<Awaited<ReturnType<typeof fetchDomesticStockQuote>>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= KIS_RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fetchDomesticStockQuote(code);
    } catch (error) {
      lastError = error;

      if (
        attempt >= KIS_RATE_LIMIT_RETRY_DELAYS_MS.length ||
        !isKisRateLimitError(error)
      ) {
        throw error;
      }

      await sleep(KIS_RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("KIS quote request failed");
}

async function fetchDomesticNxtQuoteWithRetry(
  code: string,
  krxCurrentPrice: number,
): Promise<Awaited<ReturnType<typeof fetchDomesticNxtQuote>>> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= KIS_RATE_LIMIT_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await fetchDomesticNxtQuote(code, krxCurrentPrice);
    } catch (error) {
      lastError = error;

      if (
        attempt >= KIS_RATE_LIMIT_RETRY_DELAYS_MS.length ||
        !isKisRateLimitError(error)
      ) {
        throw error;
      }

      await sleep(KIS_RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("KIS NXT quote request failed");
}

async function fetchDomesticExtendedQuoteSafely(
  code: string,
  krxCurrentPrice: number,
): Promise<DomesticExtendedQuoteUpdate | null> {
  const quote = await fetchDomesticNxtQuoteWithRetry(code, krxCurrentPrice);

  if (!quote) {
    if (process.env.KIS_DEBUG_EXTENDED_QUOTE === "1") {
      console.debug("[quotes:update] NXT quote is null", {
        code,
        reason: "KIS NXT response did not contain a positive stck_prpr value",
      });
    }

    return null;
  }

  return {
    extendedPrice: quote.extendedPrice,
    extendedChangePct: quote.extendedChangePct,
    extendedSession: quote.extendedSession,
    nxtSupported: quote.nxtSupported,
    asOf: quote.asOf,
  };
}

async function checkExtendedQuoteColumns(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase
    .from("portfolio_holdings")
    .select(
      "extended_price,extended_change_pct,extended_session,extended_updated_at",
    )
    .limit(1);

  if (!error) {
    return true;
  }

  if (!isMissingColumnError(error)) {
    throw error;
  }

  console.warn("[quotes:update] extended quote columns are missing", {
    reason: error.message,
    requiredColumns: [
      "extended_price",
      "extended_change_pct",
      "extended_session",
      "extended_updated_at",
    ],
    migration: "supabase/sql/portfolio_quote_columns.sql",
  });

  return false;
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";

  return code === "PGRST204" || /column|schema cache/i.test(message);
}

async function updateHoldingQuoteRow(
  supabase: SupabaseClient,
  row: PortfolioHoldingQuoteRow,
  quote: Awaited<ReturnType<typeof fetchDomesticStockQuote>>,
  extendedQuote?: DomesticExtendedQuoteUpdate | null,
): Promise<void> {
  const asOf = quote.asOf;
  const fullPayload = {
    ticker_code: quote.code,
    current_price_int: quote.currentPrice,
    prev_close_int: quote.prevClose ?? null,
    day_change_pct: quote.dayChangePct ?? null,
    display_name: quote.displayName ?? row.ticker,
    price_updated_at: asOf,
    updated_at: asOf,
    ...(extendedQuote
      ? {
          // extended_* are NXT/KRX divergence fields for the portfolio UI.
          // They must not contain KIS 시간외 단일가 values.
          extended_price: extendedQuote.extendedPrice ?? null,
          extended_change_pct: extendedQuote.extendedChangePct ?? null,
          extended_session: extendedQuote.extendedSession,
          extended_updated_at: extendedQuote.asOf,
        }
      : {}),
  };
  const { error } = await supabase
    .from("portfolio_holdings")
    .update(fullPayload)
    .eq("id", row.id);

  if (!error) {
    return;
  }

  if (!isMissingColumnError(error)) {
    throw error;
  }

  const compatiblePayload = {
    ticker_code: quote.code,
    current_price_int: quote.currentPrice,
    prev_close_int: quote.prevClose ?? null,
    day_change_pct: quote.dayChangePct ?? null,
    display_name: quote.displayName ?? row.ticker,
    price_updated_at: asOf,
    updated_at: asOf,
  };
  const { error: compatibleError } = await supabase
    .from("portfolio_holdings")
    .update(compatiblePayload)
    .eq("id", row.id);

  if (!compatibleError) {
    return;
  }

  if (!isMissingColumnError(compatibleError)) {
    throw compatibleError;
  }

  const { error: fallbackError } = await supabase
    .from("portfolio_holdings")
    .update({
      ticker_code: quote.code,
      current_price_int: quote.currentPrice,
      display_name: quote.displayName ?? row.ticker,
      updated_at: asOf,
    })
    .eq("id", row.id);

  if (fallbackError) {
    throw fallbackError;
  }
}

async function fetchRows(
  supabase: SupabaseClient,
  userId?: string,
): Promise<PortfolioHoldingQuoteRow[]> {
  let query = supabase
    .from("portfolio_holdings")
    .select("id,user_id,market,ticker,ticker_code,current_price_int");

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return (data ?? []) as PortfolioHoldingQuoteRow[];
}

export async function updatePortfolioQuotes(
  options: UpdatePortfolioQuotesOptions = {},
): Promise<UpdatePortfolioQuotesResult> {
  const startedAt = new Date().toISOString();
  const supabase = options.supabase ?? createSupabaseAdminClient();
  const rows = await fetchRows(supabase, options.userId);
  const updated: QuoteUpdateSuccess[] = [];
  const failed: QuoteUpdateFailure[] = [];
  const skipped: QuoteUpdateFailure[] = [];
  const extendedFailed: QuoteUpdateFailure[] = [];
  let extendedUpdated = 0;
  let extendedNullCount = 0;
  let lastKisRequestAt = 0;
  const includeExtended = options.includeExtended ?? true;
  const extendedSchemaReady = includeExtended
    ? await checkExtendedQuoteColumns(supabase)
    : false;
  const waitForKisRequestSlot = async () => {
    const elapsedSinceLastKisRequest = Date.now() - lastKisRequestAt;

    if (
      lastKisRequestAt > 0 &&
      elapsedSinceLastKisRequest < KIS_QUOTE_REQUEST_DELAY_MS
    ) {
      await sleep(KIS_QUOTE_REQUEST_DELAY_MS - elapsedSinceLastKisRequest);
    }

    lastKisRequestAt = Date.now();
  };

  for (const row of rows) {
    if (row.quote_disabled) {
      skipped.push({
        id: row.id,
        ticker: row.ticker,
        reason: "quote disabled",
      });
      continue;
    }

    if (row.market !== "KR") {
      // TODO: Add US, OTC, NXT, and day-market branches after the KR path is stable.
      skipped.push({
        id: row.id,
        ticker: row.ticker,
        reason: "unsupported market",
      });
      continue;
    }

    const code = resolveDomesticCode(row);

    if (!code) {
      failed.push({
        id: row.id,
        ticker: row.ticker,
        reason: "missing 6-digit domestic stock code",
      });
      continue;
    }

    try {
      await waitForKisRequestSlot();
      const quote = await fetchDomesticStockQuoteWithRetry(code);
      let extendedQuote: DomesticExtendedQuoteUpdate | null = null;

      if (includeExtended && extendedSchemaReady) {
        try {
          await waitForKisRequestSlot();
          extendedQuote = await fetchDomesticExtendedQuoteSafely(
            code,
            quote.currentPrice,
          );

          if (extendedQuote) {
            extendedUpdated += 1;
          } else {
            extendedNullCount += 1;
          }
        } catch (error) {
          // Extended-market data is reference-only. Keep the main quote update
          // successful and preserve any existing extended values on failure.
          extendedFailed.push({
            id: row.id,
            ticker: row.ticker,
            reason: error instanceof Error ? error.message : "unknown error",
          });
          console.warn("[quotes:update] extended quote skipped", {
            ticker: row.ticker,
            code,
            reason: error instanceof Error ? error.message : "unknown error",
          });
        }
      }

      await updateHoldingQuoteRow(supabase, row, quote, extendedQuote);

      updated.push({
        id: row.id,
        ticker: row.ticker,
        code: quote.code,
        currentPrice: quote.currentPrice,
      });
    } catch (error) {
      failed.push({
        id: row.id,
        ticker: row.ticker,
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  }

  const finishedAt = new Date().toISOString();

  return {
    ok: failed.length === 0,
    scanned: rows.length,
    updated,
    failed,
    skipped,
    extended: {
      requested: includeExtended,
      schemaReady: extendedSchemaReady,
      updated: extendedUpdated,
      nullCount: extendedNullCount,
      failed: extendedFailed,
    },
    startedAt,
    finishedAt,
  };
}
