"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { PortfolioAccountState } from "@/lib/models/types";
import {
  createPortfolioAccountStateRepository,
  LocalPortfolioAccountStateRepository,
  PortfolioAccountStateRepository,
  PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY,
  SupabasePortfolioAccountStateRepository,
} from "@/lib/repository/portfolioAccountStateRepository";

const UPSERT_DEBOUNCE_MS = 500;

function normalizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(Math.round(value), 0);
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
}

export function usePortfolioAccountState() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const primaryRepository = useMemo(
    () => createPortfolioAccountStateRepository(userId),
    [userId],
  );
  const fallbackRepositoryRef = useRef<PortfolioAccountStateRepository | null>(null);
  const [state, setState] = useState<PortfolioAccountState>({
    depositKrwInt: 0,
    depositUsdCents: 0,
    cashKrwInt: 0,
    updatedAt: new Date().toISOString(),
  });
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(0);
  const requestSeqRef = useRef(0);
  const skipPersistRef = useRef(true);
  const debounceTimerRef = useRef<number | null>(null);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    fallbackRepositoryRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  useEffect(
    () => () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    },
    [],
  );

  const activeRepository = useCallback((): PortfolioAccountStateRepository => {
    return fallbackRepositoryRef.current ?? primaryRepository;
  }, [primaryRepository]);

  const maybeAutoSyncFromLocal = useCallback(
    async (cloudExists: boolean): Promise<boolean> => {
      if (!userId || cloudExists) {
        return false;
      }

      if (syncAttemptedUserRef.current === userId) {
        return false;
      }
      syncAttemptedUserRef.current = userId;

      if (typeof window === "undefined") {
        return false;
      }

      const alreadySynced =
        window.localStorage.getItem(PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY) ===
        "true";

      if (alreadySynced) {
        return false;
      }

      try {
        const localRepository = new LocalPortfolioAccountStateRepository();
        const cloudRepository = new SupabasePortfolioAccountStateRepository(userId);
        const localExists = await localRepository.exists();

        if (!localExists) {
          return false;
        }

        const localState = await localRepository.getState();
        await cloudRepository.upsertState(localState);
        window.localStorage.setItem(PORTFOLIO_ACCOUNT_STATE_SYNCED_FLAG_KEY, "true");
        return true;
      } catch (error) {
        console.error("[portfolio-account-state] auto sync failed", errorMessage(error));
        return false;
      }
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      const repository = activeRepository();
      if (
        isAuthenticated &&
        userId &&
        repository instanceof SupabasePortfolioAccountStateRepository
      ) {
        const cloudExists = await repository.exists();
        await maybeAutoSyncFromLocal(cloudExists);
      }

      const next = await repository.getState();

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      skipPersistRef.current = true;
      setState(next);
      setLoadedAt(Date.now());
    } catch (error) {
      try {
        fallbackRepositoryRef.current = new LocalPortfolioAccountStateRepository();
        const next = await fallbackRepositoryRef.current.getState();

        if (requestSeq !== requestSeqRef.current) {
          return;
        }

        skipPersistRef.current = true;
        setState(next);
        setLoadedAt(Date.now());
      } catch (fallbackError) {
        if (requestSeq === requestSeqRef.current) {
          skipPersistRef.current = true;
          setState({
            depositKrwInt: 0,
            depositUsdCents: 0,
            cashKrwInt: 0,
            updatedAt: new Date().toISOString(),
          });
          setLoadedAt(Date.now());
        }

        if (process.env.NODE_ENV === "development") {
          console.error(
            "[portfolio-account-state] failed to load",
            errorMessage(fallbackError),
            errorMessage(error),
          );
        }
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [activeRepository, authLoading, isAuthenticated, maybeAutoSyncFromLocal, userId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (authLoading || loading) {
      return;
    }

    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      const payload: PortfolioAccountState = {
        ...state,
        updatedAt: new Date().toISOString(),
      };

      void activeRepository()
        .upsertState(payload)
        .catch((error) => {
          if (process.env.NODE_ENV === "development") {
            console.error(
              "[portfolio-account-state] failed to persist",
              errorMessage(error),
            );
          }
        });
    }, UPSERT_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    activeRepository,
    authLoading,
    loading,
    state.cashKrwInt,
    state.depositKrwInt,
    state.depositUsdCents,
  ]);

  const setDepositKrwInt = useCallback((value: number) => {
    setState((prev) => ({
      ...prev,
      depositKrwInt: normalizeNonNegativeInt(value),
    }));
  }, []);

  const setDepositUsdCents = useCallback((value: number) => {
    setState((prev) => ({
      ...prev,
      depositUsdCents: normalizeNonNegativeInt(value),
    }));
  }, []);

  const setCashKrwInt = useCallback((value: number) => {
    setState((prev) => ({
      ...prev,
      cashKrwInt: normalizeNonNegativeInt(value),
    }));
  }, []);

  return {
    state,
    loading,
    loadedAt,
    isAuthenticated,
    authLoading,
    refresh,
    setDepositKrwInt,
    setDepositUsdCents,
    setCashKrwInt,
  };
}
