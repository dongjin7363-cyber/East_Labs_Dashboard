import { PortfolioAccountState } from "@/lib/models/types";
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

interface PortfolioAccountStateRow {
  user_id: string;
  deposit_krw_int: number;
  deposit_usd_cents: number;
  cash_krw_int: number;
  updated_at: string;
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

function normalizeState(raw: unknown): PortfolioAccountState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;

  return {
    depositKrwInt: toNonNegativeInt(
      input.deposit_krw_int ?? input.depositKrwInt,
    ),
    depositUsdCents: toNonNegativeInt(
      input.deposit_usd_cents ?? input.depositUsdCents,
    ),
    cashKrwInt: toNonNegativeInt(input.cash_krw_int ?? input.cashKrwInt),
    updatedAt:
      typeof input.updated_at === "string" && input.updated_at.trim() !== ""
        ? input.updated_at
        : typeof input.updatedAt === "string" && input.updatedAt.trim() !== ""
          ? input.updatedAt
          : new Date().toISOString(),
  };
}

function mapStateToRow(
  state: PortfolioAccountState,
  userId: string,
): PortfolioAccountStateRow {
  return {
    user_id: userId,
    deposit_krw_int: toNonNegativeInt(state.depositKrwInt),
    deposit_usd_cents: toNonNegativeInt(state.depositUsdCents),
    cash_krw_int: toNonNegativeInt(state.cashKrwInt),
    updated_at: state.updatedAt || new Date().toISOString(),
  };
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

    return normalizeState(data);
  }

  async upsertState(state: PortfolioAccountState): Promise<void> {
    const row = mapStateToRow(state, this.userId);
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
