import { PortfolioAccountState } from "@/lib/models/types";
import {
  deserializePortfolioAccountState,
  serializePortfolioAccountStateRow,
} from "@/lib/repository/mappers/portfolioAccountStateMapper";
import { supabase } from "@/lib/supabaseClient";
import {
  PORTFOLIO_CASH_STORAGE_KEY,
  PORTFOLIO_DEPOSIT_STORAGE_KEY,
  PORTFOLIO_DEPOSIT_USD_STORAGE_KEY,
} from "@/lib/services/totalAssetService";

export const PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY =
  "pf_synced_portfolio_account_state_v1";

export interface PortfolioAccountStateRepository {
  getState(): Promise<PortfolioAccountState | null>;
  upsertState(state: PortfolioAccountState): Promise<void>;
}

function toNonNegativeInt(value: unknown): number {
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

export class LocalPortfolioAccountStateRepository
  implements PortfolioAccountStateRepository
{
  async getState(): Promise<PortfolioAccountState | null> {
    if (typeof window === "undefined") {
      return null;
    }

    return {
      depositKrwInt: toNonNegativeInt(
        window.localStorage.getItem(PORTFOLIO_DEPOSIT_STORAGE_KEY),
      ),
      depositUsdCents: toNonNegativeInt(
        window.localStorage.getItem(PORTFOLIO_DEPOSIT_USD_STORAGE_KEY),
      ),
      cashKrwInt: toNonNegativeInt(
        window.localStorage.getItem(PORTFOLIO_CASH_STORAGE_KEY),
      ),
      updatedAt: new Date().toISOString(),
    };
  }

  async upsertState(state: PortfolioAccountState): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      PORTFOLIO_DEPOSIT_STORAGE_KEY,
      `${toNonNegativeInt(state.depositKrwInt)}`,
    );
    window.localStorage.setItem(
      PORTFOLIO_DEPOSIT_USD_STORAGE_KEY,
      `${toNonNegativeInt(state.depositUsdCents)}`,
    );
    window.localStorage.setItem(
      PORTFOLIO_CASH_STORAGE_KEY,
      `${toNonNegativeInt(state.cashKrwInt)}`,
    );
  }
}

export class SupabasePortfolioAccountStateRepository
  implements PortfolioAccountStateRepository
{
  constructor(private readonly userId: string) {}

  async getState(): Promise<PortfolioAccountState | null> {
    const { data, error } = await supabase
      .from("portfolio_account_state")
      .select("deposit_krw_int, deposit_usd_cents, cash_krw_int, updated_at")
      .eq("user_id", this.userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return deserializePortfolioAccountState(data);
  }

  async upsertState(state: PortfolioAccountState): Promise<void> {
    const row = serializePortfolioAccountStateRow(state, this.userId);
    const { error } = await supabase
      .from("portfolio_account_state")
      .upsert([row], { onConflict: "user_id" });

    if (error) {
      throw error;
    }
  }
}

export function createPortfolioAccountStateRepository(
  userId?: string | null,
): PortfolioAccountStateRepository {
  if (userId) {
    return new SupabasePortfolioAccountStateRepository(userId);
  }

  return new LocalPortfolioAccountStateRepository();
}
