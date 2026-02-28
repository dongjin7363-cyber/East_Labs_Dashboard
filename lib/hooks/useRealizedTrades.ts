"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@/lib/utils/id";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  createRealizedTradeRepository,
  LocalRealizedTradeRepository,
  REALIZED_TRADES_SYNCED_FLAG_KEY,
  SupabaseRealizedTradeRepository,
} from "@/lib/repository/realizedTradeRepository";
import { RealizedTrade } from "@/lib/models/types";
import {
  importRealizedTradesFromCsv,
  RealizedTradeInput,
} from "@/lib/services/realizedTradeService";
import {
  FINANCE_DATA_EVENT,
  notifyFinanceDataChanged,
} from "@/lib/services/events";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
}

function sortTradesByDateAsc(trades: RealizedTrade[]): RealizedTrade[] {
  return [...trades].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byCreatedAt = a.createdAt.localeCompare(b.createdAt);

    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return a.ticker.localeCompare(b.ticker, "ko-KR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function buildTradeFromInput(
  input: RealizedTradeInput,
  base: Pick<RealizedTrade, "id" | "createdAt">,
): RealizedTrade {
  const qty = Math.max(Math.round(input.qty), 0);
  const buyPriceInt = Math.max(Math.round(input.buyPriceInt), 0);
  const sellPriceInt = Math.max(Math.round(input.sellPriceInt), 0);

  const buyAmountInt =
    typeof input.buyAmountInt === "number" && input.buyAmountInt >= 0
      ? Math.round(input.buyAmountInt)
      : qty * buyPriceInt;
  const sellAmountInt =
    typeof input.sellAmountInt === "number" && input.sellAmountInt >= 0
      ? Math.round(input.sellAmountInt)
      : qty * sellPriceInt;

  const pnlInt = sellAmountInt - buyAmountInt;
  const returnPct =
    typeof input.returnPct === "number" && Number.isFinite(input.returnPct)
      ? input.returnPct
      : buyAmountInt > 0
        ? (pnlInt / buyAmountInt) * 100
        : 0;

  return {
    id: base.id,
    date: input.date,
    market: input.market,
    ticker: input.ticker.trim().toUpperCase(),
    qty,
    buyPriceInt,
    buyAmountInt,
    sellPriceInt,
    sellAmountInt,
    returnPct,
    pnlInt,
    content: input.content.trim(),
    rating: input.rating,
    createdAt: base.createdAt,
  };
}

export function useRealizedTrades() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createRealizedTradeRepository(userId), [userId]);
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  const maybeAutoSyncFromLocal = useCallback(
    async (cloudTrades: RealizedTrade[]): Promise<boolean> => {
      if (!userId || cloudTrades.length > 0) {
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
        window.localStorage.getItem(REALIZED_TRADES_SYNCED_FLAG_KEY) === "true";

      if (alreadySynced) {
        return false;
      }

      try {
        const localRepository = new LocalRealizedTradeRepository();
        const cloudRepository = new SupabaseRealizedTradeRepository(userId);
        const localTrades = await localRepository.getTrades();

        if (localTrades.length === 0) {
          return false;
        }

        for (const trade of localTrades) {
          await cloudRepository.upsertTrade(trade);
        }

        window.localStorage.setItem(REALIZED_TRADES_SYNCED_FLAG_KEY, "true");
        return true;
      } catch (error) {
        console.error("[realized-trades] auto sync failed", errorMessage(error));
        return false;
      }
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setTrades([]);
      setLoading(false);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      let next = await repository.getTrades();

      if (userId) {
        const synced = await maybeAutoSyncFromLocal(next);

        if (synced) {
          next = await repository.getTrades();
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      setTrades(sortTradesByDateAsc(next));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[realized-trades] failed to load", error);
      }

      if (requestSeq === requestSeqRef.current) {
        setTrades([]);
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, isAuthenticated, maybeAutoSyncFromLocal, repository, userId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const onChanged = () => {
      void refresh();
    };
    window.addEventListener(FINANCE_DATA_EVENT, onChanged);

    return () => {
      window.removeEventListener(FINANCE_DATA_EVENT, onChanged);
    };
  }, [authLoading, refresh]);

  const create = useCallback(
    (input: RealizedTradeInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const nowIso = new Date().toISOString();
          const next = buildTradeFromInput(input, {
            id: createId(),
            createdAt: nowIso,
          });

          await repository.upsertTrade(next, { isCreate: true });
          setTrades(sortTradesByDateAsc(await repository.getTrades()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[realized-trades] failed to create", error);
          window.alert(`실현 거래 저장 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const update = useCallback(
    (id: string, input: RealizedTradeInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const current = await repository.getTrades();
          const target = current.find((item) => item.id === id);

          if (!target) {
            return;
          }

          const next = buildTradeFromInput(input, {
            id: target.id,
            createdAt: target.createdAt,
          });

          await repository.upsertTrade(next);
          setTrades(sortTradesByDateAsc(await repository.getTrades()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[realized-trades] failed to update", error);
          window.alert(`실현 거래 수정 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const remove = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          await repository.deleteTrade(id);
          setTrades(sortTradesByDateAsc(await repository.getTrades()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[realized-trades] failed to delete", error);
          window.alert(`실현 거래 삭제 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const importCsv = useCallback(
    (csvText: string) => {
      if (!isAuthenticated) {
        return { trades: [], inserted: 0, skipped: 0, failed: 0, totalRows: 0 };
      }

      const result = importRealizedTradesFromCsv(csvText);

      void (async () => {
        try {
          for (const trade of result.trades) {
            await repository.upsertTrade(trade);
          }

          setTrades(sortTradesByDateAsc(await repository.getTrades()));
          notifyFinanceDataChanged();
        } catch (error) {
          console.error("[realized-trades] csv import sync failed", errorMessage(error));
          setTrades(sortTradesByDateAsc(result.trades));
          notifyFinanceDataChanged();
        }
      })();

      return result;
    },
    [isAuthenticated, repository],
  );

  return {
    trades,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    create,
    update,
    remove,
    importCsv,
  };
}
