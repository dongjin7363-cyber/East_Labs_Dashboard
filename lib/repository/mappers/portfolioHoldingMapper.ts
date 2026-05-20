import {
  Currency,
  ExtendedSession,
  EXTENDED_SESSIONS,
  Market,
  PortfolioHolding,
  PORTFOLIO_POSITIONS,
  PORTFOLIO_SECTORS,
  PortfolioPosition,
  PortfolioSector,
} from "@/lib/models/types";
import {
  normalizeIsoString,
  normalizeOptionalText,
  normalizeUppercaseText,
  toFiniteNumber,
  toNonNegativeInt,
} from "@/lib/repository/mappers/common";

export interface PortfolioHoldingRow {
  id?: string;
  user_id: string;
  market: "KR" | "US";
  ticker: string;
  ticker_code: string | null;
  kr_code?: string | null;
  is_credit?: boolean | null;
  display_name: string | null;
  logo_url: string | null;
  qty: number;
  avg_price_int: number;
  current_price_int: number;
  prev_close_int?: number | null;
  day_change_pct?: number | null;
  price_updated_at?: string | null;
  extended_price?: number | null;
  extended_change_pct?: number | null;
  extended_session?: string | null;
  extended_updated_at?: string | null;
  nxt_price?: number | null;
  nxt_change_pct?: number | null;
  nxt_supported?: boolean | null;
  nxt_updated_at?: string | null;
  after_hours_price?: number | null;
  after_hours_change_pct?: number | null;
  after_hours_updated_at?: string | null;
  comment: string | null;
  sector: string | null;
  position?: string | null;
  updated_at: string;
}

function normalizeMarket(value: unknown): Market {
  return value === "US" ? "US" : "KR";
}

function normalizeCurrency(value: unknown, market: Market): Currency {
  if (value === "KRW" || value === "USD") {
    return value;
  }

  return market === "US" ? "USD" : "KRW";
}

function normalizeSector(value: unknown): PortfolioSector {
  if (typeof value === "string") {
    const matched = PORTFOLIO_SECTORS.find((sector) => sector === value);

    if (matched) {
      return matched;
    }
  }

  return "Other";
}

function normalizePosition(value: unknown): PortfolioPosition {
  if (typeof value === "string") {
    const matched = PORTFOLIO_POSITIONS.find((position) => position === value);

    if (matched) {
      return matched;
    }
  }

  return "N";
}

function normalizeExtendedSession(value: unknown): ExtendedSession | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const matched = EXTENDED_SESSIONS.find((session) => session === value);
  return matched;
}

function resolveTicker(raw: Record<string, unknown>): string | undefined {
  return (
    normalizeOptionalText(raw.ticker) ??
    normalizeOptionalText(raw.symbol) ??
    normalizeOptionalText(raw.name)
  );
}

export function deserializePortfolioHolding(
  raw: unknown,
  index: number,
): PortfolioHolding | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const market = normalizeMarket(input.market);
  const ticker = resolveTicker(input);

  if (!ticker) {
    return null;
  }

  const krCode =
    market === "KR"
      ? normalizeUppercaseText(input.krCode) ??
        normalizeUppercaseText(input.kr_code) ??
        normalizeUppercaseText(input.tickerCode) ??
        normalizeUppercaseText(input.ticker_code) ??
        (/^[A-Z0-9]{1,12}$/.test(ticker.trim().toUpperCase())
          ? ticker.trim().toUpperCase()
          : undefined)
      : undefined;

  const prevCloseValue = toFiniteNumber(
    input.prevClose ?? input.prevCloseInt ?? input.prev_close_int,
  );
  const dayChangeValue = toFiniteNumber(
    input.dayChangePct ?? input.day_change_pct,
  );
  const extendedPriceValue = toFiniteNumber(
    input.extendedPrice ??
      input.extended_price ??
      input.afterHoursPrice ??
      input.after_hours_price,
  );
  const extendedChangeValue = toFiniteNumber(
    input.extendedChangePct ??
      input.extended_change_pct ??
      input.afterHoursChangePct ??
      input.after_hours_change_pct,
  );
  const afterHoursPriceValue = toFiniteNumber(
    input.afterHoursPrice ?? input.after_hours_price,
  );
  const afterHoursChangeValue = toFiniteNumber(
    input.afterHoursChangePct ?? input.after_hours_change_pct,
  );
  const nxtPriceValue = toFiniteNumber(input.nxtPrice ?? input.nxt_price);
  const nxtChangeValue = toFiniteNumber(
    input.nxtChangePct ?? input.nxt_change_pct,
  );

  return {
    id: normalizeOptionalText(input.id) ?? `portfolio-holding-${index}`,
    market,
    currency: normalizeCurrency(input.currency, market),
    ticker: ticker.trim(),
    tickerCode:
      normalizeUppercaseText(input.tickerCode) ??
      normalizeUppercaseText(input.ticker_code) ??
      krCode,
    displayName:
      normalizeOptionalText(input.displayName) ??
      normalizeOptionalText(input.display_name) ??
      normalizeOptionalText(input.stockName) ??
      normalizeOptionalText(input.stock_name) ??
      normalizeOptionalText(input.symbolName) ??
      normalizeOptionalText(input.symbol_name) ??
      normalizeOptionalText(input.title) ??
      normalizeOptionalText(input.name),
    logoUrl:
      normalizeOptionalText(input.logoUrl) ??
      normalizeOptionalText(input.logo_url),
    comment: normalizeOptionalText(input.comment),
    krCode,
    quoteDisabled:
      input.quoteDisabled === true || input.quote_disabled === true || input.isCustom === true
        ? true
        : undefined,
    isCredit:
      input.isCredit === true ||
      input.is_credit === true ||
      input.credit === true,
    sector: normalizeSector(input.sector),
    position: normalizePosition(input.position),
    qty: toNonNegativeInt(input.qty),
    avgPrice: toNonNegativeInt(input.avgPrice ?? input.avg_price_int),
    currentPrice: toNonNegativeInt(
      input.currentPrice ?? input.current_price_int ?? input.current_price,
    ),
    prevClose:
      typeof prevCloseValue === "number" && Number.isFinite(prevCloseValue)
        ? Math.max(Math.round(prevCloseValue), 0)
        : undefined,
    dayChangePct:
      typeof dayChangeValue === "number" && Number.isFinite(dayChangeValue)
        ? dayChangeValue
        : undefined,
    priceUpdatedAt:
      normalizeOptionalText(input.priceUpdatedAt) ??
      normalizeOptionalText(input.price_updated_at),
    extendedPrice:
      typeof extendedPriceValue === "number" && Number.isFinite(extendedPriceValue)
        ? extendedPriceValue
        : undefined,
    extendedChangePct:
      typeof extendedChangeValue === "number" && Number.isFinite(extendedChangeValue)
        ? extendedChangeValue
        : undefined,
    extendedSession: normalizeExtendedSession(
      input.extendedSession ?? input.extended_session,
    ),
    extendedUpdatedAt:
      normalizeOptionalText(input.extendedUpdatedAt) ??
      normalizeOptionalText(input.extended_updated_at) ??
      normalizeOptionalText(input.afterHoursUpdatedAt) ??
      normalizeOptionalText(input.after_hours_updated_at),
    nxtPrice:
      typeof nxtPriceValue === "number" && Number.isFinite(nxtPriceValue)
        ? nxtPriceValue
        : undefined,
    nxtChangePct:
      typeof nxtChangeValue === "number" && Number.isFinite(nxtChangeValue)
        ? nxtChangeValue
        : undefined,
    nxtSupported:
      input.nxtSupported === true || input.nxt_supported === true
        ? true
        : input.nxtSupported === false || input.nxt_supported === false
          ? false
          : undefined,
    nxtUpdatedAt:
      normalizeOptionalText(input.nxtUpdatedAt) ??
      normalizeOptionalText(input.nxt_updated_at),
    afterHoursPrice:
      typeof afterHoursPriceValue === "number" && Number.isFinite(afterHoursPriceValue)
        ? afterHoursPriceValue
        : undefined,
    afterHoursChangePct:
      typeof afterHoursChangeValue === "number" &&
      Number.isFinite(afterHoursChangeValue)
        ? afterHoursChangeValue
        : undefined,
    afterHoursUpdatedAt:
      normalizeOptionalText(input.afterHoursUpdatedAt) ??
      normalizeOptionalText(input.after_hours_updated_at),
    updatedAt: normalizeIsoString(input.updatedAt ?? input.updated_at),
  };
}

export function serializePortfolioHoldingForStorage(
  holding: PortfolioHolding,
): PortfolioHolding {
  return {
    id: holding.id,
    market: holding.market,
    currency: holding.currency,
    ticker: holding.ticker.trim(),
    tickerCode: normalizeUppercaseText(holding.tickerCode ?? holding.krCode),
    displayName: normalizeOptionalText(holding.displayName),
    logoUrl: normalizeOptionalText(holding.logoUrl),
    comment: normalizeOptionalText(holding.comment),
    krCode:
      holding.market === "KR"
        ? normalizeUppercaseText(holding.krCode ?? holding.tickerCode)
        : undefined,
    quoteDisabled: holding.quoteDisabled ? true : undefined,
    isCredit: holding.isCredit === true,
    sector: normalizeSector(holding.sector),
    position: normalizePosition(holding.position),
    qty: toNonNegativeInt(holding.qty),
    avgPrice: toNonNegativeInt(holding.avgPrice),
    currentPrice: toNonNegativeInt(holding.currentPrice),
    prevClose:
      typeof holding.prevClose === "number" && Number.isFinite(holding.prevClose)
        ? Math.max(Math.round(holding.prevClose), 0)
        : undefined,
    dayChangePct:
      typeof holding.dayChangePct === "number" && Number.isFinite(holding.dayChangePct)
        ? holding.dayChangePct
        : undefined,
    priceUpdatedAt: normalizeOptionalText(holding.priceUpdatedAt),
    extendedPrice:
      typeof holding.extendedPrice === "number" && Number.isFinite(holding.extendedPrice)
        ? holding.extendedPrice
        : undefined,
    extendedChangePct:
      typeof holding.extendedChangePct === "number" &&
      Number.isFinite(holding.extendedChangePct)
        ? holding.extendedChangePct
        : undefined,
    extendedSession: normalizeExtendedSession(holding.extendedSession),
    extendedUpdatedAt: normalizeOptionalText(holding.extendedUpdatedAt),
    nxtPrice:
      typeof holding.nxtPrice === "number" && Number.isFinite(holding.nxtPrice)
        ? holding.nxtPrice
        : undefined,
    nxtChangePct:
      typeof holding.nxtChangePct === "number" && Number.isFinite(holding.nxtChangePct)
        ? holding.nxtChangePct
        : undefined,
    nxtSupported:
      typeof holding.nxtSupported === "boolean" ? holding.nxtSupported : undefined,
    nxtUpdatedAt: normalizeOptionalText(holding.nxtUpdatedAt),
    afterHoursPrice:
      typeof holding.afterHoursPrice === "number" &&
      Number.isFinite(holding.afterHoursPrice)
        ? holding.afterHoursPrice
        : undefined,
    afterHoursChangePct:
      typeof holding.afterHoursChangePct === "number" &&
      Number.isFinite(holding.afterHoursChangePct)
        ? holding.afterHoursChangePct
        : undefined,
    afterHoursUpdatedAt: normalizeOptionalText(holding.afterHoursUpdatedAt),
    updatedAt: normalizeIsoString(holding.updatedAt),
  };
}

export function serializePortfolioHoldingRow(
  holding: PortfolioHolding,
  userId: string,
  options?: { isCreate?: boolean },
): PortfolioHoldingRow {
  const row: PortfolioHoldingRow = {
    user_id: userId,
    market: holding.market,
    ticker: holding.ticker.trim(),
    ticker_code:
      normalizeUppercaseText(holding.tickerCode ?? holding.krCode) ?? null,
    kr_code:
      holding.market === "KR"
        ? normalizeUppercaseText(holding.krCode ?? holding.tickerCode) ?? null
        : null,
    is_credit: holding.isCredit === true,
    display_name: normalizeOptionalText(holding.displayName) ?? null,
    logo_url: normalizeOptionalText(holding.logoUrl) ?? null,
    qty: toNonNegativeInt(holding.qty),
    avg_price_int: toNonNegativeInt(holding.avgPrice),
    current_price_int: toNonNegativeInt(holding.currentPrice),
    prev_close_int:
      typeof holding.prevClose === "number" && Number.isFinite(holding.prevClose)
        ? toNonNegativeInt(holding.prevClose)
        : null,
    day_change_pct:
      typeof holding.dayChangePct === "number" && Number.isFinite(holding.dayChangePct)
        ? holding.dayChangePct
        : null,
    price_updated_at: normalizeOptionalText(holding.priceUpdatedAt) ?? null,
    extended_price:
      typeof holding.extendedPrice === "number" && Number.isFinite(holding.extendedPrice)
        ? holding.extendedPrice
        : null,
    extended_change_pct:
      typeof holding.extendedChangePct === "number" &&
      Number.isFinite(holding.extendedChangePct)
        ? holding.extendedChangePct
        : null,
    extended_session: normalizeExtendedSession(holding.extendedSession) ?? null,
    extended_updated_at: normalizeOptionalText(holding.extendedUpdatedAt) ?? null,
    nxt_price:
      typeof holding.nxtPrice === "number" && Number.isFinite(holding.nxtPrice)
        ? holding.nxtPrice
        : null,
    nxt_change_pct:
      typeof holding.nxtChangePct === "number" && Number.isFinite(holding.nxtChangePct)
        ? holding.nxtChangePct
        : null,
    nxt_supported:
      typeof holding.nxtSupported === "boolean" ? holding.nxtSupported : null,
    nxt_updated_at: normalizeOptionalText(holding.nxtUpdatedAt) ?? null,
    after_hours_price:
      typeof holding.afterHoursPrice === "number" &&
      Number.isFinite(holding.afterHoursPrice)
        ? holding.afterHoursPrice
        : null,
    after_hours_change_pct:
      typeof holding.afterHoursChangePct === "number" &&
      Number.isFinite(holding.afterHoursChangePct)
        ? holding.afterHoursChangePct
        : null,
    after_hours_updated_at: normalizeOptionalText(holding.afterHoursUpdatedAt) ?? null,
    comment: normalizeOptionalText(holding.comment) ?? null,
    sector: normalizeOptionalText(holding.sector) ?? "Other",
    position: normalizePosition(holding.position),
    updated_at: normalizeIsoString(holding.updatedAt),
  };

  if (!options?.isCreate && holding.id.trim()) {
    row.id = holding.id.trim();
  }

  return row;
}
