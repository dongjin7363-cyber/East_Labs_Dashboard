import { PortfolioHolding, PORTFOLIO_SECTORS, PortfolioSector } from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";
import { LocalStorageFinanceRepository } from "@/lib/storage/localStorageRepository";

interface UpsertHoldingOptions {
  isCreate?: boolean;
}

export interface PortfolioRepository {
  getHoldings(): Promise<PortfolioHolding[]>;
  upsertHolding(holding: PortfolioHolding, options?: UpsertHoldingOptions): Promise<void>;
  deleteHolding(id: string): Promise<void>;
}

type RawRecord = Record<string, unknown>;

interface PortfolioHoldingRow {
  id?: string;
  user_id: string;
  market: "KR" | "US";
  ticker: string;
  qty: number;
  avg_price_int: number;
  current_price_int: number;
  sector: string | null;
  kr_code: string | null;
  display_name?: string | null;
  comment?: string | null;
  ticker_code?: string | null;
  logo_url?: string | null;
  updated_at: string;
}

const localFinanceRepository = new LocalStorageFinanceRepository();

function sortByUpdatedAtDesc(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return [...holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeMarket(value: unknown): "KR" | "US" {
  return value === "US" ? "US" : "KR";
}

function normalizeCurrency(value: unknown, market: "KR" | "US"): "KRW" | "USD" {
  if (value === "KRW" || value === "USD") {
    return value;
  }

  return market === "US" ? "USD" : "KRW";
}

function normalizeSector(value: unknown): PortfolioSector {
  if (typeof value !== "string") {
    return "Other";
  }

  const matched = PORTFOLIO_SECTORS.find((sector) => sector === value);

  return matched ?? "Other";
}

function toInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/,/g, "").trim();

    if (!sanitized) {
      return fallback;
    }

    const parsed = Number(sanitized);

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return fallback;
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeKrCode(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z0-9]{1,12}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
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

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  const details = String((error as { details?: unknown }).details ?? "").toLowerCase();
  const hint = String((error as { hint?: unknown }).hint ?? "").toLowerCase();
  const joined = `${message} ${details} ${hint}`;
  const hasExtendedFieldRef =
    joined.includes("display_name") ||
    joined.includes("ticker_code") ||
    joined.includes("logo_url") ||
    joined.includes("comment");
  const hasSchemaFailureHint =
    joined.includes("column") || joined.includes("schema cache");

  return hasExtendedFieldRef && hasSchemaFailureHint;
}

function parseHoldingFromUnknown(raw: unknown, index: number): PortfolioHolding | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
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

  const id =
    typeof input.id === "string" && input.id.trim() !== ""
      ? input.id
      : `legacy-holding-${index}`;
  const updatedAt =
    typeof input.updatedAt === "string" && input.updatedAt.trim() !== ""
      ? input.updatedAt
      : typeof input.updated_at === "string" && input.updated_at.trim() !== ""
        ? input.updated_at
        : new Date().toISOString();
  const priceUpdatedAt =
    typeof input.priceUpdatedAt === "string" && input.priceUpdatedAt.trim() !== ""
      ? input.priceUpdatedAt
      : typeof input.price_updated_at === "string" && input.price_updated_at.trim() !== ""
        ? input.price_updated_at
        : undefined;
  const normalizedKrCode =
    market === "KR"
      ? normalizeKrCode(input.krCode ?? input.kr_code ?? input.ticker_code)
      : undefined;
  const displayName =
    normalizeOptionalText(input.displayName) ??
    normalizeOptionalText(input.display_name) ??
    (typeof input.name === "string" ? normalizeOptionalText(input.name) : undefined);
  const comment = normalizeOptionalText(input.comment);
  const tickerCode = normalizeTickerCode(input.tickerCode ?? input.ticker_code) ?? normalizedKrCode;
  const logoUrl =
    normalizeOptionalText(input.logoUrl) ??
    normalizeOptionalText(input.logo_url);

  return {
    id,
    market,
    currency: normalizeCurrency(input.currency, market),
    ticker,
    displayName,
    comment,
    tickerCode,
    logoUrl,
    krCode: normalizedKrCode,
    quoteDisabled:
      input.quoteDisabled === true || input.quote_disabled === true ? true : undefined,
    sector: normalizeSector(input.sector),
    qty: Math.max(toInt(input.qty, 0), 0),
    avgPrice: Math.max(
      toInt(input.avgPrice ?? input.avg_price_int ?? input.avg_price, 0),
      0,
    ),
    currentPrice: Math.max(
      toInt(input.currentPrice ?? input.current_price_int ?? input.current_price, 0),
      0,
    ),
    priceUpdatedAt,
    updatedAt,
  };
}

function normalizeHoldingForDb(
  holding: PortfolioHolding,
  userId: string,
  includeExtendedColumns: boolean,
  options?: UpsertHoldingOptions,
): PortfolioHoldingRow {
  const ticker = holding.ticker.trim();
  const row: PortfolioHoldingRow = {
    user_id: userId,
    market: holding.market,
    ticker,
    qty: Math.max(toInt(holding.qty, 0), 0),
    avg_price_int: Math.max(toInt(holding.avgPrice, 0), 0),
    current_price_int: Math.max(toInt(holding.currentPrice, 0), 0),
    sector: holding.sector?.trim() ? holding.sector : null,
    kr_code: holding.krCode ?? null,
    updated_at: holding.updatedAt,
  };

  if (includeExtendedColumns) {
    row.display_name = normalizeOptionalText(holding.displayName) ?? null;
    row.comment = normalizeOptionalText(holding.comment) ?? null;
    row.ticker_code = normalizeTickerCode(holding.tickerCode ?? holding.krCode) ?? null;
    row.logo_url = normalizeOptionalText(holding.logoUrl) ?? null;
  }

  if (!options?.isCreate && holding.id.trim() && isValidUuid(holding.id.trim())) {
    row.id = holding.id.trim();
  }

  return row;
}

export class LocalPortfolioRepository implements PortfolioRepository {
  async getHoldings(): Promise<PortfolioHolding[]> {
    return sortByUpdatedAtDesc(localFinanceRepository.getPortfolioHoldings());
  }

  async upsertHolding(holding: PortfolioHolding): Promise<void> {
    const current = localFinanceRepository.getPortfolioHoldings();
    const next = [...current.filter((item) => item.id !== holding.id), holding];
    localFinanceRepository.savePortfolioHoldings(sortByUpdatedAtDesc(next));
  }

  async deleteHolding(id: string): Promise<void> {
    const current = localFinanceRepository.getPortfolioHoldings();
    const next = current.filter((item) => item.id !== id);
    localFinanceRepository.savePortfolioHoldings(sortByUpdatedAtDesc(next));
  }
}

export class SupabasePortfolioRepository implements PortfolioRepository {
  private supportsExtendedColumns: boolean | null = null;

  constructor(private readonly userId: string) {}

  private async detectExtendedColumnsSupport(): Promise<boolean> {
    if (this.supportsExtendedColumns !== null) {
      return this.supportsExtendedColumns;
    }

    const { error } = await supabase
      .from("portfolio_holdings")
      .select("display_name", { head: true, count: "exact" })
      .limit(1);

    if (!error) {
      this.supportsExtendedColumns = true;
      return true;
    }

    if (isMissingColumnError(error)) {
      this.supportsExtendedColumns = false;
      return false;
    }

    throw error;
  }

  async getHoldings(): Promise<PortfolioHolding[]> {
    const supportsExtendedColumns = await this.detectExtendedColumnsSupport();
    const selectColumns = supportsExtendedColumns
      ? "id,user_id,market,ticker,qty,avg_price_int,current_price_int,sector,kr_code,display_name,comment,ticker_code,logo_url,updated_at"
      : "id,user_id,market,ticker,qty,avg_price_int,current_price_int,sector,kr_code,updated_at";
    const { data, error } = await supabase
      .from("portfolio_holdings")
      .select(selectColumns)
      .eq("user_id", this.userId);

    if (error) {
      if (supportsExtendedColumns && isMissingColumnError(error)) {
        this.supportsExtendedColumns = false;
        return this.getHoldings();
      }

      throw error;
    }

    const parsed = (data ?? [])
      .map((row, index) => parseHoldingFromUnknown(row, index))
      .filter((holding): holding is PortfolioHolding => Boolean(holding));

    return sortByUpdatedAtDesc(parsed);
  }

  async upsertHolding(
    holding: PortfolioHolding,
    options?: UpsertHoldingOptions,
  ): Promise<void> {
    const supportsExtendedColumns = await this.detectExtendedColumnsSupport();
    const payload = normalizeHoldingForDb(
      holding,
      this.userId,
      supportsExtendedColumns,
      options,
    );
    let { error } = await supabase
      .from("portfolio_holdings")
      .upsert([payload], { onConflict: "id" });

    if (error && supportsExtendedColumns && isMissingColumnError(error)) {
      this.supportsExtendedColumns = false;
      const fallbackPayload = normalizeHoldingForDb(
        holding,
        this.userId,
        false,
        options,
      );
      const fallbackResult = await supabase
        .from("portfolio_holdings")
        .upsert([fallbackPayload], { onConflict: "id" });
      error = fallbackResult.error;
    }

    if (error) {
      throw error;
    }
  }

  async deleteHolding(id: string): Promise<void> {
    const { error } = await supabase
      .from("portfolio_holdings")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createPortfolioRepository(userId?: string | null): PortfolioRepository {
  if (userId) {
    return new SupabasePortfolioRepository(userId);
  }

  return new LocalPortfolioRepository();
}

export function normalizePortfolioHoldingRecord(
  raw: unknown,
  index: number,
): PortfolioHolding | null {
  return parseHoldingFromUnknown(raw, index);
}
