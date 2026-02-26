"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@/lib/utils/id";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  createPortfolioRepository,
  LocalPortfolioRepository,
  SupabasePortfolioRepository,
} from "@/lib/repository/portfolioRepository";
import {
  Currency,
  Market,
  PortfolioHolding,
  PORTFOLIO_SECTORS,
  PortfolioSector,
} from "@/lib/models/types";
import {
  HoldingQuoteUpdate,
  PortfolioInput,
} from "@/lib/services/portfolioService";
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

function sortHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return [...holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function resolveCurrency(market: Market, currency?: Currency): Currency {
  if (market === "KR") {
    return "KRW";
  }

  if (market === "US") {
    return "USD";
  }

  return currency ?? "KRW";
}

function resolveSector(sector?: PortfolioSector): PortfolioSector {
  if (!sector) {
    return "Other";
  }

  const matched = PORTFOLIO_SECTORS.find((item) => item === sector);
  return matched ?? "Other";
}

function resolveKrCodeFromTicker(ticker: string): string | undefined {
  const normalized = ticker.trim().toUpperCase();

  if (/^[A-Z0-9]{1,12}$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function resolveKrCodeValue(
  market: Market,
  ticker: string,
  inputKrCode?: string,
): string | undefined {
  if (market !== "KR") {
    return undefined;
  }

  const normalizedInput = inputKrCode?.trim();

  if (normalizedInput) {
    const normalizedCode = normalizedInput.toUpperCase();

    if (/^[A-Z0-9]{1,12}$/.test(normalizedCode)) {
      return normalizedCode;
    }
  }

  return resolveKrCodeFromTicker(ticker);
}

export function usePortfolio() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createPortfolioRepository(userId), [userId]);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setHoldings([]);
      setLoading(false);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      const next = await repository.getHoldings();

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      setHoldings(sortHoldings(next));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[portfolio] failed to load holdings", error);
      }

      if (requestSeq === requestSeqRef.current) {
        setHoldings([]);
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, isAuthenticated, repository]);

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
    (input: PortfolioInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const nowIso = new Date().toISOString();
          const next: PortfolioHolding = {
            id: createId(),
            market: input.market,
            currency: resolveCurrency(input.market, input.currency),
            ticker: input.ticker.trim(),
            krCode: resolveKrCodeValue(input.market, input.ticker, input.krCode),
            quoteDisabled: input.quoteDisabled ? true : undefined,
            sector: resolveSector(input.sector),
            qty: input.qty,
            avgPrice: input.avgPrice,
            currentPrice: input.currentPrice,
            priceUpdatedAt: input.currentPrice > 0 ? nowIso : undefined,
            updatedAt: nowIso,
          };

          await repository.upsertHolding(next, { isCreate: true });
          setHoldings(await repository.getHoldings());
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[portfolio] failed to create holding", error);
          window.alert(`보유자산 저장 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const update = useCallback(
    (id: string, input: PortfolioInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const current = await repository.getHoldings();
          const target = current.find((item) => item.id === id);

          if (!target) {
            return;
          }

          const nowIso = new Date().toISOString();
          const next: PortfolioHolding = {
            id: target.id,
            market: input.market,
            currency: resolveCurrency(input.market, input.currency),
            ticker: input.ticker.trim(),
            krCode:
              input.market === "KR"
                ? resolveKrCodeValue(input.market, input.ticker, input.krCode) ??
                  (target.market === "KR" &&
                  target.ticker.trim() === input.ticker.trim()
                    ? target.krCode
                    : undefined)
                : undefined,
            quoteDisabled: input.quoteDisabled ? true : undefined,
            sector: resolveSector(input.sector),
            qty: input.qty,
            avgPrice: input.avgPrice,
            currentPrice: input.currentPrice,
            priceUpdatedAt: input.currentPrice > 0 ? nowIso : undefined,
            updatedAt: nowIso,
          };

          await repository.upsertHolding(next);
          setHoldings(await repository.getHoldings());
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[portfolio] failed to update holding", error);
          window.alert(`보유자산 수정 실패: ${message}`);
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
          await repository.deleteHolding(id);
          setHoldings(await repository.getHoldings());
          notifyFinanceDataChanged();
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[portfolio] failed to delete holding", error);
          }
          window.alert("보유자산 삭제에 실패했습니다.");
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const updateQuotes = useCallback(
    (quoteUpdates: HoldingQuoteUpdate[]) => {
      if (!isAuthenticated || quoteUpdates.length === 0) {
        return;
      }

      void (async () => {
        try {
          const refreshedAt = new Date().toISOString();
          const updateMap = new Map(quoteUpdates.map((item) => [item.id, item]));
          const current = await repository.getHoldings();
          const next = current.map((holding) => {
            const quote = updateMap.get(holding.id);

            if (!quote) {
              return holding;
            }

            return {
              ...holding,
              currentPrice: quote.currentPrice,
              krCode:
                holding.market === "KR"
                  ? quote.krCode ?? holding.krCode
                  : undefined,
              priceUpdatedAt: quote.asOf ?? refreshedAt,
              updatedAt: refreshedAt,
            };
          });

          const changed = next.filter((holding, index) => holding !== current[index]);

          if (changed.length === 0) {
            return;
          }

          await Promise.all(changed.map((holding) => repository.upsertHolding(holding)));
          setHoldings(sortHoldings(next));
          notifyFinanceDataChanged();
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[portfolio] failed to update quotes", error);
          }
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const uploadLocalToCloud = useCallback(async () => {
    if (!isAuthenticated || !userId) {
      return { uploaded: 0, total: 0 };
    }

    const localRepository = new LocalPortfolioRepository();
    const cloudRepository = new SupabasePortfolioRepository(userId);
    const localHoldings = await localRepository.getHoldings();

    if (localHoldings.length === 0) {
      return { uploaded: 0, total: 0 };
    }

    for (const holding of localHoldings) {
      await cloudRepository.upsertHolding(holding);
    }

    setHoldings(await cloudRepository.getHoldings());
    notifyFinanceDataChanged();

    return {
      uploaded: localHoldings.length,
      total: localHoldings.length,
    };
  }, [isAuthenticated, userId]);

  return {
    holdings,
    loading,
    refresh,
    create,
    update,
    remove,
    updateQuotes,
    authLoading,
    isCloudMode: isAuthenticated,
    userId,
    uploadLocalToCloud,
  };
}
