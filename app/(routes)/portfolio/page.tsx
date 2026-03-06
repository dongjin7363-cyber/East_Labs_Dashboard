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
import { PortfolioAllocationDonut } from "@/components/portfolio/PortfolioAllocationDonut";
import { PortfolioFormModal } from "@/components/portfolio/PortfolioFormModal";
import { HoldingAvatar } from "@/components/portfolio/HoldingAvatar";
import { usePortfolioAccountState } from "@/lib/hooks/usePortfolioAccountState";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { Currency, Market, PortfolioHolding } from "@/lib/models/types";
import {
  calcHoldingComputed,
  calculatePortfolioTotalAsset,
  filterHoldings,
  HoldingQuoteUpdate,
  PortfolioInput,
} from "@/lib/services/portfolioService";
import {
  moneyFormatParts,
  parsePriceInputToInt,
  percentFormat,
  usdCentsToUsdFloat,
  usdToKrw,
} from "@/lib/utils/money";
import { SortState, sortRows, toggleSort } from "@/lib/utils/sort";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
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
  currentPriceInt?: number;
  price?: number;
  priceInt: number;
  prevClose?: number;
  prevCloseInt?: number;
  dayChangePct?: number;
  changePercent?: number;
  regularMarketChangePercent?: number;
  displayName?: string | null;
  tickerCode?: string | null;
  logoUrl?: string | null;
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
      debugRaw?: unknown;
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
  | "dailyChangeRate"
  | "avgPrice"
  | "currentPrice"
  | "qty"
  | "marketValue"
  | "pnl"
  | "pnlRate"
  | "comment";

interface PortfolioTableRow {
  holding: PortfolioHolding;
  computed: ReturnType<typeof calcHoldingComputed>;
  dailyChangeRate: number | null;
  defaultIndex: number;
}

const US_DISPLAY_NAME_FALLBACK: Record<string, string> = {
  RKLB: "Rocket Lab",
};

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

function resolveHoldingDisplayName(holding: PortfolioHolding): string {
  const explicitName = holding.displayName?.trim();

  if (explicitName) {
    return explicitName;
  }

  if (holding.market === "US") {
    const symbol = holding.ticker.trim().toUpperCase();

    if (US_DISPLAY_NAME_FALLBACK[symbol]) {
      return US_DISPLAY_NAME_FALLBACK[symbol];
    }
  }

  return holding.ticker;
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

function formatDailyChangeLabel(rate: number): string {
  if (rate > 0) {
    return `↑ ${percentFormat(rate)}`;
  }

  if (rate < 0) {
    return `↓ ${percentFormat(rate)}`;
  }

  return percentFormat(rate);
}

function resolveHoldingDayChangePct(holding: PortfolioHolding): number | null {
  if (
    typeof holding.dayChangePct === "number" &&
    Number.isFinite(holding.dayChangePct)
  ) {
    return holding.dayChangePct;
  }

  if (
    typeof holding.prevClose === "number" &&
    Number.isFinite(holding.prevClose) &&
    holding.prevClose > 0 &&
    Number.isFinite(holding.currentPrice) &&
    holding.currentPrice > 0
  ) {
    return ((holding.currentPrice - holding.prevClose) / holding.prevClose) * 100;
  }

  return null;
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
  const {
    holdings,
    loading,
    create,
    update,
    remove,
    updateQuotes,
    authLoading,
    isCloudMode,
  } = usePortfolio();
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioHolding | undefined>();
  const [market, setMarket] = useState<"ALL" | Market>("ALL");
  const [search, setSearch] = useState("");
  const [sortState, setSortState] = useState<SortState<PortfolioSortKey>>({
    key: null,
    mode: null,
  });
  const {
    state: accountState,
    loading: accountStateLoading,
    loadedAt: accountStateLoadedAt,
    setDepositKrwInt,
    setDepositUsdCents,
    setCashKrwInt,
  } = usePortfolioAccountState();
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [fxAsOf, setFxAsOf] = useState("");
  const [depositKrwInput, setDepositKrwInput] = useState("");
  const [depositUsdInput, setDepositUsdInput] = useState("");
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
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const quoteRefreshInFlightRef = useRef(false);
  const isAuthed = isCloudMode;
  const depositKrw = accountState.depositKrwInt;
  const depositUsdCents = accountState.depositUsdCents;
  const cashKrw = accountState.cashKrwInt;

  useEffect(() => {
    const savedFx = window.localStorage.getItem(FX_STORAGE_KEY);
    if (savedFx) {
      const parsedFx = Number(savedFx);
      if (Number.isFinite(parsedFx) && parsedFx > 0) {
        setFxRate(parsedFx);
      }
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
    if (authLoading || accountStateLoading) {
      return;
    }

    setDepositKrwInput(depositKrw === 0 ? "" : `${depositKrw}`);
    setDepositUsdInput(depositUsdCents === 0 ? "" : (depositUsdCents / 100).toFixed(2));
    setCashInput(cashKrw === 0 ? "" : `${cashKrw}`);
  }, [accountStateLoadedAt, accountStateLoading, authLoading]);

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

  useEffect(() => {
    if (authLoading || isAuthed) {
      return;
    }

    setModalOpen(false);
    setEditing(undefined);
    setManualKrTicker(null);
    setManualKrCodeInput("");
  }, [authLoading, isAuthed]);

  useEffect(() => {
    setCommentDrafts((prev) => {
      const next: Record<string, string> = {};
      let changed = false;

      holdings.forEach((holding) => {
        const fallbackValue = holding.comment ?? "";
        const existingValue = prev[holding.id];
        next[holding.id] = existingValue ?? fallbackValue;

        if (existingValue === undefined) {
          changed = true;
        }
      });

      Object.keys(prev).forEach((id) => {
        if (!(id in next)) {
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [holdings]);

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

  const parsePercentValue = useCallback((value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const cleaned = value.replace(/[%\s,]/g, "");

      if (!cleaned) {
        return null;
      }

      const parsed = Number(cleaned);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }

    return null;
  }, []);

  const resolveDayChangeRate = useCallback(
    (
      payload: Partial<QuoteApiResponse>,
      priceInt: number,
    ): number | undefined => {
      const directDayChangePct = parsePercentValue(payload.dayChangePct);

      if (directDayChangePct !== null && Number.isFinite(directDayChangePct)) {
        return directDayChangePct;
      }

      const changePercent = parsePercentValue(payload.changePercent);

      if (changePercent !== null && Number.isFinite(changePercent)) {
        return changePercent;
      }

      const regularMarketChangePercent = parsePercentValue(
        payload.regularMarketChangePercent,
      );

      if (
        regularMarketChangePercent !== null &&
        Number.isFinite(regularMarketChangePercent)
      ) {
        return Math.abs(regularMarketChangePercent) <= 1
          ? regularMarketChangePercent * 100
          : regularMarketChangePercent;
      }

      const prevCloseIntRaw = Number(payload.prevCloseInt);

      if (Number.isFinite(prevCloseIntRaw) && prevCloseIntRaw > 0) {
        return ((priceInt - prevCloseIntRaw) / prevCloseIntRaw) * 100;
      }

      const prevCloseRaw = Number(payload.prevClose);

      if (Number.isFinite(prevCloseRaw) && prevCloseRaw > 0) {
        const prevCloseInt =
          payload.currency === "USD"
            ? Math.round(prevCloseRaw * 100)
            : Math.round(prevCloseRaw);

        if (prevCloseInt > 0) {
          return ((priceInt - prevCloseInt) / prevCloseInt) * 100;
        }
      }

      return undefined;
    },
    [parsePercentValue],
  );

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

        const directPriceInt = Number(parsed.currentPriceInt ?? parsed.priceInt);
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
            prevClose:
              Number.isFinite(Number(parsed.prevCloseInt)) &&
              Number(parsed.prevCloseInt) > 0
                ? Math.round(Number(parsed.prevCloseInt))
                : Number.isFinite(Number(parsed.prevClose)) &&
                    Number(parsed.prevClose) > 0
                  ? parsed.currency === "USD"
                    ? Math.round(Number(parsed.prevClose) * 100)
                    : Math.round(Number(parsed.prevClose))
                  : undefined,
            dayChangePct: resolveDayChangeRate(parsed, priceInt),
            displayName:
              typeof parsed.displayName === "string"
                ? parsed.displayName.trim() || undefined
                : typeof parsed.resolvedName === "string"
                  ? parsed.resolvedName.trim() || undefined
                : undefined,
            logoUrl:
              typeof parsed.logoUrl === "string"
                ? parsed.logoUrl.trim() || undefined
                : undefined,
            tickerCode:
              typeof parsed.tickerCode === "string"
                ? parsed.tickerCode.trim().toUpperCase() || undefined
                : typeof parsed.resolvedCode === "string"
                  ? parsed.resolvedCode.trim().toUpperCase() || undefined
                : undefined,
            krCode:
              holding.market === "KR" && typeof parsed.resolvedCode === "string"
                ? parsed.resolvedCode
                : undefined,
            asOf:
              typeof parsed.asOf === "string"
                ? parsed.asOf
                : new Date().toISOString(),
          },
          debugRaw: parsed,
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
    [resolveDayChangeRate],
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
          (!staleOnly ||
            isQuoteStale(holding) ||
            typeof holding.dayChangePct !== "number"),
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

                if (process.env.NODE_ENV === "development") {
                  const prevCloseInt =
                    typeof result.update.prevClose === "number" &&
                    Number.isFinite(result.update.prevClose)
                      ? result.update.prevClose
                      : null;
                  const dayChangePct =
                    typeof result.update.dayChangePct === "number" &&
                    Number.isFinite(result.update.dayChangePct)
                      ? result.update.dayChangePct
                      : null;

                  console.debug("[quote-refresh]", {
                    ticker: targetHolding.ticker,
                    current_price_int: result.update.currentPrice,
                    prev_close_int: prevCloseInt,
                    day_change_pct: dayChangePct,
                  });

                  if (prevCloseInt === null && dayChangePct === null) {
                    console.debug("[quote-refresh raw payload]", {
                      ticker: targetHolding.ticker,
                      payload: result.debugRaw ?? null,
                    });
                  }
                }
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
          await updateQuotes(updates);
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
        holdings,
        fxRate,
        depositKrw,
        depositUsdCents,
        cashKrw,
      }),
    [cashKrw, depositKrw, depositUsdCents, fxRate, holdings],
  );
  const tableRows = useMemo<PortfolioTableRow[]>(
    () =>
      filtered.map((holding, index) => ({
        holding,
        computed: calcHoldingComputed(holding),
        dailyChangeRate: resolveHoldingDayChangePct(holding),
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
            return resolveHoldingDisplayName(row.holding);
          }

          if (key === "dailyChangeRate") {
            return row.dailyChangeRate ?? Number.NEGATIVE_INFINITY;
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

          if (key === "comment") {
            return row.holding.comment ?? "";
          }

          return row.computed.pnlRate;
        },
        (a, b) => a.defaultIndex - b.defaultIndex,
      ),
    [sortState, tableRows],
  );
  const usdPnlKrw = totalAsset.usdPnlKrw;
  const totalAssetKrw = totalAsset.totalAssetKrw;
  const krHoldingsPnlKrw = totalAsset.krHoldingsPnlKrw;
  const usdHoldingsPnlCents = totalAsset.usdHoldingsPnlCents;
  const accountPnlKrw = krHoldingsPnlKrw + usdPnlKrw;
  const totalDepositKrw = useMemo(
    () => depositKrw + usdToKrw(usdCentsToUsdFloat(depositUsdCents), fxRate),
    [depositKrw, depositUsdCents, fxRate],
  );
  const krHoldingsBaseKrw = useMemo(
    () =>
      holdings.reduce(
        (sum, holding) =>
          holding.market === "KR" ? sum + holding.qty * holding.avgPrice : sum,
        0,
      ),
    [holdings],
  );
  const usHoldingsBaseCents = useMemo(
    () =>
      holdings.reduce(
        (sum, holding) =>
          holding.market === "US" ? sum + holding.qty * holding.avgPrice : sum,
        0,
      ),
    [holdings],
  );
  const krPnlPct =
    krHoldingsBaseKrw > 0
      ? (krHoldingsPnlKrw / krHoldingsBaseKrw) * 100
      : null;
  const usPnlPct =
    usHoldingsBaseCents > 0
      ? (usdHoldingsPnlCents / usHoldingsBaseCents) * 100
      : null;
  const accountBaseKrw = useMemo(() => {
    const bases = holdings.reduce(
      (acc, holding) => {
        const costBasis = holding.qty * holding.avgPrice;

        if (holding.market === "US") {
          acc.usdBaseCents += costBasis;
        } else {
          acc.krBaseKrw += costBasis;
        }

        return acc;
      },
      { krBaseKrw: 0, usdBaseCents: 0 },
    );

    return (
      bases.krBaseKrw +
      usdToKrw(usdCentsToUsdFloat(bases.usdBaseCents), fxRate)
    );
  }, [fxRate, holdings]);
  const totalPnlPct =
    accountBaseKrw > 0 ? (accountPnlKrw / accountBaseKrw) * 100 : null;

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
    if (process.env.NODE_ENV !== "development" || loading) {
      return;
    }

    const sumTableUsdMv = tableUsdMvCents / 100;
    const totalUsdMv = totalAsset.usdHoldingsMarketValueCents / 100;
    const sumTableKrwMv = tableKrwMvWon;
    const totalKrwMvWithoutDeposit = totalAsset.totalKrwEval - Math.max(depositKrw, 0);
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
        totalKrwMvWithoutDeposit,
        krwMatch: sumTableKrwMv === totalKrwMvWithoutDeposit,
      },
      {
        totalAssetKrwWon,
        formulaTotalAssetKrw,
        totalMatch: totalAssetKrwWon === formulaTotalAssetKrw,
      },
    );
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

  const handleDepositKrwInputChange = (rawDigits: string) => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!rawDigits) {
      setDepositKrwInput("");
      setDepositKrwInt(0);
      return;
    }

    const amount = Number.parseInt(rawDigits, 10);
    setDepositKrwInput(rawDigits);
    setDepositKrwInt(amount);
  };

  const handleDepositUsdInputChange = (rawValue: string) => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!rawValue.trim()) {
      setDepositUsdInput("");
      setDepositUsdCents(0);
      return;
    }

    const nextCents = parsePriceInputToInt("USD", rawValue);

    if (nextCents === null) {
      return;
    }

    setDepositUsdInput(rawValue);
    setDepositUsdCents(nextCents);
  };

  const handleCashInputChange = (rawDigits: string) => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!rawDigits) {
      setCashInput("");
      setCashKrwInt(0);
      return;
    }

    const amount = Number.parseInt(rawDigits, 10);
    setCashInput(rawDigits);
    setCashKrwInt(amount);
  };

  const handleCreate = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

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

  const holdingToInput = useCallback(
    (holding: PortfolioHolding): PortfolioInput => ({
      market: holding.market,
      currency: holding.currency,
      ticker: holding.ticker,
      displayName: holding.displayName,
      comment: holding.comment,
      tickerCode: holding.tickerCode,
      logoUrl: holding.logoUrl,
      krCode: holding.krCode,
      quoteDisabled: holding.quoteDisabled,
      sector: holding.sector,
      qty: holding.qty,
      avgPrice: holding.avgPrice,
      currentPrice: holding.currentPrice,
    }),
    [],
  );

  const handleCommentDraftChange = (holdingId: string, value: string) => {
    setCommentDrafts((prev) => ({
      ...prev,
      [holdingId]: value,
    }));
  };

  const commitComment = (holding: PortfolioHolding) => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const nextComment = (commentDrafts[holding.id] ?? "").trim();
    const currentComment = (holding.comment ?? "").trim();

    if (nextComment === currentComment) {
      return;
    }

    setCommentDrafts((prev) => ({
      ...prev,
      [holding.id]: nextComment,
    }));

    update(holding.id, {
      ...holdingToInput(holding),
      comment: nextComment,
    });
  };

  const handleSortClick = (key: PortfolioSortKey) => {
    setSortState((prev) => toggleSort(prev, key));
  };

  const handleManualQuoteRefresh = async () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    console.log("[quote-refresh] manual refresh clicked");
    await refreshQuotesForVisible({ staleOnly: false, force: true });
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
      ...holdingToInput(target),
      krCode: normalizedCode,
      tickerCode: normalizedCode,
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

      const updatedPriceInt = Number(parsed.currentPriceInt ?? parsed.priceInt);

      if (!Number.isFinite(updatedPriceInt) || updatedPriceInt <= 0) {
        setQuoteWarning("수동 코드 저장 후 시세 값이 유효하지 않습니다.");
        return;
      }

      await updateQuotes([
        {
          id: target.id,
          currentPrice: Math.round(updatedPriceInt),
          prevClose:
            Number.isFinite(Number(parsed.prevCloseInt)) &&
            Number(parsed.prevCloseInt) > 0
              ? Math.round(Number(parsed.prevCloseInt))
              : undefined,
          dayChangePct: resolveDayChangeRate(parsed, Math.round(updatedPriceInt)),
          displayName:
            typeof parsed.displayName === "string"
              ? parsed.displayName.trim() || undefined
              : typeof parsed.resolvedName === "string"
                ? parsed.resolvedName.trim() || undefined
              : undefined,
          tickerCode:
            typeof parsed.tickerCode === "string"
              ? parsed.tickerCode.trim().toUpperCase() || normalizedCode
              : normalizedCode,
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
      return "↑↓";
    }

    return sortState.mode === "DESC" ? "▼" : "▲";
  };

  const sortIndicatorClassName = (key: PortfolioSortKey): string =>
    `sort-indicator${sortState.key === key && sortState.mode ? " is-active" : " is-hint"}`;
  const sortButtonClassName = (key: PortfolioSortKey): string =>
    `table-sort-button${sortState.key === key && sortState.mode ? " is-active" : ""}`;

  return (
    <>
      <PageHeader
        title="Portfolio"
        titleMeta={
          <span className="inline-title-metric">
            <span className="inline-title-divider">|</span>
            <span className="inline-title-metric-label">총 자산(KRW)</span>
            {renderMoney("KRW", totalAssetKrw)}
            <span className="inline-title-divider">|</span>
            <span className="inline-title-metric-label">총 PNL %</span>
            <strong
              style={{
                color:
                  totalPnlPct === null
                    ? "var(--muted)"
                    : totalPnlPct >= 0
                      ? "var(--positive)"
                      : "var(--negative)",
              }}
            >
              {totalPnlPct === null ? "—" : percentFormat(totalPnlPct)}
            </strong>
            <span className="inline-title-divider">|</span>
            <span className="inline-title-metric-label">총 계좌 손익(KRW)</span>
            <span
              style={{
                color:
                  accountPnlKrw >= 0 ? "var(--positive)" : "var(--negative)",
              }}
            >
              {renderMoney("KRW", accountPnlKrw)}
            </span>
          </span>
        }
        actions={
          <>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                void handleManualQuoteRefresh();
              }}
              disabled={!isAuthed || isRefreshingQuotes}
            >
              {isRefreshingQuotes ? "현재가 갱신 중..." : "현재가 갱신"}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleCreate}
              disabled={!isAuthed}
            >
              추가
            </button>
          </>
        }
      />

      {!authLoading && !isAuthed ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      <section className="panel cash-panel">
        <div className="filter-row cash-row">
          <label>
            예수금 (KRW)
            <FormattedNumberInput
              className="cash-input"
              placeholder="예: 1,000,000"
              value={depositKrwInput}
              onValueChange={handleDepositKrwInputChange}
              disabled={!isAuthed}
            />
          </label>
          <label>
            예수금 (USD)
            <FormattedNumberInput
              className="cash-input"
              placeholder="예: 1,250.75"
              value={depositUsdInput}
              onValueChange={handleDepositUsdInputChange}
              allowDecimal
              maxDecimals={2}
              disabled={!isAuthed}
            />
          </label>
          <label>
            현금 (KRW)
            <FormattedNumberInput
              className="cash-input"
              placeholder="예: 500,000"
              value={cashInput}
              onValueChange={handleCashInputChange}
              disabled={!isAuthed}
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

      <PortfolioAllocationDonut
        holdings={holdings}
        fxRate={fxRate}
        krNavKrw={totalAsset.krHoldingsMarketValueKrw}
        krPnlPct={krPnlPct}
        krAccountPnlKrw={krHoldingsPnlKrw}
        usNavCents={totalAsset.usdHoldingsMarketValueCents}
        usPnlPct={usPnlPct}
        usAccountPnlCents={usdHoldingsPnlCents}
        depositTotalKrw={totalDepositKrw}
        cashKrw={cashKrw}
      />

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

        <div className="table-wrap portfolio-table-wrap">
          <table className="portfolio-holdings-table">
            <colgroup>
              <col className="portfolio-col-holding" />
              <col className="portfolio-col-change" />
              <col className="portfolio-col-price" />
              <col className="portfolio-col-price" />
              <col className="portfolio-col-qty" />
              <col className="portfolio-col-value" />
              <col className="portfolio-col-value" />
              <col className="portfolio-col-rate" />
              <col className="portfolio-col-comment" />
            </colgroup>
            <thead>
              <tr>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("ticker")}
                    onClick={() => handleSortClick("ticker")}
                  >
                    종목
                    <span className={sortIndicatorClassName("ticker")}>
                      {sortIndicator("ticker")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("dailyChangeRate")}
                    onClick={() => handleSortClick("dailyChangeRate")}
                  >
                    1일 등락률
                    <span className={sortIndicatorClassName("dailyChangeRate")}>
                      {sortIndicator("dailyChangeRate")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("avgPrice")}
                    onClick={() => handleSortClick("avgPrice")}
                  >
                    Avg Price
                    <span className={sortIndicatorClassName("avgPrice")}>
                      {sortIndicator("avgPrice")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("currentPrice")}
                    onClick={() => handleSortClick("currentPrice")}
                  >
                    Current Price
                    <span className={sortIndicatorClassName("currentPrice")}>
                      {sortIndicator("currentPrice")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("qty")}
                    onClick={() => handleSortClick("qty")}
                  >
                    Qty
                    <span className={sortIndicatorClassName("qty")}>
                      {sortIndicator("qty")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("marketValue")}
                    onClick={() => handleSortClick("marketValue")}
                  >
                    Market Value
                    <span className={sortIndicatorClassName("marketValue")}>
                      {sortIndicator("marketValue")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("pnl")}
                    onClick={() => handleSortClick("pnl")}
                  >
                    PnL
                    <span className={sortIndicatorClassName("pnl")}>
                      {sortIndicator("pnl")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("pnlRate")}
                    onClick={() => handleSortClick("pnlRate")}
                  >
                    PnL%
                    <span className={sortIndicatorClassName("pnlRate")}>
                      {sortIndicator("pnlRate")}
                    </span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className={sortButtonClassName("comment")}
                    onClick={() => handleSortClick("comment")}
                  >
                    Comment
                    <span className={sortIndicatorClassName("comment")}>
                      {sortIndicator("comment")}
                    </span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>로딩 중...</td>
                </tr>
              ) : sortedTableRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="empty-state">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedTableRows.map((row) => {
                  const { holding, computed } = row;
                  const displayName = resolveHoldingDisplayName(holding);
                  const tickerMeta =
                    holding.market === "US"
                      ? holding.ticker.trim().toUpperCase()
                      : holding.tickerCode?.trim()
                        ? holding.tickerCode.trim().toUpperCase()
                        : holding.krCode?.trim()
                          ? holding.krCode.trim().toUpperCase()
                        : /^\d{4,12}$/.test(holding.ticker.trim())
                          ? holding.ticker.trim()
                          : "-";

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
                      <td>
                        <div className="holding-info-cell">
                          <HoldingAvatar
                            market={holding.market}
                            ticker={holding.ticker}
                            logoUrl={holding.logoUrl}
                            label={displayName}
                          />
                          <div className="holding-info-text">
                            <strong className="holding-display-name">
                              {displayName}
                            </strong>
                            <span className="holding-ticker-meta">
                              {tickerMeta}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {row.dailyChangeRate === null ? (
                          <span className="daily-change-pill is-muted">—</span>
                        ) : (
                          <span
                            className={`daily-change-pill ${
                              row.dailyChangeRate > 0
                                ? "is-positive"
                                : row.dailyChangeRate < 0
                                  ? "is-negative"
                                  : "is-neutral"
                            }`}
                          >
                            {formatDailyChangeLabel(row.dailyChangeRate)}
                          </span>
                        )}
                      </td>
                      <td>{renderMoney(holding.currency, holding.avgPrice, "table")}</td>
                      <td>{renderMoney(holding.currency, holding.currentPrice, "table")}</td>
                      <td>{holding.qty}</td>
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
                      <td
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        <input
                          className="portfolio-comment-input"
                          value={commentDrafts[holding.id] ?? holding.comment ?? ""}
                          placeholder="메모"
                          onChange={(event) =>
                            handleCommentDraftChange(holding.id, event.target.value)
                          }
                          onBlur={() => commitComment(holding)}
                          onKeyDown={(event) => {
                            event.stopPropagation();

                            if (event.key === "Enter") {
                              event.preventDefault();
                              commitComment(holding);
                              event.currentTarget.blur();
                            }
                          }}
                          disabled={!isAuthed}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

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
            disabled={!isAuthed}
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
                if (!isAuthed) {
                  window.alert("로그인 후 사용 가능합니다.");
                  return;
                }

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
          if (!isAuthed) {
            window.alert("로그인 후 사용 가능합니다.");
            return;
          }

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
