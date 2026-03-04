import { supabase } from "@/lib/supabaseClient";
import { PortfolioAccountState } from "@/lib/models/types";

export const PORTFOLIO_DEPOSIT_KRW_STORAGE_KEY = "pf_deposit_krw_v1";
export const PORTFOLIO_DEPOSIT_USD_STORAGE_KEY = "pf_deposit_usd_v1";
export const PORTFOLIO_CASH_KRW_STORAGE_KEY = "pf_cash_krw_v1";
export const PORTFOLIO_ACCOUNT_STATE_UPDATED_AT_STORAGE_KEY =
  "pf_portfolio_account_state_updated_at_v1";
export const PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY =
  "pf_synced_portfolio_account_state_v1";

export interface PortfolioAccountStateInput {
  depositKrwInt: number;
  depositUsdCents: number;
  cashKrwInt: number;
  updatedAt?: string;
}

interface PortfolioAccountStateRow {
  user_id: string;
  deposit_krw_int: number;
  deposit_usd_cents: number;
  cash_krw_int: number;
  updated_at: string;
}

export interface PortfolioAccountStateRepository {
  getState(): Promise<PortfolioAccountState>;
  exists(): Promise<boolean>;
  upsertState(input: PortfolioAccountStateInput): Promise<void>;
}

function defaultState(): PortfolioAccountState {
  return {
    depositKrwInt: 0,
    depositUsdCents: 0,
    cashKrwInt: 0,
    updatedAt: new Date().toISOString(),
  };
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function toNonNegativeInt(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(Math.round(value), 0);
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/,/g, "").trim();

    if (!sanitized) {
      return fallback;
    }

    const parsed = Number(sanitized);

    if (Number.isFinite(parsed)) {
      return Math.max(Math.round(parsed), 0);
    }
  }

  return fallback;
}

function readLocalRaw(key: string): string | null {
  if (!isClient()) {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeLocalRaw(key: string, value: string): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(key, value);
}

function ensureLegacyMigration(): void {
  if (!isClient()) {
    return;
  }

  const rawDeposit = readLocalRaw(PORTFOLIO_DEPOSIT_KRW_STORAGE_KEY);
  const rawCash = readLocalRaw(PORTFOLIO_CASH_KRW_STORAGE_KEY);

  if (!rawDeposit && rawCash && /^\d+$/.test(rawCash)) {
    writeLocalRaw(PORTFOLIO_DEPOSIT_KRW_STORAGE_KEY, rawCash);
    writeLocalRaw(PORTFOLIO_DEPOSIT_USD_STORAGE_KEY, "0");
    writeLocalRaw(PORTFOLIO_CASH_KRW_STORAGE_KEY, "0");
    writeLocalRaw(
      PORTFOLIO_ACCOUNT_STATE_UPDATED_AT_STORAGE_KEY,
      new Date().toISOString(),
    );
  }
}

function readLocalState(): PortfolioAccountState {
  if (!isClient()) {
    return defaultState();
  }

  ensureLegacyMigration();

  const rawDeposit = readLocalRaw(PORTFOLIO_DEPOSIT_KRW_STORAGE_KEY) ?? "0";
  const rawDepositUsd = readLocalRaw(PORTFOLIO_DEPOSIT_USD_STORAGE_KEY) ?? "0";
  const rawCash = readLocalRaw(PORTFOLIO_CASH_KRW_STORAGE_KEY) ?? "0";
  const rawUpdatedAt = readLocalRaw(PORTFOLIO_ACCOUNT_STATE_UPDATED_AT_STORAGE_KEY);

  return {
    depositKrwInt: toNonNegativeInt(rawDeposit, 0),
    depositUsdCents: toNonNegativeInt(rawDepositUsd, 0),
    cashKrwInt: toNonNegativeInt(rawCash, 0),
    updatedAt:
      typeof rawUpdatedAt === "string" && rawUpdatedAt.trim()
        ? rawUpdatedAt
        : new Date().toISOString(),
  };
}

function hasLocalState(): boolean {
  if (!isClient()) {
    return false;
  }

  ensureLegacyMigration();

  return (
    readLocalRaw(PORTFOLIO_DEPOSIT_KRW_STORAGE_KEY) !== null ||
    readLocalRaw(PORTFOLIO_DEPOSIT_USD_STORAGE_KEY) !== null ||
    readLocalRaw(PORTFOLIO_CASH_KRW_STORAGE_KEY) !== null
  );
}

function normalizeStateInput(input: PortfolioAccountStateInput): PortfolioAccountState {
  return {
    depositKrwInt: toNonNegativeInt(input.depositKrwInt, 0),
    depositUsdCents: toNonNegativeInt(input.depositUsdCents, 0),
    cashKrwInt: toNonNegativeInt(input.cashKrwInt, 0),
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeStateFromUnknown(raw: unknown): PortfolioAccountState {
  if (!raw || typeof raw !== "object") {
    return defaultState();
  }

  const input = raw as Record<string, unknown>;

  return {
    depositKrwInt: toNonNegativeInt(
      input.depositKrwInt ?? input.deposit_krw_int,
      0,
    ),
    depositUsdCents: toNonNegativeInt(
      input.depositUsdCents ?? input.deposit_usd_cents,
      0,
    ),
    cashKrwInt: toNonNegativeInt(input.cashKrwInt ?? input.cash_krw_int, 0),
    updatedAt:
      typeof input.updatedAt === "string" && input.updatedAt.trim()
        ? input.updatedAt
        : typeof input.updated_at === "string" && input.updated_at.trim()
          ? input.updated_at
          : new Date().toISOString(),
  };
}

function toDbRow(
  input: PortfolioAccountStateInput,
  userId: string,
): PortfolioAccountStateRow {
  const normalized = normalizeStateInput(input);

  return {
    user_id: userId,
    deposit_krw_int: normalized.depositKrwInt,
    deposit_usd_cents: normalized.depositUsdCents,
    cash_krw_int: normalized.cashKrwInt,
    updated_at: normalized.updatedAt,
  };
}

export class LocalPortfolioAccountStateRepository
  implements PortfolioAccountStateRepository
{
  async getState(): Promise<PortfolioAccountState> {
    return readLocalState();
  }

  async exists(): Promise<boolean> {
    return hasLocalState();
  }

  async upsertState(input: PortfolioAccountStateInput): Promise<void> {
    const normalized = normalizeStateInput(input);
    writeLocalRaw(PORTFOLIO_DEPOSIT_KRW_STORAGE_KEY, `${normalized.depositKrwInt}`);
    writeLocalRaw(PORTFOLIO_DEPOSIT_USD_STORAGE_KEY, `${normalized.depositUsdCents}`);
    writeLocalRaw(PORTFOLIO_CASH_KRW_STORAGE_KEY, `${normalized.cashKrwInt}`);
    writeLocalRaw(PORTFOLIO_ACCOUNT_STATE_UPDATED_AT_STORAGE_KEY, normalized.updatedAt);
  }
}

export class SupabasePortfolioAccountStateRepository
  implements PortfolioAccountStateRepository
{
  constructor(private readonly userId: string) {}

  async getState(): Promise<PortfolioAccountState> {
    const { data, error } = await supabase
      .from("portfolio_account_state")
      .select(
        "user_id,deposit_krw_int,deposit_usd_cents,cash_krw_int,updated_at",
      )
      .eq("user_id", this.userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return defaultState();
    }

    return normalizeStateFromUnknown(data);
  }

  async exists(): Promise<boolean> {
    const { data, error } = await supabase
      .from("portfolio_account_state")
      .select("user_id")
      .eq("user_id", this.userId)
      .limit(1);

    if (error) {
      throw error;
    }

    return Array.isArray(data) && data.length > 0;
  }

  async upsertState(input: PortfolioAccountStateInput): Promise<void> {
    const payload = toDbRow(input, this.userId);
    const { error } = await supabase
      .from("portfolio_account_state")
      .upsert([payload], { onConflict: "user_id" });

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
