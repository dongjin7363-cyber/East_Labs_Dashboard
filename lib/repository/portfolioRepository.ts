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
        is_credit,
        display_name,
        logo_url,
        qty,
        avg_price_int,
        current_price_int,
        prev_close_int,
        day_change_pct,
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
