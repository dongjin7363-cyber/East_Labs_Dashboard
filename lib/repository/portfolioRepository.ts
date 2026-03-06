import { PortfolioHolding } from "@/lib/models/types";
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

interface PortfolioHoldingRow {
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
  comment: string | null;
  sector: string | null;
  updated_at: string;
}

const localRepository = new LocalStorageFinanceRepository();

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value.replace(/,/g, "").trim(), 10);

    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.round(parsed);
    }
  }

  return 0;
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

function normalizeHolding(raw: unknown, index: number): PortfolioHolding | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const market = input.market === "US" ? "US" : "KR";
  const tickerRaw =
    normalizeOptionalText(input.ticker) ??
    normalizeOptionalText(input.symbol) ??
    normalizeOptionalText(input.name) ??
    "";
  const ticker = tickerRaw.trim();

  if (!ticker) {
    return null;
  }

  return {
    id:
      normalizeOptionalText(input.id) ??
      `portfolio-holding-${index}`,
    market,
    currency: market === "US" ? "USD" : "KRW",
    ticker,
    tickerCode:
      normalizeTickerCode(input.ticker_code) ??
      normalizeTickerCode(input.tickerCode),
    displayName:
      normalizeOptionalText(input.display_name) ??
      normalizeOptionalText(input.displayName),
    logoUrl:
      normalizeOptionalText(input.logo_url) ??
      normalizeOptionalText(input.logoUrl),
    comment: normalizeOptionalText(input.comment),
    krCode:
      market === "KR"
        ? normalizeTickerCode(input.kr_code) ??
          normalizeTickerCode(input.krCode) ??
          normalizeTickerCode(input.ticker_code)
        : undefined,
    sector:
      normalizeOptionalText(input.sector) as PortfolioHolding["sector"] | undefined ??
      "Other",
    quoteDisabled:
      input.quoteDisabled === true || input.quote_disabled === true ? true : undefined,
    qty: toInt(input.qty),
    avgPrice: toInt(input.avg_price_int ?? input.avgPrice),
    currentPrice: toInt(input.current_price_int ?? input.currentPrice),
    priceUpdatedAt:
      normalizeOptionalText(input.price_updated_at) ??
      normalizeOptionalText(input.priceUpdatedAt),
    updatedAt:
      normalizeOptionalText(input.updated_at) ??
      normalizeOptionalText(input.updatedAt) ??
      new Date().toISOString(),
  };
}

function sortByUpdatedAtDesc(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return [...holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mapHoldingToRow(
  holding: PortfolioHolding,
  userId: string,
  options?: UpsertHoldingOptions,
): PortfolioHoldingRow {
  const row: PortfolioHoldingRow = {
    user_id: userId,
    market: holding.market,
    ticker: holding.ticker.trim(),
    ticker_code:
      normalizeTickerCode(holding.tickerCode ?? holding.krCode) ?? null,
    display_name: normalizeOptionalText(holding.displayName) ?? null,
    logo_url: normalizeOptionalText(holding.logoUrl) ?? null,
    qty: toInt(holding.qty),
    avg_price_int: toInt(holding.avgPrice),
    current_price_int: toInt(holding.currentPrice),
    comment: normalizeOptionalText(holding.comment) ?? null,
    sector: normalizeOptionalText(holding.sector) ?? "Other",
    updated_at: holding.updatedAt || new Date().toISOString(),
  };

  if (!options?.isCreate && holding.id.trim()) {
    row.id = holding.id.trim();
  }

  return row;
}

export class LocalPortfolioRepository implements PortfolioRepository {
  async getHoldings(): Promise<PortfolioHolding[]> {
    return sortByUpdatedAtDesc(localRepository.getPortfolioHoldings());
  }

  async upsertHolding(holding: PortfolioHolding): Promise<void> {
    const current = localRepository.getPortfolioHoldings();
    const next = [...current.filter((item) => item.id !== holding.id), holding];
    localRepository.savePortfolioHoldings(sortByUpdatedAtDesc(next));
  }

  async deleteHolding(id: string): Promise<void> {
    const current = localRepository.getPortfolioHoldings();
    const next = current.filter((item) => item.id !== id);
    localRepository.savePortfolioHoldings(sortByUpdatedAtDesc(next));
  }
}

export class SupabasePortfolioRepository implements PortfolioRepository {
  constructor(private readonly userId: string) {}

  async getHoldings(): Promise<PortfolioHolding[]> {
    const { data, error } = await supabase
      .from("portfolio_holdings")
      .select("*")
      .eq("user_id", this.userId);

    if (error) {
      console.error("portfolio_holdings load error", error);
      throw error;
    }

    const parsed = (data ?? [])
      .map((row, index) => normalizeHolding(row, index))
      .filter((holding): holding is PortfolioHolding => Boolean(holding));

    return sortByUpdatedAtDesc(parsed);
  }

  async upsertHolding(
    holding: PortfolioHolding,
    options?: UpsertHoldingOptions,
  ): Promise<void> {
    const row = mapHoldingToRow(holding, this.userId, options);
    const { error } = await supabase
      .from("portfolio_holdings")
      .upsert([row], { onConflict: "id" });

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
