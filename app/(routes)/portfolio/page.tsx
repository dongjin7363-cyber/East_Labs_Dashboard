"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { PortfolioAnalytics } from "@/components/PortfolioAnalytics";
import { PortfolioFormModal } from "@/components/portfolio/PortfolioFormModal";
import { SummaryCardGrid } from "@/components/SummaryCardGrid";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { Currency, Market, PortfolioHolding } from "@/lib/models/types";
import {
  calcHoldingComputed,
  calculatePortfolioTotalAsset,
  filterHoldings,
  HoldingQuoteUpdate,
} from "@/lib/services/portfolioService";
import { moneyFormatParts, percentFormat } from "@/lib/utils/money";
import { SortState, sortRows, toggleSort } from "@/lib/utils/sort";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const DEPOSIT_STORAGE_KEY = "pf_deposit_krw_v1";
const CASH_STORAGE_KEY = "pf_cash_krw_v1";
const LAST_QUOTE_REFRESH_STORAGE_KEY = "pf_last_quote_refresh_at_v1";
const LAST_QUOTE_FAIL_STORAGE_KEY = "pf_last_quote_fail_at_v1";
const QUOTE_BLACKLIST_STORAGE_KEY = "pf_quote_blacklist_v1";
const DEFAULT_FX_RATE = 1350;
const QUOTE_REFRESH_INTERVAL_MS = 7_200_000;
const QUOTE_FAIL_COOLDOWN_MS = 600_000;
const QUOTE_BLACKLIST_TTL_MS = 86_400_000;
const QUOTE_MAX_CONCURRENCY = 2;
const QUOTE_MAX_REQUESTS_PER_RUN = 12;
const QUOTE_FAILURE_TICKER_PREVIEW_LIMIT = 5;

type QuoteFailureReason =
  | "NO_QUOTE"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "BAD_RESPONSE";

interface QuoteApiResponse {
  ok?: boolean;
  ticker: string;
  tickerInput?: string;
  market: "US" | "KR";
  currency: "USD" | "KRW";
  price?: number;
  priceInt: number;
  asOf: string;
  resolvedName?: string;
  resolvedCode?: string;
  reason?: QuoteFailureReason;
  message?: string;
}

interface QuoteBlacklistItem {
  until: number;
}

type QuoteBlacklistMap = Record<string, QuoteBlacklistItem>;

type QuoteFetchResult =
  | {
      ok: true;
      update: HoldingQuoteUpdate;
      ticker: string;
    }
  | {
      ok: false;
      ticker: string;
      reason: QuoteFailureReason;
      status?: number;
      message?: string;
    };

type PortfolioSortKey =
  | "ticker"
  | "qty"
  | "avgPrice"
  | "currentPrice"
  | "marketValue"
  | "pnl"
  | "pnlRate";

interface PortfolioTableRow {
  holding: PortfolioHolding;
  computed: ReturnType<typeof calcHoldingComputed>;
  defaultIndex: number;
}

function parseStoredTimestamp(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function normalizeKrCodeInput(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

function formatKstTime(timestampMs: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestampMs));

  const get = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === key)?.value ?? "";

  return `${get("hour")}:${get("minute")}:${get("second")}`;
}

function sanitizeQuoteBlacklist(raw: unknown): QuoteBlacklistMap {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const now = Date.now();
  const input = raw as Record<string, unknown>;
  const next: QuoteBlacklistMap = {};

  Object.entries(input).forEach(([ticker, value]) => {
    if (!ticker) {
      return;
    }

    if (!value || typeof value !== "object") {
      return;
    }

    const until = Number((value as { until?: unknown }).until);

    if (!Number.isFinite(until) || until <= now) {
      return;
    }

    next[ticker.trim().toUpperCase()] = { until };
  });

  return next;
}

function readQuoteBlacklist(): QuoteBlacklistMap {
  try {
    const raw = window.localStorage.getItem(QUOTE_BLACKLIST_STORAGE_KEY);

    if (!raw) {
      return {};
    }

    return sanitizeQuoteBlacklist(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeQuoteBlacklist(blacklist: QuoteBlacklistMap): void {
  window.localStorage.setItem(QUOTE_BLACKLIST_STORAGE_KEY, JSON.stringify(blacklist));
}

export default function PortfolioPage() {
  const { holdings, loading, create, update, remove, updateQuotes } = usePortfolio();
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioHolding | undefined>();
  const [market, setMarket] = useState<"ALL" | Market>("ALL");
  const [search, setSearch] = useState("");
  const [sortState, setSortState] = useState<SortState<PortfolioSortKey>>({
    key: null,
    mode: null,
  });
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [fxAsOf, setFxAsOf] = useState("");
  const [depositKrw, setDepositKrw] = useState(0);
  const [depositInput, setDepositInput] = useState("");
  const [cashKrw, setCashKrw] = useState(0);
  const [cashInput, setCashInput] = useState("");
  const [isRefreshingQuotes, setIsRefreshingQuotes] = useState(false);
  const [lastQuoteRefreshAt, setLastQuoteRefreshAt] = useState<number | null>(null);
  const [lastQuoteFailAt, setLastQuoteFailAt] = useState<number | null>(null);
  const [quoteWarning, setQuoteWarning] = useState<string | null>(null);
  const [quoteRefreshSummary, setQuoteRefreshSummary] = useState<string>("-");
  const [quoteBlacklist, setQuoteBlacklist] = useState<QuoteBlacklistMap>({});
  const [quoteMetaLoaded, setQuoteMetaLoaded] = useState(false);
  const [unmatchedKrTickers, setUnmatchedKrTickers] = useState<string[]>([]);
  const [manualKrTicker, setManualKrTicker] = useState<string | null>(null);
  const [manualKrCodeInput, setManualKrCodeInput] = useState("");
  const quoteRefreshInFlightRef = useRef(false);
  const portfolioDebugLoggedRef = useRef(false);

  useEffect(() => {
    const savedFx = window.localStorage.getItem(FX_STORAGE_KEY);
    if (savedFx) {
      const parsedFx = Number(savedFx);
      if (Number.isFinite(parsedFx) && parsedFx > 0) {
        setFxRate(parsedFx);
      }
    }

    const savedDeposit = window.localStorage.getItem(DEPOSIT_STORAGE_KEY);
    const savedCash = window.localStorage.getItem(CASH_STORAGE_KEY);

    const migratedFromLegacyCash =
      !savedDeposit && savedCash && /^\d+$/.test(savedCash);

    if (migratedFromLegacyCash) {
      // Backward compatibility: previous versions stored the single cash input as deposit.
      const legacyDeposit = Number.parseInt(savedCash, 10);
      setDepositKrw(legacyDeposit);
      setDepositInput(legacyDeposit === 0 ? "" : `${legacyDeposit}`);
      setCashKrw(0);
      setCashInput("");
      window.localStorage.setItem(DEPOSIT_STORAGE_KEY, `${legacyDeposit}`);
      window.localStorage.setItem(CASH_STORAGE_KEY, "0");
    }

    if (!migratedFromLegacyCash && savedDeposit && /^\d+$/.test(savedDeposit)) {
      const parsedDeposit = Number.parseInt(savedDeposit, 10);
      setDepositKrw(parsedDeposit);
      setDepositInput(parsedDeposit === 0 ? "" : `${parsedDeposit}`);
    }

    if (!migratedFromLegacyCash && savedCash && /^\d+$/.test(savedCash)) {
      const parsedCash = Number.parseInt(savedCash, 10);
      setCashKrw(parsedCash);
      setCashInput(parsedCash === 0 ? "" : `${parsedCash}`);
    }

    const savedLastRefreshAt = parseStoredTimestamp(
      window.localStorage.getItem(LAST_QUOTE_REFRESH_STORAGE_KEY),
    );
    const savedLastFailAt = parseStoredTimestamp(
      window.localStorage.getItem(LAST_QUOTE_FAIL_STORAGE_KEY),
    );

    setLastQuoteRefreshAt(savedLastRefreshAt);
    setLastQuoteFailAt(savedLastFailAt);
    setQuoteBlacklist(readQuoteBlacklist());
    setQuoteMetaLoaded(true);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadFx = async () => {
      try {
        const response = await fetch("/api/fx");

        if (!response.ok) {
          throw new Error(`FX API error: ${response.status}`);
        }

        const data: unknown = await response.json();
        const nextRate =
          typeof data === "object" && data !== null && "rate" in data
            ? Number((data as { rate: unknown }).rate)
            : NaN;
        const nextAsOf =
          typeof data === "object" && data !== null && "asOf" in data
            ? String((data as { asOf: unknown }).asOf)
            : "";

        if (!mounted || !Number.isFinite(nextRate) || nextRate <= 0) {
          return;
        }

        setFxRate(nextRate);
        setFxAsOf(nextAsOf);
        window.localStorage.setItem(FX_STORAGE_KEY, `${nextRate}`);
      } catch {
        // Fallback keeps current fxRate from localStorage/default.
      }
    };

    void loadFx();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return filterHoldings(holdings, {
      market,
      search,
    });
  }, [holdings, market, search]);

  const isQuoteStale = useCallback((holding: PortfolioHolding): boolean => {
    if (holding.currentPrice <= 0) {
      return true;
    }

    if (!holding.priceUpdatedAt) {
      return true;
    }

    const updatedAtMs = new Date(holding.priceUpdatedAt).getTime();

    if (Number.isNaN(updatedAtMs)) {
      return true;
    }

    return Date.now() - updatedAtMs >= QUOTE_REFRESH_INTERVAL_MS;
  }, []);

  const fetchHoldingQuote = useCallback(
    async (holding: PortfolioHolding): Promise<QuoteFetchResult> => {
      if (holding.market !== "US" && holding.market !== "KR") {
        return {
          ok: false,
          ticker: holding.ticker,
          status: 400,
          reason: "BAD_RESPONSE",
          message: "지원하지 않는 시장입니다.",
        };
      }

      try {
        const queryTicker =
          holding.market === "KR" && holding.krCode
            ? holding.krCode
            : holding.ticker;
        const response = await fetch(
          `/api/quote?market=${holding.market}&ticker=${encodeURIComponent(queryTicker)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          let message = `시세 업데이트 실패 (${response.status})`;

          try {
            const errorPayload: unknown = await response.json();

            if (
              typeof errorPayload === "object" &&
              errorPayload !== null &&
              "message" in errorPayload
            ) {
              const apiMessage = String(
                (errorPayload as { message?: unknown }).message ?? "",
              ).trim();

              if (apiMessage) {
                message = `시세 업데이트 실패 (${response.status}): ${apiMessage}`;
              }
            }
          } catch {
            // Keep default message.
          }

          return {
            ok: false,
            ticker: holding.ticker,
            status: response.status,
            reason:
              response.status === 429
                ? "RATE_LIMIT"
                : response.status === 404
                  ? "NOT_FOUND"
                  : "BAD_RESPONSE",
            message,
          };
        }

        const data: unknown = await response.json();

        if (typeof data !== "object" || data === null) {
          return {
            ok: false,
            ticker: holding.ticker,
            status: 502,
            reason: "BAD_RESPONSE",
            message: "시세 응답 형식이 올바르지 않습니다.",
          };
        }

        const parsed = data as Partial<QuoteApiResponse>;
        const responseTicker =
          typeof parsed.ticker === "string" && parsed.ticker.trim() !== ""
            ? parsed.ticker.trim().toUpperCase()
            : holding.ticker;

        if (parsed.ok === false) {
          return {
            ok: false,
            ticker: responseTicker,
            reason:
              parsed.reason === "NO_QUOTE" ||
              parsed.reason === "NOT_FOUND" ||
              parsed.reason === "RATE_LIMIT" ||
              parsed.reason === "BAD_RESPONSE"
                ? parsed.reason
                : "BAD_RESPONSE",
            message:
              typeof parsed.message === "string" && parsed.message.trim() !== ""
                ? parsed.message
                : "시세 조회 실패",
          };
        }

        const directPriceInt = Number(parsed.priceInt);
        let priceInt = directPriceInt;

        if (!Number.isFinite(priceInt) || priceInt <= 0) {
          const floatPrice = Number(parsed.price);

          if (Number.isFinite(floatPrice) && floatPrice > 0) {
            if (parsed.currency === "USD") {
              priceInt = Math.round(floatPrice * 100);
            } else {
              priceInt = Math.round(floatPrice);
            }
          }
        }

        if (!Number.isFinite(priceInt) || priceInt <= 0) {
          return {
            ok: false,
            ticker: responseTicker,
            status: 502,
            reason: "BAD_RESPONSE",
            message: "시세 값이 유효하지 않습니다.",
          };
        }

        return {
          ok: true,
          ticker: responseTicker,
          update: {
            id: holding.id,
            currentPrice: priceInt,
            krCode:
              holding.market === "KR" && typeof parsed.resolvedCode === "string"
                ? parsed.resolvedCode
                : undefined,
            asOf:
              typeof parsed.asOf === "string"
                ? parsed.asOf
                : new Date().toISOString(),
          },
        };
      } catch {
        return {
          ok: false,
          ticker: holding.ticker,
          reason: "BAD_RESPONSE",
          message: "시세 업데이트 실패 (네트워크 오류)",
        };
      }
    },
    [],
  );

  const refreshQuotesForVisible = useCallback(
    async ({
      staleOnly,
      force = false,
    }: {
      staleOnly: boolean;
      force?: boolean;
    }) => {
      if (quoteRefreshInFlightRef.current) {
        return;
      }

      const now = Date.now();
      const activeBlacklist = sanitizeQuoteBlacklist(quoteBlacklist);

      if (Object.keys(activeBlacklist).length !== Object.keys(quoteBlacklist).length) {
        setQuoteBlacklist(activeBlacklist);
        writeQuoteBlacklist(activeBlacklist);
      }

      const sourceHoldings = force ? holdings : filtered;
      const candidateTargets = sourceHoldings.filter(
        (holding) =>
          (holding.market === "US" || holding.market === "KR") &&
          !holding.quoteDisabled &&
          (!staleOnly || isQuoteStale(holding)),
      );

      const targets = force
        ? candidateTargets
        : candidateTargets.filter(
            (holding) => !activeBlacklist[holding.ticker.trim().toUpperCase()],
          );

      if (targets.length === 0) {
        if (!force && candidateTargets.length > 0) {
          setQuoteWarning("지원되지 않는 티커는 24시간 동안 자동 스킵됩니다.");
        }

        return;
      }

      if (!force) {
        if (document.visibilityState !== "visible") {
          return;
        }

        if (
          lastQuoteRefreshAt !== null &&
          now - lastQuoteRefreshAt < QUOTE_REFRESH_INTERVAL_MS
        ) {
          return;
        }

        if (lastQuoteFailAt !== null && now - lastQuoteFailAt < QUOTE_FAIL_COOLDOWN_MS) {
          return;
        }
      }

      const cappedTargets = targets.slice(0, QUOTE_MAX_REQUESTS_PER_RUN);
      const deferredCount = Math.max(targets.length - cappedTargets.length, 0);

      quoteRefreshInFlightRef.current = true;
      setIsRefreshingQuotes(true);

      try {
        const updates: HoldingQuoteUpdate[] = [];
        const failedItems: Array<{ ticker: string; reason: QuoteFailureReason }> = [];
        const failedNoQuoteTickers: string[] = [];
        const failedNotFoundKrTickers: string[] = [];
        let hasRateLimitFailure = false;
        let cursor = 0;

        const workers = Array.from(
          { length: Math.min(QUOTE_MAX_CONCURRENCY, cappedTargets.length) },
          async () => {
            while (true) {
              const currentIndex = cursor;
              cursor += 1;

              if (currentIndex >= cappedTargets.length) {
                return;
              }

              const targetHolding = cappedTargets[currentIndex];
              const result = await fetchHoldingQuote(targetHolding);

              if (result.ok) {
                updates.push(result.update);
              } else {
                failedItems.push({ ticker: result.ticker, reason: result.reason });

                if (result.reason === "NO_QUOTE" || result.reason === "NOT_FOUND") {
                  failedNoQuoteTickers.push(targetHolding.ticker);
                }

                if (result.reason === "NOT_FOUND" && targetHolding.market === "KR") {
                  failedNotFoundKrTickers.push(targetHolding.ticker);
                }

                if (result.reason === "RATE_LIMIT") {
                  hasRateLimitFailure = true;
                }

              }
            }
          },
        );

        await Promise.all(workers);

        const completedAt = Date.now();
        setLastQuoteRefreshAt(completedAt);
        window.localStorage.setItem(LAST_QUOTE_REFRESH_STORAGE_KEY, `${completedAt}`);

        if (failedNoQuoteTickers.length > 0) {
          const nextBlacklist: QuoteBlacklistMap = {
            ...activeBlacklist,
          };

          failedNoQuoteTickers.forEach((ticker) => {
            nextBlacklist[ticker.trim().toUpperCase()] = {
              until: completedAt + QUOTE_BLACKLIST_TTL_MS,
            };
          });

          setQuoteBlacklist(nextBlacklist);
          writeQuoteBlacklist(nextBlacklist);
        }

        if (updates.length > 0) {
          updateQuotes(updates);
        }

        setUnmatchedKrTickers(Array.from(new Set(failedNotFoundKrTickers)));

        if (failedItems.length > 0) {
          const failedAt = Date.now();
          setLastQuoteFailAt(failedAt);
          window.localStorage.setItem(LAST_QUOTE_FAIL_STORAGE_KEY, `${failedAt}`);

          const uniqueFailedTickers = Array.from(
            new Set(failedItems.map((item) => item.ticker)),
          );
          const previewTickers = uniqueFailedTickers
            .slice(0, QUOTE_FAILURE_TICKER_PREVIEW_LIMIT)
            .join(", ");
          const suffix =
            uniqueFailedTickers.length > QUOTE_FAILURE_TICKER_PREVIEW_LIMIT
              ? ", ..."
              : "";
          const rateLimitText = hasRateLimitFailure ? " (요청 제한 포함)" : "";
          const deferredText =
            deferredCount > 0 ? ` 요청 제한으로 ${deferredCount}건은 다음 갱신으로 연기됨.` : "";
          const nextWarning = `시세 업데이트 실패 ${failedItems.length}건 (${previewTickers}${suffix})${rateLimitText}. 2시간 후 자동 재시도.${deferredText}`.trim();

          setQuoteWarning(nextWarning);
          const reasonCounts = failedItems.reduce<Record<string, number>>((acc, item) => {
            const reason = item.reason;
            acc[reason] = (acc[reason] ?? 0) + 1;
            return acc;
          }, {});
          const reasonText = Object.entries(reasonCounts)
            .map(([reason, count]) => `${reason} ${count}`)
            .join(", ");
          const failedTickerText = failedItems
            .slice(0, QUOTE_FAILURE_TICKER_PREVIEW_LIMIT)
            .map((item) => `${item.ticker}(${item.reason})`)
            .join(", ");
          const failedTickerSuffix =
            failedItems.length > QUOTE_FAILURE_TICKER_PREVIEW_LIMIT ? ", ..." : "";
          setQuoteRefreshSummary(
            `성공 ${updates.length}건 / 실패 ${failedItems.length}건${reasonText ? ` (${reasonText})` : ""}${failedTickerText ? ` | 실패 티커: ${failedTickerText}${failedTickerSuffix}` : ""}`,
          );

        } else {
          setLastQuoteFailAt(null);
          window.localStorage.removeItem(LAST_QUOTE_FAIL_STORAGE_KEY);

          if (deferredCount > 0) {
            setQuoteWarning(`요청 제한으로 ${deferredCount}건은 다음 갱신으로 연기됨.`);
          } else {
            setQuoteWarning(null);
          }

          setQuoteRefreshSummary(`성공 ${updates.length}건 / 실패 0건`);
        }
      } finally {
        quoteRefreshInFlightRef.current = false;
        setIsRefreshingQuotes(false);
      }
    },
    [
      fetchHoldingQuote,
      filtered,
      holdings,
      isQuoteStale,
      lastQuoteFailAt,
      lastQuoteRefreshAt,
      quoteBlacklist,
      updateQuotes,
    ],
  );

  useEffect(() => {
    if (loading || !quoteMetaLoaded) {
      return;
    }

    void refreshQuotesForVisible({ staleOnly: true, force: false });
  }, [loading, quoteMetaLoaded, refreshQuotesForVisible]);

  useEffect(() => {
    if (loading || !quoteMetaLoaded) {
      return;
    }

    if (document.visibilityState !== "visible") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshQuotesForVisible({ staleOnly: true, force: false });
    }, QUOTE_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loading, quoteMetaLoaded, refreshQuotesForVisible]);

  useEffect(() => {
    if (!quoteMetaLoaded) {
      return;
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshQuotesForVisible({ staleOnly: true, force: false });
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [quoteMetaLoaded, refreshQuotesForVisible]);

  const totalAsset = useMemo(
    () =>
      calculatePortfolioTotalAsset({
        holdings: filtered,
        fxRate,
        depositKrw,
        cashKrw,
      }),
    [cashKrw, depositKrw, filtered, fxRate],
  );
  const tableRows = useMemo<PortfolioTableRow[]>(
    () =>
      filtered.map((holding, index) => ({
        holding,
        computed: calcHoldingComputed(holding),
        defaultIndex: index,
      })),
    [filtered],
  );
  const sortedTableRows = useMemo(
    () =>
      sortRows(
        tableRows,
        sortState,
        (row, key) => {
          if (key === "ticker") {
            return row.holding.ticker;
          }

          if (key === "qty") {
            return row.holding.qty;
          }

          if (key === "avgPrice") {
            return row.holding.avgPrice;
          }

          if (key === "currentPrice") {
            return row.holding.currentPrice;
          }

          if (key === "marketValue") {
            return row.computed.marketValue;
          }

          if (key === "pnl") {
            return row.computed.pnl;
          }

          return row.computed.pnlRate;
        },
        (a, b) => a.defaultIndex - b.defaultIndex,
      ),
    [sortState, tableRows],
  );
  const totalKrwEval = totalAsset.totalKrwEval;
  const usdTotalKrw = totalAsset.usdTotalKrw;
  const usdPnlKrw = totalAsset.usdPnlKrw;
  const totalKrwPnl = totalAsset.totalKrwPnl;
  const totalAssetKrw = totalAsset.totalAssetKrw;

  const tableUsdMvCents = useMemo(
    () =>
      tableRows.reduce(
        (sum, row) =>
          row.holding.market === "US" ? sum + row.computed.marketValue : sum,
        0,
      ),
    [tableRows],
  );
  const tableKrwMvWon = useMemo(
    () =>
      tableRows.reduce(
        (sum, row) =>
          row.holding.market === "KR" ? sum + row.computed.marketValue : sum,
        0,
      ),
    [tableRows],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    if (portfolioDebugLoggedRef.current || loading) {
      return;
    }

    const sumTableUsdMv = tableUsdMvCents / 100;
    const totalUsdMv = totalAsset.usdHoldingsMarketValueCents / 100;
    const sumTableKrwMv = tableKrwMvWon;
    const totalKrwMvWon = totalAsset.totalKrwEval;
    const totalAssetKrwWon = totalAsset.totalAssetKrw;
    const formulaTotalAssetKrw =
      totalAsset.totalKrwEval + totalAsset.usdTotalKrw + Math.max(cashKrw, 0);

    console.log(
      "[portfolio-debug]",
      {
        sumTableUsdMv,
        totalUsdMv,
        usdMatch: sumTableUsdMv === totalUsdMv,
      },
      {
        sumTableKrwMv,
        totalKrwMvWithoutDeposit: totalKrwMvWon - Math.max(depositKrw, 0),
        krwMatch: sumTableKrwMv === totalKrwMvWon - Math.max(depositKrw, 0),
      },
      {
        totalAssetKrwWon,
        formulaTotalAssetKrw,
        totalMatch: totalAssetKrwWon === formulaTotalAssetKrw,
      },
    );

    portfolioDebugLoggedRef.current = true;
  }, [
    cashKrw,
    depositKrw,
    loading,
    tableKrwMvWon,
    tableUsdMvCents,
    totalAsset,
  ]);

  const renderMoney = (
    currency: Currency,
    amountInt: number,
    mode: "default" | "table" = "default",
  ): ReactNode => {
    const parts = moneyFormatParts(currency, amountInt);

    return (
      <span className={`money-inline ${mode === "table" ? "is-table" : ""}`}>
        <span className="money-symbol">{parts.symbol}</span>
        <span className="money-value">{parts.valueText}</span>
      </span>
    );
  };

  const cards = [
    {
      title: "총 평가금액 (KRW)",
      value: renderMoney("KRW", totalKrwEval),
    },
    {
      title: "총 평가금액 (USD)",
      value: renderMoney("USD", totalAsset.marketValue.USD),
      subtitle: (
        <span>
          ({renderMoney("KRW", usdTotalKrw)})
        </span>
      ),
    },
    {
      title: "예수금 (KRW)",
      value: renderMoney("KRW", depositKrw),
    },
    {
      title: "현금 (KRW)",
      value: renderMoney("KRW", cashKrw),
    },
    {
      title: "총 손익 (KRW)",
      value: renderMoney("KRW", totalKrwPnl),
      tone:
        totalKrwPnl >= 0 ? ("positive" as const) : ("negative" as const),
    },
    {
      title: "총 손익 (USD)",
      value: renderMoney("USD", totalAsset.pnl.USD),
      subtitle: (
        <span>
          ({renderMoney("KRW", usdPnlKrw)})
        </span>
      ),
      tone:
        totalAsset.pnl.USD >= 0 ? ("positive" as const) : ("negative" as const),
    },
  ];

  const handleDepositInputChange = (rawDigits: string) => {
    if (!rawDigits) {
      setDepositInput("");
      setDepositKrw(0);
      window.localStorage.setItem(DEPOSIT_STORAGE_KEY, "0");
      return;
    }

    const amount = Number.parseInt(rawDigits, 10);
    setDepositKrw(amount);
    setDepositInput(rawDigits);
    window.localStorage.setItem(DEPOSIT_STORAGE_KEY, `${amount}`);
  };

  const handleCashInputChange = (rawDigits: string) => {
    if (!rawDigits) {
      setCashInput("");
      setCashKrw(0);
      window.localStorage.setItem(CASH_STORAGE_KEY, "0");
      return;
    }

    const amount = Number.parseInt(rawDigits, 10);
    setCashKrw(amount);
    setCashInput(rawDigits);
    window.localStorage.setItem(CASH_STORAGE_KEY, `${amount}`);
  };

  const handleCreate = () => {
    setEditing(undefined);
    setModalOpen(true);
  };

  const handleEdit = (holding: PortfolioHolding) => {
    setEditing(holding);
    setModalOpen(true);
  };

  const handleDelete = (id: string): boolean => {
    if (!window.confirm("해당 보유자산을 삭제할까요?")) {
      return false;
    }

    remove(id);
    return true;
  };

  const handleSortClick = (key: PortfolioSortKey) => {
    setSortState((prev) => toggleSort(prev, key));
  };

  const handleManualQuoteRefresh = () => {
    console.log("[quote-refresh] manual refresh clicked");
    void refreshQuotesForVisible({ staleOnly: false, force: true });
  };

  const unmatchedKrDisplayTickers = useMemo(() => {
    const blacklistedKrTickers = holdings
      .filter(
        (holding) =>
          holding.market === "KR" &&
          !holding.quoteDisabled &&
          !holding.krCode &&
          Boolean(quoteBlacklist[holding.ticker.trim().toUpperCase()]),
      )
      .map((holding) => holding.ticker);

    return Array.from(new Set([...unmatchedKrTickers, ...blacklistedKrTickers]));
  }, [holdings, quoteBlacklist, unmatchedKrTickers]);

  const openManualKrCodeModal = (ticker: string) => {
    const target = holdings.find(
      (holding) => holding.market === "KR" && holding.ticker === ticker,
    );

    if (!target) {
      window.alert("해당 KR 종목을 찾을 수 없습니다.");
      return;
    }

    setManualKrTicker(ticker);
    setManualKrCodeInput(target.krCode ?? "");
  };

  const closeManualKrCodeModal = () => {
    setManualKrTicker(null);
    setManualKrCodeInput("");
  };

  const handleManualKrCodeSave = async () => {
    if (!manualKrTicker) {
      return;
    }

    const normalizedCode = normalizeKrCodeInput(manualKrCodeInput);

    if (!/^[A-Z0-9]{1,12}$/.test(normalizedCode)) {
      window.alert("종목코드는 영문 대문자/숫자 조합(1~12자)으로 입력하세요.");
      return;
    }

    const target = holdings.find(
      (holding) => holding.market === "KR" && holding.ticker === manualKrTicker,
    );

    if (!target) {
      window.alert("선택한 KR 종목을 찾을 수 없습니다.");
      return;
    }

    update(target.id, {
      market: target.market,
      currency: target.currency,
      ticker: target.ticker,
      krCode: normalizedCode,
      quoteDisabled: target.quoteDisabled,
      sector: target.sector,
      qty: target.qty,
      avgPrice: target.avgPrice,
      currentPrice: target.currentPrice,
    });

    setQuoteBlacklist((prev) => {
      const next = { ...prev };
      delete next[target.ticker.trim().toUpperCase()];
      delete next[normalizedCode.toUpperCase()];
      writeQuoteBlacklist(next);
      return next;
    });

    setUnmatchedKrTickers((prev) =>
      prev.filter((ticker) => ticker !== target.ticker),
    );

    closeManualKrCodeModal();

    try {
      const response = await fetch(
        `/api/quote?market=KR&ticker=${encodeURIComponent(normalizedCode)}`,
        {
          cache: "no-store",
        },
      );

      const payload: unknown = await response.json();

      if (!payload || typeof payload !== "object") {
        setQuoteWarning("수동 코드 저장 후 시세 조회에 실패했습니다.");
        return;
      }

      const parsed = payload as Partial<QuoteApiResponse>;

      if (parsed.ok === false) {
        setQuoteWarning(
          `수동 코드(${normalizedCode}) 조회 실패: ${
            typeof parsed.message === "string" ? parsed.message : "UNKNOWN"
          }`,
        );
        return;
      }

      const updatedPriceInt = Number(parsed.priceInt);

      if (!Number.isFinite(updatedPriceInt) || updatedPriceInt <= 0) {
        setQuoteWarning("수동 코드 저장 후 시세 값이 유효하지 않습니다.");
        return;
      }

      updateQuotes([
        {
          id: target.id,
          currentPrice: Math.round(updatedPriceInt),
          krCode: normalizedCode,
          asOf:
            typeof parsed.asOf === "string"
              ? parsed.asOf
              : new Date().toISOString(),
        },
      ]);

      setQuoteWarning(null);
      setQuoteRefreshSummary("수동 코드로 1건 갱신 완료");
      const nowTs = Date.now();
      setLastQuoteRefreshAt(nowTs);
      window.localStorage.setItem(LAST_QUOTE_REFRESH_STORAGE_KEY, `${nowTs}`);
    } catch {
      setQuoteWarning("수동 코드 저장 후 시세 조회 중 네트워크 오류가 발생했습니다.");
    }

    void refreshQuotesForVisible({ staleOnly: false, force: true });
  };

  const sortIndicator = (key: PortfolioSortKey): string => {
    if (sortState.key !== key || !sortState.mode) {
      return "";
    }

    return sortState.mode === "DESC" ? "▼" : "▲";
  };

  return (
    <>
      <PageHeader
        title="Portfolio"
        titleMeta={
          <span className="inline-title-metric">
            <span className="inline-title-divider">|</span>
            <span className="inline-title-metric-label">총자산(원화)</span>
            {renderMoney("KRW", totalAssetKrw)}
          </span>
        }
        actions={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={handleManualQuoteRefresh}
              disabled={isRefreshingQuotes}
            >
              {isRefreshingQuotes ? "현재가 갱신 중..." : "현재가 갱신"}
            </button>
            <button type="button" className="primary-button" onClick={handleCreate}>
              추가
            </button>
          </>
        }
      />

      <section className="panel cash-panel">
        <div className="filter-row cash-row">
          <label>
            예수금 (KRW)
            <FormattedNumberInput
              className="cash-input"
              placeholder="예: 1,000,000"
              value={depositInput}
              onValueChange={handleDepositInputChange}
            />
          </label>
          <label>
            현금 (KRW)
            <FormattedNumberInput
              className="cash-input"
              placeholder="예: 500,000"
              value={cashInput}
              onValueChange={handleCashInputChange}
            />
          </label>
          <div className="fx-meta">
            <div>
              자동 환율(USD→KRW{fxAsOf ? `, ${fxAsOf}` : ""}):{" "}
              <strong>{fxRate.toLocaleString("ko-KR")}</strong>
            </div>
            <div>
              Last refresh:{" "}
              <strong>
                {lastQuoteRefreshAt ? formatKstTime(lastQuoteRefreshAt) : "-"}
              </strong>
            </div>
            <div>
              <span>결과: </span>
              <strong>{quoteRefreshSummary}</strong>
            </div>
            {quoteWarning ? <div className="quote-warning">{quoteWarning}</div> : null}
            {unmatchedKrDisplayTickers.length > 0 ? (
              <div className="quote-unmatched-row">
                <span>미매칭 티커:</span>
                {unmatchedKrDisplayTickers.map((ticker) => (
                  <button
                    key={ticker}
                    type="button"
                    className="quote-unmatched-link"
                    onClick={() => openManualKrCodeModal(ticker)}
                  >
                    {ticker}
                  </button>
                ))}
                <span className="quote-unmatched-hint">
                  클릭 후 종목코드 입력
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <SummaryCardGrid cards={cards} />

      <section className="panel">
        <div className="filter-row">
          <label>
            Market
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                className={market === "ALL" ? "primary-button" : "secondary-button"}
                onClick={() => setMarket("ALL")}
              >
                ALL
              </button>
              <button
                type="button"
                className={market === "KR" ? "primary-button" : "secondary-button"}
                onClick={() => setMarket("KR")}
              >
                KR
              </button>
              <button
                type="button"
                className={market === "US" ? "primary-button" : "secondary-button"}
                onClick={() => setMarket("US")}
              >
                US
              </button>
            </div>
          </label>

          <label>
            검색
            <input
              placeholder="Ticker"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("ticker")}
                  >
                    Ticker
                    <span className="sort-indicator">{sortIndicator("ticker")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("qty")}
                  >
                    Qty
                    <span className="sort-indicator">{sortIndicator("qty")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("avgPrice")}
                  >
                    AvgPrice
                    <span className="sort-indicator">{sortIndicator("avgPrice")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("currentPrice")}
                  >
                    CurrentPrice
                    <span className="sort-indicator">{sortIndicator("currentPrice")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("marketValue")}
                  >
                    MarketValue
                    <span className="sort-indicator">{sortIndicator("marketValue")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("pnl")}
                  >
                    PnL
                    <span className="sort-indicator">{sortIndicator("pnl")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("pnlRate")}
                  >
                    PnL%
                    <span className="sort-indicator">{sortIndicator("pnlRate")}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>로딩 중...</td>
                </tr>
              ) : sortedTableRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty-state">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedTableRows.map((row) => {
                  const { holding, computed } = row;

                  return (
                    <tr
                      key={holding.id}
                      className="clickable-row"
                      onClick={() => handleEdit(holding)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleEdit(holding);
                        }
                      }}
                      tabIndex={0}
                    >
                      <td>{holding.ticker}</td>
                      <td>{holding.qty}</td>
                      <td>{renderMoney(holding.currency, holding.avgPrice, "table")}</td>
                      <td>{renderMoney(holding.currency, holding.currentPrice, "table")}</td>
                      <td>{renderMoney(holding.currency, computed.marketValue, "table")}</td>
                      <td
                        style={{
                          color: computed.pnl >= 0 ? "var(--positive)" : "var(--negative)",
                        }}
                      >
                        {renderMoney(holding.currency, computed.pnl, "table")}
                      </td>
                      <td
                        style={{
                          color:
                            computed.pnlRate >= 0
                              ? "var(--positive)"
                              : "var(--negative)",
                        }}
                      >
                        {percentFormat(computed.pnlRate)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <PortfolioAnalytics
        holdings={holdings}
        depositKrw={depositKrw}
        cashKrw={cashKrw}
        fxRate={fxRate}
      />

      <Modal
        open={Boolean(manualKrTicker)}
        title="수동으로 종목코드 입력"
        onClose={closeManualKrCodeModal}
      >
        <div className="form-grid">
          <label className="full">
            Ticker
            <input value={manualKrTicker ?? ""} disabled />
          </label>
          <label className="full">
            종목코드
            <input
              value={manualKrCodeInput}
              onChange={(event) =>
                setManualKrCodeInput(normalizeKrCodeInput(event.target.value))
              }
              placeholder="예: 005930 또는 0126Z0"
              inputMode="text"
              maxLength={12}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleManualKrCodeSave}
          >
            Save
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={closeManualKrCodeModal}
          >
            Cancel
          </button>
        </div>
      </Modal>

      <PortfolioFormModal
        open={isModalOpen}
        mode={editing ? "edit" : "create"}
        holding={editing}
        onClose={() => setModalOpen(false)}
        onDelete={
          editing
            ? () => {
                const deleted = handleDelete(editing.id);

                if (!deleted) {
                  return;
                }

                setModalOpen(false);
                setEditing(undefined);
              }
            : undefined
        }
        onSubmit={(input) => {
          if (editing) {
            update(editing.id, input);
            return;
          }

          create(input);
        }}
      />
    </>
  );
}
