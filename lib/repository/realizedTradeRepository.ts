import { Market, RealizedTrade, TradeRating } from "@/lib/models/types";
import { supabase } from "@/lib/supabaseClient";
import {
  listRealizedTrades,
  replaceRealizedTrades,
} from "@/lib/services/realizedTradeService";

interface UpsertTradeOptions {
  isCreate?: boolean;
}

export interface RealizedTradeRepository {
  getTrades(): Promise<RealizedTrade[]>;
  upsertTrade(trade: RealizedTrade, options?: UpsertTradeOptions): Promise<void>;
  deleteTrade(id: string): Promise<void>;
}

export const REALIZED_TRADES_SYNCED_FLAG_KEY = "pf_synced_realized_trades_v1";

type RawRecord = Record<string, unknown>;

interface RealizedTradeRow {
  id?: string;
  user_id: string;
  date: string;
  market: Market;
  ticker: string;
  qty: number;
  buy_price_int: number;
  buy_amount_int: number;
  sell_price_int: number;
  sell_amount_int: number;
  return_pct: number;
  pnl_int: number;
  content: string;
  rating: TradeRating;
  created_at: string;
}

const US_MARKET_SYMBOL_HINTS = new Set([
  "QS",
  "POET",
  "AAPL",
  "TSLA",
  "NVDA",
  "MSFT",
]);

function sortByDateAsc(trades: RealizedTrade[]): RealizedTrade[] {
  return [...trades].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byCreatedAt = a.createdAt.localeCompare(b.createdAt);

    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return a.ticker.localeCompare(b.ticker, "ko-KR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/,/g, "").trim();

    if (!sanitized) {
      return null;
    }

    const parsed = Number(sanitized);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toInt(value: unknown, fallback = 0): number {
  const parsed = toFiniteNumber(value);

  if (parsed === null) {
    return fallback;
  }

  return Math.round(parsed);
}

function toYmd(value: unknown): string {
  if (typeof value === "string") {
    const normalized = value.trim();
    const ymdMatch = normalized.match(/^(\d{4}-\d{2}-\d{2})/);

    if (ymdMatch) {
      return ymdMatch[1];
    }
  }

  return new Date().toISOString().slice(0, 10);
}

function inferMarket(ticker: string): Market {
  const normalizedTicker = ticker.trim().toUpperCase();

  if (US_MARKET_SYMBOL_HINTS.has(normalizedTicker)) {
    return "US";
  }

  if (/^\d{4,6}$/.test(normalizedTicker)) {
    return "KR";
  }

  if (/[가-힣]/.test(normalizedTicker)) {
    return "KR";
  }

  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalizedTicker)) {
    return "US";
  }

  return "KR";
}

function normalizeMarket(value: unknown, ticker: string): Market {
  if (value === "KR" || value === "US") {
    return value;
  }

  return inferMarket(ticker);
}

function normalizeRating(value: unknown): TradeRating {
  if (value === "Best" || value === "Good" || value === "Normal" || value === "Bad") {
    return value;
  }

  return "";
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function normalizeTradeFromUnknown(raw: unknown, index: number): RealizedTrade | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as RawRecord;
  const tickerRaw =
    typeof input.ticker === "string"
      ? input.ticker
      : typeof input.symbol === "string"
        ? input.symbol
        : typeof input.name === "string"
          ? input.name
          : "";
  const ticker = tickerRaw.trim().toUpperCase();

  if (!ticker) {
    return null;
  }

  const market = normalizeMarket(input.market, ticker);
  const qty = Math.max(toInt(input.qty, 0), 0);
  const buyPriceInt = Math.max(
    toInt(input.buyPriceInt ?? input.buy_price_int ?? input.buyPrice ?? input.buy_price, 0),
    0,
  );
  const sellPriceInt = Math.max(
    toInt(input.sellPriceInt ?? input.sell_price_int ?? input.sellPrice ?? input.sell_price, 0),
    0,
  );

  const buyAmountInput = toFiniteNumber(
    input.buyAmountInt ?? input.buy_amount_int ?? input.buyAmount ?? input.buy_amount,
  );
  const sellAmountInput = toFiniteNumber(
    input.sellAmountInt ?? input.sell_amount_int ?? input.sellAmount ?? input.sell_amount,
  );

  const buyAmountInt =
    buyAmountInput !== null && buyAmountInput >= 0
      ? Math.round(buyAmountInput)
      : qty * buyPriceInt;
  const sellAmountInt =
    sellAmountInput !== null && sellAmountInput >= 0
      ? Math.round(sellAmountInput)
      : qty * sellPriceInt;
  const pnlInput = toFiniteNumber(input.pnlInt ?? input.pnl_int ?? input.pnl);
  const pnlInt = pnlInput !== null ? Math.round(pnlInput) : sellAmountInt - buyAmountInt;

  const returnPctInput = toFiniteNumber(input.returnPct ?? input.return_pct);
  const returnPct =
    returnPctInput !== null
      ? returnPctInput
      : buyAmountInt > 0
        ? (pnlInt / buyAmountInt) * 100
        : 0;

  const date = toYmd(input.date);

  return {
    id:
      typeof input.id === "string" && input.id.trim() !== ""
        ? input.id
        : `realized-trade-${index}-${date}`,
    date,
    market,
    ticker,
    qty,
    buyPriceInt,
    buyAmountInt,
    sellPriceInt,
    sellAmountInt,
    returnPct,
    pnlInt,
    content: typeof input.content === "string" ? input.content.trim() : "",
    rating: normalizeRating(input.rating),
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim() !== ""
        ? input.createdAt
        : typeof input.created_at === "string" && input.created_at.trim() !== ""
          ? input.created_at
          : new Date().toISOString(),
  };
}

function normalizeTradeForDb(
  trade: RealizedTrade,
  userId: string,
  options?: UpsertTradeOptions,
): RealizedTradeRow {
  const qty = Math.max(toInt(trade.qty, 0), 0);
  const buyPriceInt = Math.max(toInt(trade.buyPriceInt, 0), 0);
  const sellPriceInt = Math.max(toInt(trade.sellPriceInt, 0), 0);
  const buyAmountInt = Math.max(toInt(trade.buyAmountInt, qty * buyPriceInt), 0);
  const sellAmountInt = Math.max(toInt(trade.sellAmountInt, qty * sellPriceInt), 0);
  const pnlInt = toInt(trade.pnlInt, sellAmountInt - buyAmountInt);
  const returnPct = (() => {
    const parsed = toFiniteNumber(trade.returnPct);

    if (parsed !== null) {
      return parsed;
    }

    if (buyAmountInt <= 0) {
      return 0;
    }

    return (pnlInt / buyAmountInt) * 100;
  })();

  const row: RealizedTradeRow = {
    user_id: userId,
    date: toYmd(trade.date),
    market: trade.market,
    ticker: trade.ticker.trim().toUpperCase(),
    qty,
    buy_price_int: buyPriceInt,
    buy_amount_int: buyAmountInt,
    sell_price_int: sellPriceInt,
    sell_amount_int: sellAmountInt,
    return_pct: returnPct,
    pnl_int: pnlInt,
    content: trade.content.trim(),
    rating: trade.rating,
    created_at: trade.createdAt || new Date().toISOString(),
  };

  if (!options?.isCreate && trade.id.trim() && isValidUuid(trade.id.trim())) {
    row.id = trade.id.trim();
  }

  return row;
}

export class LocalRealizedTradeRepository implements RealizedTradeRepository {
  async getTrades(): Promise<RealizedTrade[]> {
    return sortByDateAsc(listRealizedTrades());
  }

  async upsertTrade(trade: RealizedTrade): Promise<void> {
    const normalized = normalizeTradeFromUnknown(trade, 0);

    if (!normalized) {
      return;
    }

    const current = listRealizedTrades();
    const next = sortByDateAsc([
      ...current.filter((item) => item.id !== normalized.id),
      normalized,
    ]);

    replaceRealizedTrades(next);
  }

  async deleteTrade(id: string): Promise<void> {
    const next = listRealizedTrades().filter((item) => item.id !== id);
    replaceRealizedTrades(next);
  }
}

export class SupabaseRealizedTradeRepository implements RealizedTradeRepository {
  constructor(private readonly userId: string) {}

  async getTrades(): Promise<RealizedTrade[]> {
    const { data, error } = await supabase
      .from("realized_trades")
      .select(
        "id,user_id,date,market,ticker,qty,buy_price_int,buy_amount_int,sell_price_int,sell_amount_int,return_pct,pnl_int,content,rating,created_at",
      )
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }

    const parsed = (data ?? [])
      .map((row, index) => normalizeTradeFromUnknown(row, index))
      .filter((trade): trade is RealizedTrade => Boolean(trade));

    return sortByDateAsc(parsed);
  }

  async upsertTrade(
    trade: RealizedTrade,
    options?: UpsertTradeOptions,
  ): Promise<void> {
    const payload = normalizeTradeForDb(trade, this.userId, options);
    const { error } = await supabase
      .from("realized_trades")
      .upsert([payload], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteTrade(id: string): Promise<void> {
    const { error } = await supabase
      .from("realized_trades")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createRealizedTradeRepository(
  userId?: string | null,
): RealizedTradeRepository {
  if (userId) {
    return new SupabaseRealizedTradeRepository(userId);
  }

  return new LocalRealizedTradeRepository();
}
