"use client";

import { useCallback, useEffect, useState } from "react";
import { PortfolioAccountState } from "@/lib/models/types";
import {
  PORTFOLIO_CASH_STORAGE_KEY,
  PORTFOLIO_DEPOSIT_STORAGE_KEY,
  PORTFOLIO_DEPOSIT_USD_STORAGE_KEY,
} from "@/lib/services/totalAssetService";

const EMPTY_STATE: PortfolioAccountState = {
  depositKrwInt: 0,
  depositUsdCents: 0,
  cashKrwInt: 0,
  updatedAt: new Date().toISOString(),
};

function toNonNegativeInt(raw: string | null): number {
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw.replace(/,/g, "").trim(), 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed);
}

function readState(): PortfolioAccountState {
  if (typeof window === "undefined") {
    return EMPTY_STATE;
  }

  const depositKrwInt = toNonNegativeInt(
    window.localStorage.getItem(PORTFOLIO_DEPOSIT_STORAGE_KEY),
  );
  const depositUsdCents = toNonNegativeInt(
    window.localStorage.getItem(PORTFOLIO_DEPOSIT_USD_STORAGE_KEY),
  );
  const cashKrwInt = toNonNegativeInt(
    window.localStorage.getItem(PORTFOLIO_CASH_STORAGE_KEY),
  );

  return {
    depositKrwInt,
    depositUsdCents,
    cashKrwInt,
    updatedAt: new Date().toISOString(),
  };
}

function persistState(next: PortfolioAccountState): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    PORTFOLIO_DEPOSIT_STORAGE_KEY,
    `${Math.max(next.depositKrwInt, 0)}`,
  );
  window.localStorage.setItem(
    PORTFOLIO_DEPOSIT_USD_STORAGE_KEY,
    `${Math.max(next.depositUsdCents, 0)}`,
  );
  window.localStorage.setItem(
    PORTFOLIO_CASH_STORAGE_KEY,
    `${Math.max(next.cashKrwInt, 0)}`,
  );
}

export function usePortfolioAccountState() {
  const [state, setState] = useState<PortfolioAccountState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number>(0);

  useEffect(() => {
    const next = readState();
    setState(next);
    setLoadedAt(Date.now());
    setLoading(false);
  }, []);

  const commit = useCallback((updater: (prev: PortfolioAccountState) => PortfolioAccountState) => {
    setState((prev) => {
      const next = updater(prev);
      const normalized: PortfolioAccountState = {
        depositKrwInt: Math.max(Math.round(next.depositKrwInt), 0),
        depositUsdCents: Math.max(Math.round(next.depositUsdCents), 0),
        cashKrwInt: Math.max(Math.round(next.cashKrwInt), 0),
        updatedAt: new Date().toISOString(),
      };

      persistState(normalized);
      setLoadedAt(Date.now());
      return normalized;
    });
  }, []);

  const setDepositKrwInt = useCallback(
    (value: number) => {
      commit((prev) => ({ ...prev, depositKrwInt: value }));
    },
    [commit],
  );

  const setDepositUsdCents = useCallback(
    (value: number) => {
      commit((prev) => ({ ...prev, depositUsdCents: value }));
    },
    [commit],
  );

  const setCashKrwInt = useCallback(
    (value: number) => {
      commit((prev) => ({ ...prev, cashKrwInt: value }));
    },
    [commit],
  );

  return {
    state,
    loading,
    loadedAt,
    setDepositKrwInt,
    setDepositUsdCents,
    setCashKrwInt,
  };
}

