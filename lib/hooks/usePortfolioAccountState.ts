"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { PortfolioAccountState } from "@/lib/models/types";
import {
  createPortfolioAccountStateRepository,
  LocalPortfolioAccountStateRepository,
  PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY,
  SupabasePortfolioAccountStateRepository,
} from "@/lib/repository/portfolioAccountStateRepository";

const EMPTY_STATE: PortfolioAccountState = {
  depositKrwInt: 0,
  depositUsdCents: 0,
  cashKrwInt: 0,
  updatedAt: "1970-01-01T00:00:00.000Z",
};

function normalizeState(next: PortfolioAccountState): PortfolioAccountState {
  return {
    depositKrwInt: Math.max(Math.round(next.depositKrwInt), 0),
    depositUsdCents: Math.max(Math.round(next.depositUsdCents), 0),
    cashKrwInt: Math.max(Math.round(next.cashKrwInt), 0),
    updatedAt: new Date().toISOString(),
  };
}

function hasNonZeroValue(state: PortfolioAccountState | null): boolean {
  if (!state) {
    return false;
  }

  return (
    state.depositKrwInt > 0 ||
    state.depositUsdCents > 0 ||
    state.cashKrwInt > 0
  );
}

export function usePortfolioAccountState() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(
    () => createPortfolioAccountStateRepository(userId),
    [userId],
  );
  const [state, setState] = useState<PortfolioAccountState>(EMPTY_STATE);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<number>(0);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setState(EMPTY_STATE);
      setLoadedAt(Date.now());
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let nextState = await repository.getState();

      if (!nextState && userId) {
        const alreadySynced =
          typeof window !== "undefined" &&
          window.localStorage.getItem(PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY) === "true";

        if (!alreadySynced && syncAttemptedUserRef.current !== userId) {
          syncAttemptedUserRef.current = userId;
          const localRepository = new LocalPortfolioAccountStateRepository();
          const cloudRepository = new SupabasePortfolioAccountStateRepository(userId);
          const localState = await localRepository.getState();

          if (hasNonZeroValue(localState)) {
            await cloudRepository.upsertState(localState as PortfolioAccountState);
            window.localStorage.setItem(PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY, "true");
            nextState = localState;
          }
        }
      }

      setState(nextState ?? EMPTY_STATE);
      setLoadedAt(Date.now());
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[portfolio-account-state] failed to load", error);
      }

      setState(EMPTY_STATE);
      setLoadedAt(Date.now());
    } finally {
      setLoading(false);
    }
  }, [authLoading, isAuthenticated, repository, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const persist = useCallback(
    async (nextState: PortfolioAccountState) => {
      const normalized = normalizeState(nextState);
      const localRepository = new LocalPortfolioAccountStateRepository();
      await localRepository.upsertState(normalized);

      if (!isAuthenticated) {
        return;
      }

      await repository.upsertState(normalized);
    },
    [isAuthenticated, repository],
  );

  const commit = useCallback(
    (updater: (prev: PortfolioAccountState) => PortfolioAccountState) => {
      setState((prev) => {
        const normalized = normalizeState(updater(prev));

        void persist(normalized).catch((error) => {
          const message =
            error && typeof error === "object" && "message" in error
              ? String((error as { message: unknown }).message)
              : "unknown error";

          console.error("[portfolio-account-state] failed to persist", error);
          window.alert(`계좌 상태 저장 실패: ${message}`);
        });

        setLoadedAt(Date.now());
        return normalized;
      });
    },
    [persist],
  );

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
    loading: loading || authLoading,
    loadedAt,
    setDepositKrwInt,
    setDepositUsdCents,
    setCashKrwInt,
  };
}
