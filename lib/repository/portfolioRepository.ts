import { PortfolioHolding } from "@/lib/models/types";
import {
  deserializePortfolioHolding,
  serializePortfolioHoldingRow,
} from "@/lib/repository/mappers/portfolioHoldingMapper";
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

const localRepository = new LocalStorageFinanceRepository();

function sortByUpdatedAtDesc(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return [...holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function isMissingColumnError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : "";
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return code === "PGRST204" || /column|schema cache/i.test(message);
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
    const { data: primaryData, error: primaryError } = await supabase
      .from("portfolio_holdings")
      .select(`
        id,
        market,
        ticker,
        ticker_code,
        kr_code,
        quote_disabled,
        is_credit,
        display_name,
        logo_url,
        qty,
        avg_price_int,
        current_price_int,
        prev_close_int,
        day_change_pct,
        price_updated_at,
        extended_price,
        extended_change_pct,
        extended_session,
        extended_updated_at,
        comment,
        sector,
        position,
        updated_at
      `)
      .eq("user_id", this.userId);

    if (!primaryError) {
      const parsedPrimary = (primaryData ?? [])
        .map((row, index) => deserializePortfolioHolding(row, index))
        .filter((holding): holding is PortfolioHolding => Boolean(holding));

      return sortByUpdatedAtDesc(parsedPrimary);
    }

    console.error("portfolio holdings primary load failed", primaryError);

    const { data: compatibleData, error: compatibleError } = await supabase
      .from("portfolio_holdings")
      .select(`
        id,
        market,
        ticker,
        ticker_code,
        kr_code,
        is_credit,
        display_name,
        logo_url,
        qty,
        avg_price_int,
        current_price_int,
        prev_close_int,
        day_change_pct,
        price_updated_at,
        extended_price,
        extended_change_pct,
        extended_session,
        extended_updated_at,
        comment,
        sector,
        position,
        updated_at
      `)
      .eq("user_id", this.userId);

    if (!compatibleError) {
      const parsedCompatible = (compatibleData ?? [])
        .map((row, index) => deserializePortfolioHolding(row, index))
        .filter((holding): holding is PortfolioHolding => Boolean(holding));

      return sortByUpdatedAtDesc(parsedCompatible);
    }

    console.error("portfolio holdings compatible load failed", compatibleError);

    const { data: fallbackData, error: fallbackError } = await supabase
      .from("portfolio_holdings")
      .select(`
        id,
        market,
        ticker,
        qty,
        avg_price_int,
        current_price_int,
        sector,
        updated_at
      `)
      .eq("user_id", this.userId);

    if (fallbackError) {
      console.error("portfolio holdings fallback load failed", fallbackError);
      throw fallbackError;
    }

    const parsedFallback = (fallbackData ?? [])
      .map((row, index) => deserializePortfolioHolding(row, index))
      .filter((holding): holding is PortfolioHolding => Boolean(holding));

    return sortByUpdatedAtDesc(parsedFallback);
  }

  async upsertHolding(
    holding: PortfolioHolding,
    options?: UpsertHoldingOptions,
  ): Promise<void> {
    const row = serializePortfolioHoldingRow(holding, this.userId, options);
    const { error } = await supabase
      .from("portfolio_holdings")
      .upsert([row], { onConflict: "id" });

    if (!error) {
      return;
    }

    if (!isMissingColumnError(error)) {
      throw error;
    }

    const fallbackRow = { ...row };
    delete fallbackRow.price_updated_at;
    delete fallbackRow.quote_disabled;
    delete fallbackRow.extended_price;
    delete fallbackRow.extended_change_pct;
    delete fallbackRow.extended_session;
    delete fallbackRow.extended_updated_at;
    delete fallbackRow.nxt_price;
    delete fallbackRow.nxt_change_pct;
    delete fallbackRow.nxt_supported;
    delete fallbackRow.nxt_updated_at;
    delete fallbackRow.after_hours_price;
    delete fallbackRow.after_hours_change_pct;
    delete fallbackRow.after_hours_updated_at;
    const { error: fallbackError } = await supabase
      .from("portfolio_holdings")
      .upsert([fallbackRow], { onConflict: "id" });

    if (fallbackError) {
      throw fallbackError;
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
