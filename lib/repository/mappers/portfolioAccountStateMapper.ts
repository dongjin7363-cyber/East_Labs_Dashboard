import { PortfolioAccountState } from "@/lib/models/types";
import {
  normalizeIsoString,
  toNonNegativeInt,
} from "@/lib/repository/mappers/common";

export interface PortfolioAccountStateRow {
  user_id: string;
  deposit_krw_int: number;
  deposit_usd_cents: number;
  cash_krw_int: number;
  updated_at: string;
}

export function deserializePortfolioAccountState(
  raw: unknown,
): PortfolioAccountState | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;

  return {
    depositKrwInt: toNonNegativeInt(input.depositKrwInt ?? input.deposit_krw_int),
    depositUsdCents: toNonNegativeInt(
      input.depositUsdCents ?? input.deposit_usd_cents,
    ),
    cashKrwInt: toNonNegativeInt(input.cashKrwInt ?? input.cash_krw_int),
    updatedAt: normalizeIsoString(input.updatedAt ?? input.updated_at),
  };
}

export function serializePortfolioAccountStateRow(
  state: PortfolioAccountState,
  userId: string,
): PortfolioAccountStateRow {
  return {
    user_id: userId,
    deposit_krw_int: toNonNegativeInt(state.depositKrwInt),
    deposit_usd_cents: toNonNegativeInt(state.depositUsdCents),
    cash_krw_int: toNonNegativeInt(state.cashKrwInt),
    updated_at: normalizeIsoString(state.updatedAt),
  };
}
