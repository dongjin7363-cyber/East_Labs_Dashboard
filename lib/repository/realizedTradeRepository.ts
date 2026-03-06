import { RealizedTrade } from "@/lib/models/types";
import { listRealizedTrades, replaceRealizedTrades } from "@/lib/services/realizedTradeService";
import { supabase } from "@/lib/supabaseClient";

interface UpsertTradeOptions {
  isCreate?: boolean;
}

export interface RealizedTradeRepository {
  getTrades(): Promise<RealizedTrade[]>;
  upsertTrade(trade: RealizedTrade, options?: UpsertTradeOptions): Promise<void>;
  deleteTrade(id: string): Promise<void>;
}

export const REALIZED_TRADES_SYNCED_FLAG_KEY = "pf_synced_realized_trades_v1";

interface RealizedTradeRow {
  id?: string;
  user_id: string;
  date: string;
  market: "KR" | "US";
  ticker: string;
  qty: number;
  buy_price_int: number;
  buy_amount_int: number;
  sell_price_int: number;
  sell_amount_int: number;
  return_pct: number;
  pnl_int: number;
  content: string;
  rating: string;
  created_at: string;
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

function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());

    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return 0;
}

function toFloat(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").replace("%", "").trim());

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return 0;
}

function normalizeTrade(raw: unknown, index: number): RealizedTrade | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const market = input.market === "US" ? "US" : "KR";
  const ticker =
    normalizeOptionalText(input.ticker) ??
    normalizeOptionalText(input.symbol) ??
    "";

  if (!ticker) {
    return null;
  }

  const ratingRaw = normalizeOptionalText(input.rating) ?? "";
  const rating =
    ratingRaw === "Best" || ratingRaw === "Good" || ratingRaw === "Normal" || ratingRaw === "Bad"
      ? ratingRaw
      : "";

  return {
    id: normalizeOptionalText(input.id) ?? `realized-trade-${index}`,
    date: normalizeOptionalText(input.date) ?? new Date().toISOString().slice(0, 10),
    market,
    ticker,
    qty: Math.max(toInt(input.qty), 0),
    buyPriceInt: Math.max(toInt(input.buy_price_int ?? input.buyPriceInt), 0),
    buyAmountInt: Math.max(toInt(input.buy_amount_int ?? input.buyAmountInt), 0),
    sellPriceInt: Math.max(toInt(input.sell_price_int ?? input.sellPriceInt), 0),
    sellAmountInt: Math.max(toInt(input.sell_amount_int ?? input.sellAmountInt), 0),
    returnPct: toFloat(input.return_pct ?? input.returnPct),
    pnlInt: toInt(input.pnl_int ?? input.pnlInt),
    content: normalizeOptionalText(input.content) ?? "",
    rating,
    createdAt:
      normalizeOptionalText(input.created_at) ??
      normalizeOptionalText(input.createdAt) ??
      new Date().toISOString(),
  };
}

function sortTrades(trades: RealizedTrade[]): RealizedTrade[] {
  return [...trades].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function toRow(trade: RealizedTrade, userId: string, options?: UpsertTradeOptions): RealizedTradeRow {
  const row: RealizedTradeRow = {
    user_id: userId,
    date: trade.date,
    market: trade.market,
    ticker: trade.ticker,
    qty: Math.max(toInt(trade.qty), 0),
    buy_price_int: Math.max(toInt(trade.buyPriceInt), 0),
    buy_amount_int: Math.max(toInt(trade.buyAmountInt), 0),
    sell_price_int: Math.max(toInt(trade.sellPriceInt), 0),
    sell_amount_int: Math.max(toInt(trade.sellAmountInt), 0),
    return_pct: toFloat(trade.returnPct),
    pnl_int: toInt(trade.pnlInt),
    content: normalizeOptionalText(trade.content) ?? "",
    rating: trade.rating,
    created_at: trade.createdAt,
  };

  if (!options?.isCreate && trade.id.trim()) {
    row.id = trade.id.trim();
  }

  return row;
}

export class LocalRealizedTradeRepository implements RealizedTradeRepository {
  async getTrades(): Promise<RealizedTrade[]> {
    return sortTrades(listRealizedTrades());
  }

  async upsertTrade(trade: RealizedTrade): Promise<void> {
    const current = listRealizedTrades();
    replaceRealizedTrades(sortTrades([...current.filter((item) => item.id !== trade.id), trade]));
  }

  async deleteTrade(id: string): Promise<void> {
    const current = listRealizedTrades();
    replaceRealizedTrades(sortTrades(current.filter((item) => item.id !== id)));
  }
}

export class SupabaseRealizedTradeRepository implements RealizedTradeRepository {
  constructor(private readonly userId: string) {}

  async getTrades(): Promise<RealizedTrade[]> {
    const { data, error } = await supabase
      .from("realized_trades")
      .select(
        "id,date,market,ticker,qty,buy_price_int,buy_amount_int,sell_price_int,sell_amount_int,return_pct,pnl_int,content,rating,created_at",
      )
      .eq("user_id", this.userId);

    if (error) {
      console.error("[realized-trades] failed to load trades", error);
      return [];
    }

    return sortTrades(
      (data ?? [])
        .map((row, index) => normalizeTrade(row, index))
        .filter((trade): trade is RealizedTrade => Boolean(trade)),
    );
  }

  async upsertTrade(trade: RealizedTrade, options?: UpsertTradeOptions): Promise<void> {
    const row = toRow(trade, this.userId, options);
    const { error } = await supabase
      .from("realized_trades")
      .upsert([row], { onConflict: "id" });

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

