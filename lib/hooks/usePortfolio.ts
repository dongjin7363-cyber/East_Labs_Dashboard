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

const PORTFOLIO_HOLDINGS_SYNCED_FLAG_KEY = "pf_synced_portfolio_holdings_v1";

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

function buildHoldingLookupKey(holding: PortfolioHolding): string {
  return `${holding.market}:${holding.ticker.trim().toUpperCase()}`;
}

function parseTimeMs(value?: string): number {
  if (typeof value !== "string" || value.trim() === "") {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeHoldingsWithLocalMetadata(
  cloudHoldings: PortfolioHolding[],
  localHoldings: PortfolioHolding[],
): { merged: PortfolioHolding[]; filledCount: number } {
  if (cloudHoldings.length === 0 || localHoldings.length === 0) {
    return { merged: cloudHoldings, filledCount: 0 };
  }

  const localById = new Map(localHoldings.map((holding) => [holding.id, holding]));
  const localByTicker = new Map(
    localHoldings.map((holding) => [buildHoldingLookupKey(holding), holding]),
  );
  let filledCount = 0;

  const merged = cloudHoldings.map((holding) => {
    const localMatched =
      localById.get(holding.id) ?? localByTicker.get(buildHoldingLookupKey(holding));

    if (!localMatched) {
      return holding;
    }

    const shouldPreferLocalQuote =
      holding.market === "US" &&
      parseTimeMs(localMatched.priceUpdatedAt) > parseTimeMs(holding.priceUpdatedAt);

    const next: PortfolioHolding = {
      ...holding,
      displayName: holding.displayName ?? localMatched.displayName,
      tickerCode:
        holding.tickerCode ??
        localMatched.tickerCode ??
        (holding.market === "KR" ? localMatched.krCode : undefined),
      logoUrl: holding.logoUrl ?? localMatched.logoUrl,
      comment: holding.comment ?? localMatched.comment,
      position:
        holding.position === "N" && localMatched.position && localMatched.position !== "N"
          ? localMatched.position
          : holding.position,
      currentPrice: shouldPreferLocalQuote ? localMatched.currentPrice : holding.currentPrice,
      prevClose:
        shouldPreferLocalQuote
          ? localMatched.prevClose ?? holding.prevClose
          : holding.prevClose ?? localMatched.prevClose,
      dayChangePct:
        shouldPreferLocalQuote
          ? localMatched.dayChangePct ?? holding.dayChangePct
          : holding.dayChangePct ?? localMatched.dayChangePct,
      priceUpdatedAt:
        shouldPreferLocalQuote
          ? localMatched.priceUpdatedAt ?? holding.priceUpdatedAt
          : holding.priceUpdatedAt ?? localMatched.priceUpdatedAt,
      krCode:
        holding.market === "KR"
          ? holding.krCode ??
            localMatched.krCode ??
            localMatched.tickerCode
          : undefined,
    };

    if (
      next.displayName !== holding.displayName ||
      next.tickerCode !== holding.tickerCode ||
      next.logoUrl !== holding.logoUrl ||
      next.comment !== holding.comment ||
      next.position !== holding.position ||
      next.currentPrice !== holding.currentPrice ||
      next.prevClose !== holding.prevClose ||
      next.dayChangePct !== holding.dayChangePct ||
      next.priceUpdatedAt !== holding.priceUpdatedAt ||
      next.krCode !== holding.krCode
    ) {
      filledCount += 1;
      return next;
    }

    return holding;
  });

  return { merged, filledCount };
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

function normalizeOptionalText(value?: string): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  return normalized;
}

function normalizeTickerCode(value?: string): string | undefined {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return undefined;
  }

  return normalized.toUpperCase();
}

export function usePortfolio() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createPortfolioRepository(userId), [userId]);
  const localRepository = useMemo(() => new LocalPortfolioRepository(), []);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const syncAttemptedUserRef = useRef<string | null>(null);
  const holdingsRef = useRef<PortfolioHolding[]>([]);

  const applyHoldings = useCallback((next: PortfolioHolding[]) => {
    const sorted = sortHoldings(next);
    setHoldings(sorted);
    holdingsRef.current = sorted;
  }, []);

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
      applyHoldings([]);
      setLoading(false);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      let next = await repository.getHoldings();
      const localHoldings = await localRepository.getHoldings();

      if (next.length > 0 && localHoldings.length > 0) {
        const merged = mergeHoldingsWithLocalMetadata(next, localHoldings);
        next = merged.merged;

        if (merged.filledCount > 0) {
          console.info("[portfolio] local metadata merged into cloud holdings", {
            filledCount: merged.filledCount,
          });
        }
      }

      if (userId && next.length === 0) {
        if (localHoldings.length > 0) {
          console.info(
            "[portfolio] local fallback used (cloud rows are empty)",
            {
              localCount: localHoldings.length,
            },
          );
          next = localHoldings;

          const alreadySynced =
            window.localStorage.getItem(PORTFOLIO_HOLDINGS_SYNCED_FLAG_KEY) === "true";

          if (!alreadySynced && syncAttemptedUserRef.current !== userId) {
            syncAttemptedUserRef.current = userId;
            void (async () => {
              try {
                const cloudRepository = new SupabasePortfolioRepository(userId);

                for (const holding of localHoldings) {
                  await cloudRepository.upsertHolding(holding);
                }

                window.localStorage.setItem(
                  PORTFOLIO_HOLDINGS_SYNCED_FLAG_KEY,
                  "true",
                );
              } catch (error) {
                console.error("[portfolio] local->cloud holdings sync failed", error);
              }
            })();
          }
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      applyHoldings(next);

    } catch (error) {
      console.error("portfolio_holdings load error", error);
      const fallback = await localRepository.getHoldings();
      console.info("[portfolio] local fallback used (cloud load failed)", {
        localCount: fallback.length,
      });

      if (requestSeq === requestSeqRef.current) {
        applyHoldings(fallback);
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [applyHoldings, authLoading, isAuthenticated, localRepository, repository, userId]);

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
          const normalizedTicker = input.ticker.trim();
          const normalizedKrCode = resolveKrCodeValue(
            input.market,
            normalizedTicker,
            input.krCode,
          );
          const next: PortfolioHolding = {
            id: createId(),
            market: input.market,
            currency: resolveCurrency(input.market, input.currency),
            ticker: normalizedTicker,
            displayName: normalizeOptionalText(input.displayName),
            comment: normalizeOptionalText(input.comment),
            tickerCode:
              normalizeTickerCode(input.tickerCode) ?? normalizedKrCode,
            logoUrl: normalizeOptionalText(input.logoUrl),
            krCode: normalizedKrCode,
            quoteDisabled: input.quoteDisabled ? true : undefined,
            sector: resolveSector(input.sector),
            position: input.position ?? "N",
            qty: input.qty,
            avgPrice: input.avgPrice,
            currentPrice: input.currentPrice,
            priceUpdatedAt: input.currentPrice > 0 ? nowIso : undefined,
            updatedAt: nowIso,
          };

          await repository.upsertHolding(next, { isCreate: true });
          applyHoldings(await repository.getHoldings());
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[portfolio] failed to create holding", error);
          window.alert(`보유자산 저장 실패: ${message}`);
        }
      })();
    },
    [applyHoldings, isAuthenticated, repository],
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
          const normalizedTicker = input.ticker.trim();
          const normalizedKrCode =
            input.market === "KR"
              ? resolveKrCodeValue(input.market, normalizedTicker, input.krCode) ??
                (target.market === "KR" &&
                target.ticker.trim() === normalizedTicker
                  ? target.krCode
                  : undefined)
              : undefined;
          const next: PortfolioHolding = {
            id: target.id,
            market: input.market,
            currency: resolveCurrency(input.market, input.currency),
            ticker: normalizedTicker,
            displayName: normalizeOptionalText(input.displayName),
            comment: normalizeOptionalText(input.comment),
            tickerCode:
              normalizeTickerCode(input.tickerCode) ??
              normalizedKrCode ??
              normalizeTickerCode(target.tickerCode),
            logoUrl: normalizeOptionalText(input.logoUrl),
            krCode: normalizedKrCode,
            quoteDisabled: input.quoteDisabled ? true : undefined,
            sector: resolveSector(input.sector),
            position: input.position ?? target.position ?? "N",
            qty: input.qty,
            avgPrice: input.avgPrice,
            currentPrice: input.currentPrice,
            prevClose: target.prevClose,
            dayChangePct: target.dayChangePct,
            priceUpdatedAt: input.currentPrice > 0 ? nowIso : undefined,
            updatedAt: nowIso,
          };

          await repository.upsertHolding(next);
          applyHoldings(await repository.getHoldings());
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[portfolio] failed to update holding", error);
          window.alert(`보유자산 수정 실패: ${message}`);
        }
      })();
    },
    [applyHoldings, isAuthenticated, repository],
  );

  const setPosition = useCallback(
    (id: string, position: PortfolioHolding["position"]) => {
      if (!isAuthenticated) {
        return;
      }

      const currentHoldings = holdingsRef.current;
      const target = currentHoldings.find((item) => item.id === id);

      if (!target || target.position === position) {
        return;
      }

      const nextUpdatedAt = new Date().toISOString();
      const nextHolding: PortfolioHolding = {
        ...target,
        position,
        updatedAt: nextUpdatedAt,
      };
      const nextHoldings = currentHoldings.map((item) =>
        item.id === id ? nextHolding : item,
      );

      applyHoldings(nextHoldings);

      void (async () => {
        try {
          await localRepository.upsertHolding(nextHolding);
          await repository.upsertHolding(nextHolding);
          notifyFinanceDataChanged();
        } catch (error) {
          applyHoldings(currentHoldings);
          const message = errorMessage(error);
          console.error("[portfolio] failed to update holding position", error);
          window.alert(`Position 저장 실패: ${message}`);
        }
      })();
    },
    [applyHoldings, isAuthenticated, localRepository, repository],
  );

  const remove = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          await repository.deleteHolding(id);
          applyHoldings(await repository.getHoldings());
          notifyFinanceDataChanged();
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.error("[portfolio] failed to delete holding", error);
          }
          window.alert("보유자산 삭제에 실패했습니다.");
        }
      })();
    },
    [applyHoldings, isAuthenticated, repository],
  );

  const updateQuotes = useCallback(
    async (quoteUpdates: HoldingQuoteUpdate[]) => {
      if (quoteUpdates.length === 0) {
        return;
      }

      try {
        const refreshedAt = new Date().toISOString();
        const updateMap = new Map(quoteUpdates.map((item) => [item.id, item]));
        const currentHoldings = holdingsRef.current;
        const nextHoldings = currentHoldings.map((holding) => {
          const quote = updateMap.get(holding.id);

          if (!quote) {
            return holding;
          }

          return {
            ...holding,
            currentPrice: quote.currentPrice,
            prevClose:
              typeof quote.prevClose === "number" &&
              Number.isFinite(quote.prevClose)
                ? quote.prevClose
                : holding.prevClose,
            dayChangePct:
              typeof quote.dayChangePct === "number" &&
              Number.isFinite(quote.dayChangePct)
                ? quote.dayChangePct
                : holding.dayChangePct,
            displayName:
              normalizeOptionalText(quote.displayName) ??
              holding.displayName,
            logoUrl:
              normalizeOptionalText(quote.logoUrl) ?? holding.logoUrl,
            krCode:
              holding.market === "KR"
                ? quote.krCode ?? holding.krCode
                : undefined,
            tickerCode:
              normalizeTickerCode(quote.tickerCode ?? quote.krCode) ??
              (holding.market === "KR"
                ? normalizeTickerCode(holding.tickerCode ?? holding.krCode)
                : normalizeTickerCode(holding.tickerCode)),
            priceUpdatedAt: quote.asOf ?? refreshedAt,
            updatedAt: refreshedAt,
          };
        });

        const changed = nextHoldings.filter(
          (holding, index) => holding !== currentHoldings[index],
        );

        if (changed.length === 0) {
          return;
        }

        applyHoldings(nextHoldings);

        await Promise.all(changed.map((holding) => localRepository.upsertHolding(holding)));

        const upsertResults = await Promise.allSettled(
          changed.map((holding) => repository.upsertHolding(holding)),
        );
        const upsertFailedCount = upsertResults.filter(
          (result) => result.status === "rejected",
        ).length;

        if (upsertFailedCount > 0) {
          console.error("[portfolio] failed to persist some refreshed quotes", {
            failed: upsertFailedCount,
            total: changed.length,
          });
        }

        notifyFinanceDataChanged();
      } catch (error) {
        console.error("[portfolio] failed to update quotes", error);
      }
    },
    [applyHoldings, localRepository, repository],
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

    applyHoldings(await cloudRepository.getHoldings());
    notifyFinanceDataChanged();

    return {
      uploaded: localHoldings.length,
      total: localHoldings.length,
    };
  }, [applyHoldings, isAuthenticated, userId]);

  return {
    holdings,
    loading,
    refresh,
    create,
    update,
    setPosition,
    remove,
    updateQuotes,
    authLoading,
    isCloudMode: isAuthenticated,
    userId,
    uploadLocalToCloud,
  };
}
