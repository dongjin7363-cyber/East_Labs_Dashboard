import {
  Currency,
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
  display_name: string | null;
  logo_url: string | null;
  qty: number;
  avg_price_int: number;
  current_price_int: number;
  prev_close_int?: number | null;
  day_change_pct?: number | null;
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
    sector: normalizeSector(input.sector),
    position: normalizePosition(input.position),
    qty: toNonNegativeInt(input.qty),
    avgPrice: toNonNegativeInt(input.avgPrice ?? input.avg_price_int),
    currentPrice: toNonNegativeInt(input.currentPrice ?? input.current_price_int),
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
