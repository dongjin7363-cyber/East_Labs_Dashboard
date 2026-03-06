import {
  CashTransaction,
  Currency,
  Market,
  PortfolioHolding,
  PORTFOLIO_SECTORS,
  PortfolioSector,
  StorageSchema,
} from "@/lib/models/types";
import { FinanceRepository } from "@/lib/storage/repository";

const STORAGE_KEY = "personal-finance-dashboard";
const SCHEMA_VERSION = 1;

function createEmptySchema(): StorageSchema {
  return {
    schemaVersion: SCHEMA_VERSION,
    portfolioHoldings: [],
    cashTransactions: [],
    updatedAt: new Date().toISOString(),
  };
}

function isClient(): boolean {
  return typeof window !== "undefined";
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

function toNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function normalizeKrCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (/^[A-Z0-9]{1,12}$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized;
}

function normalizeTickerCode(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return undefined;
  }

  return normalized.toUpperCase();
}

function normalizePortfolioHolding(raw: unknown, index: number): PortfolioHolding | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const market = normalizeMarket(input.market);
  const tickerRaw =
    typeof input.ticker === "string"
      ? input.ticker
      : typeof input.symbol === "string"
        ? input.symbol
        : typeof input.name === "string"
          ? input.name
          : "";
  const ticker = tickerRaw.trim();

  if (!ticker) {
    return null;
  }

  const krCode =
    market === "KR"
      ? normalizeKrCode(input.krCode) ??
        normalizeKrCode(input.kr_code) ??
        normalizeKrCode(input.tickerCode) ??
        normalizeKrCode(input.ticker_code) ??
        normalizeKrCode(ticker)
      : undefined;
  const displayName =
    normalizeOptionalText(input.displayName) ??
    normalizeOptionalText(input.display_name) ??
    (typeof input.name === "string" ? normalizeOptionalText(input.name) : undefined);
  const tickerCode =
    normalizeTickerCode(input.tickerCode) ??
    normalizeTickerCode(input.ticker_code) ??
    krCode;
  const logoUrl =
    normalizeOptionalText(input.logoUrl) ??
    normalizeOptionalText(input.logo_url);
  const comment = normalizeOptionalText(input.comment);

  const id =
    typeof input.id === "string" && input.id.trim() !== ""
      ? input.id
      : `legacy-holding-${index}`;
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim() !== ""
      ? input.updatedAt
      : new Date().toISOString();
  const priceUpdatedAt =
    typeof input.priceUpdatedAt === "string" && input.priceUpdatedAt.trim() !== ""
      ? input.priceUpdatedAt
      : undefined;
  const prevCloseValue = Math.max(
    Math.round(toNumber(input.prevClose ?? input.prev_close_int, 0)),
    0,
  );
  const dayChangeRaw = input.dayChangePct ?? input.day_change_pct;
  const dayChangeCandidate =
    typeof dayChangeRaw === "string"
      ? Number(dayChangeRaw.replace(/[,%\s]/g, ""))
      : toNumber(dayChangeRaw, Number.NaN);

  return {
    id,
    market,
    currency: normalizeCurrency(input.currency, market),
    ticker,
    displayName,
    comment,
    tickerCode,
    logoUrl,
    krCode,
    quoteDisabled:
      input.quoteDisabled === true || input.isCustom === true ? true : undefined,
    sector: normalizeSector(input.sector),
    qty: Math.max(Math.round(toNumber(input.qty, 0)), 0),
    avgPrice: Math.max(Math.round(toNumber(input.avgPrice, 0)), 0),
    currentPrice: Math.max(Math.round(toNumber(input.currentPrice, 0)), 0),
    prevClose: prevCloseValue > 0 ? prevCloseValue : undefined,
    dayChangePct: Number.isFinite(dayChangeCandidate) ? dayChangeCandidate : undefined,
    priceUpdatedAt,
    updatedAt,
  };
}

function normalizeSchema(raw: unknown): StorageSchema {
  if (!raw || typeof raw !== "object") {
    return createEmptySchema();
  }

  const data = raw as Partial<StorageSchema>;

  if (data.schemaVersion !== SCHEMA_VERSION) {
    return createEmptySchema();
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    portfolioHoldings: Array.isArray(data.portfolioHoldings)
      ? data.portfolioHoldings
          .map((holding, index) => normalizePortfolioHolding(holding, index))
          .filter((holding): holding is PortfolioHolding => Boolean(holding))
      : [],
    cashTransactions: Array.isArray(data.cashTransactions)
      ? (data.cashTransactions as CashTransaction[])
      : [],
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
  };
}

function readSchema(): StorageSchema {
  if (!isClient()) {
    return createEmptySchema();
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return createEmptySchema();
    }

    return normalizeSchema(JSON.parse(raw));
  } catch {
    return createEmptySchema();
  }
}

function writeSchema(schema: StorageSchema): void {
  if (!isClient()) {
    return;
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...schema, updatedAt: new Date().toISOString() }),
  );
}

export class LocalStorageFinanceRepository implements FinanceRepository {
  getPortfolioHoldings(): PortfolioHolding[] {
    return readSchema().portfolioHoldings;
  }

  savePortfolioHoldings(holdings: PortfolioHolding[]): void {
    const current = readSchema();
    const normalized = holdings
      .map((holding, index) => normalizePortfolioHolding(holding, index))
      .filter((holding): holding is PortfolioHolding => Boolean(holding));
    writeSchema({ ...current, portfolioHoldings: normalized });
  }

  getCashTransactions(): CashTransaction[] {
    return readSchema().cashTransactions;
  }

  saveCashTransactions(transactions: CashTransaction[]): void {
    const current = readSchema();
    writeSchema({ ...current, cashTransactions: transactions });
  }

  resetAll(): void {
    writeSchema(createEmptySchema());
  }
}

export const storageMeta = {
  key: STORAGE_KEY,
  schemaVersion: SCHEMA_VERSION,
};
