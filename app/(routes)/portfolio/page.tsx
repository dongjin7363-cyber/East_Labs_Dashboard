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
import { PortfolioFormModal } from "@/components/portfolio/PortfolioFormModal";
import { usePortfolioAccountState } from "@/lib/hooks/usePortfolioAccountState";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import {
  Currency,
  Market,
  PortfolioHolding,
} from "@/lib/models/types";
import {
  calcHoldingComputed,
  calculatePortfolioTotalAsset,
  filterHoldings,
  PortfolioInput,
} from "@/lib/services/portfolioService";
import {
  isKrTickerCodeLike,
  resolveHoldingDisplayName as resolveHoldingDisplayNameBase,
  resolveHoldingGroupingKey,
} from "@/lib/portfolio/display";
import {
  moneyFormat,
  moneyFormatParts,
  parsePriceInputToInt,
  percentFormat,
  usdCentsToUsdFloat,
  usdToKrw,
} from "@/lib/utils/money";
import { SortState, sortRows, toggleSort } from "@/lib/utils/sort";
import { supabase } from "@/lib/supabaseClient";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const LAST_QUOTE_REFRESH_STORAGE_KEY = "pf_last_quote_refresh_at_v1";
const LAST_QUOTE_FAIL_STORAGE_KEY = "pf_last_quote_fail_at_v1";
const QUOTE_BLACKLIST_STORAGE_KEY = "pf_quote_blacklist_v1";
const DEFAULT_FX_RATE = 1350;
const QUOTE_REFRESH_INTERVAL_MS = 7_200_000;
const QUOTE_FAIL_COOLDOWN_MS = 600_000;
const QUOTE_FAILURE_TICKER_PREVIEW_LIMIT = 5;
const QUOTE_UNSUPPORTED_SKIP_MESSAGE = "지원되지 않는 티커는 24시간 동안 자동 스킵됩니다";

const DONUT_COLORS = [
  "#3B4FBF",
  "#7C3AED",
  "#059669",
  "#DC2626",
  "#D97706",
  "#0891B2",
  "#0EA5E9",
  "#EC4899",
  "#65A30D",
  "#475569",
];
const DONUT_DEPOSIT_COLOR = "#6B7280";
const DONUT_CASH_COLOR = "#CBD5E1";
const DONUT_SECTOR_COLOR_MAP: Record<string, string> = {
  Index: "#6B7280",
  Biotech: "#16A34A",
  Space: "#EAB308",
  Robotics: "#EC4899",
  AI: "#EF4444",
  "Small-Cap": "#111827",
  Deposit: DONUT_DEPOSIT_COLOR,
  Cash: DONUT_CASH_COLOR,
  Other: "#CBD5E1",
};
const DONUT_COUNTRY_COLOR_MAP: Record<string, string> = {
  KR: "#0D3B66",
  US: "#1F9D69",
  Deposit: DONUT_DEPOSIT_COLOR,
  Cash: DONUT_CASH_COLOR,
};

type DonutMode = "TICKER" | "SECTOR" | "COUNTRY";

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

type PortfolioSortKey =
  | "ticker"
  | "dailyChangeRate"
  | "marketValue"
  | "pnl"
  | "pnlRate"
  | "weight";

interface PortfolioTableRow {
  holding: PortfolioHolding;
  computed: ReturnType<typeof calcHoldingComputed>;
  dailyChangeRate: number | null;
  marketValueComparableKrw: number;
  defaultIndex: number;
}

interface DonutSlice {
  key: string;
  label: string;
  amountKrw: number;
  color: string;
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

function parseIsoTimestampMs(raw?: string | null): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);

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

function formatKstDate(isoLike?: string | null): string {
  if (typeof isoLike === "string" && isoLike.trim() !== "") {
    const matched = isoLike.match(/\d{4}-\d{2}-\d{2}/);

    if (matched) {
      return matched[0];
    }
  }

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatKstLiveLabel(timestampMs: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestampMs));
}

const SYM_KRW = <span className="pf-money-symbol">₩</span>;

function CompactKrw({ amount }: { amount: number }) {
  if (!Number.isFinite(amount) || amount <= 0) {
    return <>{SYM_KRW}0</>;
  }

  if (amount >= 100_000_000) {
    return <>{SYM_KRW}{(amount / 100_000_000).toFixed(1)}억</>;
  }

  if (amount >= 10_000_000) {
    return <>{SYM_KRW}{(amount / 1_000_000).toFixed(1)}M</>;
  }

  if (amount >= 1_000_000) {
    return <>{SYM_KRW}{(amount / 1_000_000).toFixed(2)}M</>;
  }

  return <>{SYM_KRW}{moneyFormat("KRW", amount).replace("₩", "")}</>;
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

function buildDonutSlices(
  holdings: PortfolioHolding[],
  fxRate: number,
  mode: DonutMode,
  depositTotalKrw: number,
  cashKrw: number,
  displayNameByGroupingKey: Map<string, string>,
): DonutSlice[] {
  const grouped = new Map<string, number>();
  const labelMap = new Map<string, string>();

  if (mode === "COUNTRY") {
    let krTotal = 0;
    let usTotal = 0;

    holdings.forEach((holding) => {
      const mv = calcHoldingComputed(holding).marketValue;
      const amountKrw =
        holding.market === "US"
          ? usdToKrw(usdCentsToUsdFloat(mv), fxRate)
          : mv;

      if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
        return;
      }

      if (holding.market === "US") {
        usTotal += amountKrw;
      } else {
        krTotal += amountKrw;
      }
    });

    if (krTotal > 0) grouped.set("KR", krTotal);
    if (usTotal > 0) grouped.set("US", usTotal);
  } else {
    holdings.forEach((holding) => {
      const mv = calcHoldingComputed(holding).marketValue;
      const amountKrw =
        holding.market === "US"
          ? usdToKrw(usdCentsToUsdFloat(mv), fxRate)
          : mv;

      if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
        return;
      }

      const key =
        mode === "SECTOR"
          ? holding.sector ?? "Other"
          : resolveHoldingGroupingKey(holding);
      grouped.set(key, (grouped.get(key) ?? 0) + amountKrw);

      if (mode === "TICKER") {
        const label =
          displayNameByGroupingKey.get(key) ??
          resolveHoldingDisplayNameBase(holding);
        labelMap.set(key, label);
      }
    });
  }

  if (depositTotalKrw > 0) {
    grouped.set("Deposit", (grouped.get("Deposit") ?? 0) + depositTotalKrw);
  }

  if (cashKrw > 0) {
    grouped.set("Cash", (grouped.get("Cash") ?? 0) + cashKrw);
  }

  const sorted = Array.from(grouped.entries())
    .map(([key, amountKrw]) => ({
      key,
      label: labelMap.get(key) ?? key,
      amountKrw,
    }))
    .sort((a, b) => b.amountKrw - a.amountKrw);

  return sorted.map((row, index) => {
    let color: string;
    if (row.key === "Deposit") {
      color = DONUT_DEPOSIT_COLOR;
    } else if (row.key === "Cash") {
      color = DONUT_CASH_COLOR;
    } else if (mode === "SECTOR") {
      color = DONUT_SECTOR_COLOR_MAP[row.key] ?? DONUT_COLORS[index % DONUT_COLORS.length];
    } else if (mode === "COUNTRY") {
      color = DONUT_COUNTRY_COLOR_MAP[row.key] ?? DONUT_COLORS[index % DONUT_COLORS.length];
    } else {
      color = DONUT_COLORS[index % DONUT_COLORS.length];
    }

    return { ...row, color };
  });
}

function DonutChart({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const size = 148;
  const radius = size / 2;
  const innerRadius = radius * 0.56;
  const cx = radius;
  const cy = radius;

  if (slices.length === 0 || total <= 0) {
    return (
      <svg
        className="pf-donut-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle cx={cx} cy={cy} r={radius - 1} fill="var(--east-surface-2)" />
        <circle cx={cx} cy={cy} r={innerRadius} fill="var(--east-surface)" />
      </svg>
    );
  }

  let cumulative = 0;
  const arcs = slices.map((slice) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += slice.amountKrw;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;

    const x1 = cx + radius * Math.cos(startAngle);
    const y1 = cy + radius * Math.sin(startAngle);
    const x2 = cx + radius * Math.cos(endAngle);
    const y2 = cy + radius * Math.sin(endAngle);

    const x1i = cx + innerRadius * Math.cos(endAngle);
    const y1i = cy + innerRadius * Math.sin(endAngle);
    const x2i = cx + innerRadius * Math.cos(startAngle);
    const y2i = cy + innerRadius * Math.sin(startAngle);

    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
    const d = [
      `M ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${x1i} ${y1i}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x2i} ${y2i}`,
      "Z",
    ].join(" ");

    return { d, color: slice.color, key: slice.key };
  });

  return (
    <svg
      className="pf-donut-svg"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {arcs.map((arc) => (
        <path key={arc.key} d={arc.d} fill={arc.color} />
      ))}
    </svg>
  );
}

function Money({
  currency,
  amountInt,
  signed = false,
}: {
  currency: Currency;
  amountInt: number;
  signed?: boolean;
}) {
  const { symbol, valueText } = moneyFormatParts(currency, amountInt);
  const cleanValue = valueText.replace(/^-/, "");
  const isNeg = amountInt < 0;
  const prefix = isNeg ? "-" : signed && amountInt > 0 ? "+" : "";

  return (
    <span className="pf-money">
      {prefix}
      <span className="pf-money-symbol">{symbol}</span>
      {cleanValue}
    </span>
  );
}

export default function PortfolioPage() {
  const {
    holdings,
    loading,
    refresh,
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
  const [donutMode, setDonutMode] = useState<DonutMode>("TICKER");
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
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [marketIndexes, setMarketIndexes] = useState<{
    kospi: { price: number; changePercent: number } | null;
    kosdaq: { price: number; changePercent: number } | null;
    sp500: { price: number; changePercent: number } | null;
  }>({ kospi: null, kosdaq: null, sp500: null });
  const quoteRefreshInFlightRef = useRef(false);
  const depositUsdInputFocusedRef = useRef(false);
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
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const fetchIndexes = async () => {
      try {
        const res = await fetch("/api/market-index");
        if (!res.ok) return;
        const data = (await res.json()) as typeof marketIndexes;
        setMarketIndexes(data);
      } catch {}
    };
    void fetchIndexes();
    const id = window.setInterval(fetchIndexes, 30_000);
    return () => window.clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authLoading || accountStateLoading) {
      return;
    }

    setDepositKrwInput(depositKrw === 0 ? "" : `${depositKrw}`);
    if (!depositUsdInputFocusedRef.current) {
      setDepositUsdInput(depositUsdCents === 0 ? "" : (depositUsdCents / 100).toFixed(2));
    }
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

  const filtered = useMemo(() => {
    return filterHoldings(holdings, {
      market,
      search,
    });
  }, [holdings, market, search]);

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
      market: Market,
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

  const refreshQuotesForVisible = useCallback(
    async ({
      force = false,
      includeExtended = false,
    }: {
      force?: boolean;
      includeExtended?: boolean;
    } = {}) => {
      if (quoteRefreshInFlightRef.current) {
        return;
      }

      if (!force) {
        const now = Date.now();

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

      quoteRefreshInFlightRef.current = true;
      setIsRefreshingQuotes(true);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          setQuoteWarning("로그인 세션을 확인할 수 없습니다.");
          return;
        }

        const response = await fetch("/api/quotes/refresh", {
          method: "POST",
          cache: "no-store",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ includeExtended }),
        });
        const payload = (await response.json().catch(() => null)) as
          | {
              updated?: unknown[];
              updated_count?: number;
              source?: string;
              last_updated?: string | null;
              finishedAt?: string;
              supabase?: { updated?: number; failed?: number };
              failed?: Array<{ ticker?: string; reason?: string }>;
              skipped?: unknown[];
              message?: string;
            }
          | null;

        if (!response.ok) {
          const message =
            typeof payload?.message === "string" && payload.message.trim()
              ? payload.message
              : `quote refresh failed (${response.status})`;
          throw new Error(message);
        }

        const serverCompletedAt =
          parseIsoTimestampMs(payload?.last_updated) ??
          parseIsoTimestampMs(payload?.finishedAt);
        const completedAt = serverCompletedAt ?? Date.now();
        setLastQuoteRefreshAt(completedAt);
        window.localStorage.setItem(LAST_QUOTE_REFRESH_STORAGE_KEY, `${completedAt}`);

        const failed = Array.isArray(payload?.failed) ? payload.failed : [];
        const updatedCount = Number.isFinite(payload?.updated_count)
          ? Number(payload?.updated_count)
          : Array.isArray(payload?.updated)
            ? payload.updated.length
            : 0;
        const supabaseUpdated = Number.isFinite(payload?.supabase?.updated)
          ? Number(payload?.supabase?.updated)
          : updatedCount;
        const supabaseFailed = Number.isFinite(payload?.supabase?.failed)
          ? Number(payload?.supabase?.failed)
          : 0;
        const source =
          typeof payload?.source === "string" && payload.source.trim()
            ? payload.source
            : "KIS_REST";

        if (failed.length > 0) {
          const preview = failed
            .slice(0, QUOTE_FAILURE_TICKER_PREVIEW_LIMIT)
            .map((item) => item.ticker ?? "UNKNOWN")
            .join(", ");
          setQuoteWarning(`시세 업데이트 실패 ${failed.length}건 (${preview})`);
          const failedAt = Date.now();
          setLastQuoteFailAt(failedAt);
          window.localStorage.setItem(LAST_QUOTE_FAIL_STORAGE_KEY, `${failedAt}`);
        } else {
          setQuoteWarning(null);
          setLastQuoteFailAt(null);
          window.localStorage.removeItem(LAST_QUOTE_FAIL_STORAGE_KEY);
        }

        setQuoteRefreshSummary(
          `${source} 성공 ${updatedCount}건 / 실패 ${failed.length}건 / DB 저장 ${supabaseUpdated}건${
            supabaseFailed > 0 ? ` / DB 실패 ${supabaseFailed}건` : ""
          }`,
        );
        await refresh();
        return;
      } catch (error) {
        setQuoteWarning(
          error instanceof Error
            ? `시세 업데이트 실패: ${error.message}`
            : "시세 업데이트 실패",
        );
        const failedAt = Date.now();
        setLastQuoteFailAt(failedAt);
        window.localStorage.setItem(LAST_QUOTE_FAIL_STORAGE_KEY, `${failedAt}`);
        return;
      } finally {
        quoteRefreshInFlightRef.current = false;
        setIsRefreshingQuotes(false);
      }
    },
    [lastQuoteFailAt, lastQuoteRefreshAt, refresh],
  );

  useEffect(() => {
    if (loading || !quoteMetaLoaded) {
      return;
    }

    void refreshQuotesForVisible();
  }, [loading, quoteMetaLoaded, refreshQuotesForVisible]);

  useEffect(() => {
    if (loading || !quoteMetaLoaded) {
      return;
    }

    if (document.visibilityState !== "visible") {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshQuotesForVisible();
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
        void refreshQuotesForVisible();
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
  const displayNameByGroupingKey = useMemo(() => {
    const lookup = new Map<string, string>();

    holdings.forEach((holding) => {
      const name = resolveHoldingDisplayNameBase(holding);

      if (!name || isKrTickerCodeLike(name)) {
        return;
      }

      const key = resolveHoldingGroupingKey(holding);
      const existing = lookup.get(key);

      if (!existing || isKrTickerCodeLike(existing)) {
        lookup.set(key, name);
      }
    });

    return lookup;
  }, [holdings]);
  const resolveHoldingDisplayName = useCallback(
    (holding: PortfolioHolding) =>
      displayNameByGroupingKey.get(resolveHoldingGroupingKey(holding)) ??
      resolveHoldingDisplayNameBase(holding),
    [displayNameByGroupingKey],
  );

  const totalAssetKrw = totalAsset.totalAssetKrw;
  const krHoldingsMarketValueKrw = totalAsset.krHoldingsMarketValueKrw;
  const usHoldingsMarketValueCents = totalAsset.usdHoldingsMarketValueCents;
  const krHoldingsPnlKrw = totalAsset.krHoldingsPnlKrw;
  const usdHoldingsPnlCents = totalAsset.usdHoldingsPnlCents;
  const usdPnlKrw = totalAsset.usdPnlKrw;
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

  const donutSlices = useMemo(
    () =>
      buildDonutSlices(
        holdings,
        fxRate,
        donutMode,
        totalDepositKrw,
        cashKrw,
        displayNameByGroupingKey,
      ),
    [
      holdings,
      fxRate,
      donutMode,
      totalDepositKrw,
      cashKrw,
      displayNameByGroupingKey,
    ],
  );
  const donutTotal = useMemo(
    () => donutSlices.reduce((sum, slice) => sum + slice.amountKrw, 0),
    [donutSlices],
  );

  const tableRows = useMemo<PortfolioTableRow[]>(
    () => {
      const rows = filtered.map((holding) => {
        const computed = calcHoldingComputed(holding);
        const marketValueComparableKrw =
          holding.market === "US"
            ? usdToKrw(usdCentsToUsdFloat(computed.marketValue), fxRate)
            : computed.marketValue;

        return {
          holding,
          computed,
          dailyChangeRate: resolveHoldingDayChangePct(holding),
          marketValueComparableKrw,
          defaultIndex: 0,
        };
      });

      return rows
        .sort((a, b) => {
          if (b.marketValueComparableKrw !== a.marketValueComparableKrw) {
            return b.marketValueComparableKrw - a.marketValueComparableKrw;
          }

          return a.holding.ticker.localeCompare(b.holding.ticker, "ko-KR", {
            numeric: true,
            sensitivity: "base",
          });
        })
        .map((row, index) => ({
          ...row,
          defaultIndex: index,
        }));
    },
    [filtered, fxRate],
  );

  const totalMarketValueKrwForWeight = useMemo(
    () =>
      tableRows.reduce(
        (sum, row) => sum + Math.max(row.marketValueComparableKrw, 0),
        0,
      ) +
      Math.max(totalDepositKrw, 0) +
      Math.max(cashKrw, 0),
    [tableRows, totalDepositKrw, cashKrw],
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

          if (key === "marketValue") {
            return row.marketValueComparableKrw;
          }

          if (key === "pnl") {
            return row.computed.pnl;
          }

          if (key === "weight") {
            return totalMarketValueKrwForWeight > 0
              ? row.marketValueComparableKrw / totalMarketValueKrwForWeight
              : 0;
          }

          return row.computed.pnlRate;
        },
        (a, b) => a.defaultIndex - b.defaultIndex,
      ),
    [sortState, tableRows, totalMarketValueKrwForWeight, resolveHoldingDisplayName],
  );

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

    setDepositUsdInput(rawValue);

    const normalizedValue = rawValue.trim().replace(/,/g, "");

    if (!normalizedValue) {
      setDepositUsdCents(0);
      return;
    }

    if (/^\d+\.$/.test(normalizedValue)) {
      return;
    }

    const nextCents = parsePriceInputToInt("USD", rawValue);

    if (nextCents === null) {
      return;
    }

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
      isCredit: holding.isCredit,
      sector: holding.sector,
      position: holding.position,
      qty: holding.qty,
      avgPrice: holding.avgPrice,
      currentPrice: holding.currentPrice,
    }),
    [],
  );

  const handleSortClick = (key: PortfolioSortKey) => {
    setSortState((prev) => toggleSort(prev, key));
  };

  const handleManualQuoteRefresh = async () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    await refreshQuotesForVisible({ force: true, includeExtended: true });
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
  const skippedQuoteTickers = useMemo(
    () =>
      holdings
        .filter(
          (holding) =>
            !holding.quoteDisabled &&
            Boolean(quoteBlacklist[holding.ticker.trim().toUpperCase()]),
        )
        .map((holding) => holding.ticker),
    [holdings, quoteBlacklist],
  );
  const latestPriceUpdatedAtMs = useMemo(() => {
    return holdings.reduce((latest, holding) => {
      if (!holding.priceUpdatedAt) {
        return latest;
      }

      const parsed = Date.parse(holding.priceUpdatedAt);
      return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
    }, 0);
  }, [holdings]);
  const fxSummaryText = useMemo(() => {
    const fxDate = formatKstDate(fxAsOf);
    const fxValue = fxRate.toLocaleString("ko-KR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const refreshTimestamp = lastQuoteRefreshAt ?? latestPriceUpdatedAtMs;
    const refreshValue = refreshTimestamp ? formatKstTime(refreshTimestamp) : "-";

    return `${fxDate} : ₩${fxValue}\n시세 업데이트 ${refreshValue}`;
  }, [fxAsOf, fxRate, lastQuoteRefreshAt, latestPriceUpdatedAtMs]);
  const quoteWarningLine = useMemo(() => {
    const messages: string[] = [];
    const hasSkippedOrUnsupportedTickers =
      skippedQuoteTickers.length > 0 || unmatchedKrDisplayTickers.length > 0;

    if (
      quoteWarning &&
      (quoteWarning !== QUOTE_UNSUPPORTED_SKIP_MESSAGE || hasSkippedOrUnsupportedTickers)
    ) {
      messages.push(quoteWarning);
    }

    if (unmatchedKrDisplayTickers.length > 0) {
      messages.push(`미매칭 티커 ${unmatchedKrDisplayTickers.length}건`);
    }

    return messages.join(" | ");
  }, [quoteWarning, skippedQuoteTickers, unmatchedKrDisplayTickers]);

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
          dayChangePct: resolveDayChangeRate("KR", parsed, Math.round(updatedPriceInt)),
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

    void refreshQuotesForVisible({ force: true, includeExtended: true });
  };

  const renderSortArrow = (key: PortfolioSortKey): ReactNode => {
    const isActive = sortState.key === key && sortState.mode;
    const arrow = isActive ? (sortState.mode === "DESC" ? "▼" : "▲") : "↕";
    return (
      <span className={`pf-sort-arrow${isActive ? " is-active" : ""}`}>
        {arrow}
      </span>
    );
  };

  const pnlToneClass = (value: number, posClass: string, negClass: string): string => {
    if (value > 0) return posClass;
    if (value < 0) return negClass;
    return "";
  };

  const renderPnlPctChip = (pct: number | null, prefix?: string): ReactNode => {
    if (pct === null) {
      return <span className="pf-nsc-pnl-pct is-muted">—</span>;
    }
    const sign = pct > 0 ? "+" : "";
    return (
      <span className={`pf-nsc-pnl-pct ${pnlToneClass(pct, "is-pos", "is-neg")}`}>
        {prefix ?? ""}
        {sign}
        {percentFormat(pct)}
      </span>
    );
  };

  const renderPnlAmt = (
    currency: Currency,
    amount: number,
    isMuted = false,
  ): ReactNode => {
    if (isMuted) {
      return <span className="pf-nsc-pnl-amt is-muted">—</span>;
    }
    return (
      <span className={`pf-nsc-pnl-amt ${pnlToneClass(amount, "is-pos", "is-neg")}`}>
        <Money currency={currency} amountInt={amount} signed />
      </span>
    );
  };

  return (
    <div className="pf-page">
      {/* Page header */}
      <div className="pf-page-header">
        <h1 className="pf-page-title">Portfolio</h1>
        <span className="pf-hd">|</span>
        <span className="pf-header-stat">
          총 자산(KRW){" "}
          <strong>
            <Money currency="KRW" amountInt={totalAssetKrw} />
          </strong>
        </span>
        <span className="pf-hd">|</span>
        <span className="pf-header-stat">
          총 PNL%{" "}
          <strong
            className={
              totalPnlPct === null
                ? ""
                : pnlToneClass(totalPnlPct, "is-pos", "is-neg")
            }
          >
            {totalPnlPct === null ? "—" : percentFormat(totalPnlPct)}
          </strong>
        </span>
        <span className="pf-hd">|</span>
        <span className="pf-header-stat">
          총 계좌 손익(KRW){" "}
          <strong className={pnlToneClass(accountPnlKrw, "is-pos", "is-neg")}>
            <Money currency="KRW" amountInt={accountPnlKrw} />
          </strong>
        </span>
        <div className="pf-header-actions">
          <button
            type="button"
            className="pf-btn"
            onClick={() => {
              void handleManualQuoteRefresh();
            }}
            disabled={!isAuthed || isRefreshingQuotes}
          >
            {isRefreshingQuotes ? "갱신 중..." : "현재가 갱신"}
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-primary"
            onClick={handleCreate}
            disabled={!isAuthed}
          >
            + 추가
          </button>
        </div>
      </div>

      {/* Input row */}
      <div className="pf-input-row">
        <div className="pf-ig" style={{ flex: '0 0 auto' }}>
          <label htmlFor="pf-deposit-krw">예수금 (KRW)</label>
          <FormattedNumberInput
            id="pf-deposit-krw"
            placeholder="예: 1,000,000"
            value={depositKrwInput}
            onValueChange={handleDepositKrwInputChange}
            disabled={!isAuthed}
            style={{ width: '90px', minWidth: 0, maxWidth: '90px', flexShrink: 0 }}
          />
        </div>
        <div className="pf-ig" style={{ flex: '0 0 auto' }}>
          <label htmlFor="pf-deposit-usd">예수금 (USD)</label>
          <FormattedNumberInput
            id="pf-deposit-usd"
            placeholder="예: 1,250.75"
            value={depositUsdInput}
            onValueChange={handleDepositUsdInputChange}
            onFocus={() => {
              depositUsdInputFocusedRef.current = true;
            }}
            onBlur={() => {
              depositUsdInputFocusedRef.current = false;
            }}
            allowDecimal
            maxDecimals={2}
            disabled={!isAuthed}
            style={{ width: '90px', minWidth: 0, maxWidth: '90px', flexShrink: 0 }}
          />
        </div>
        <div className="pf-ig" style={{ flex: '0 0 auto' }}>
          <label htmlFor="pf-cash">현금 (KRW)</label>
          <FormattedNumberInput
            id="pf-cash"
            placeholder="예: 500,000"
            value={cashInput}
            onValueChange={handleCashInputChange}
            disabled={!isAuthed}
            style={{ width: '90px', minWidth: 0, maxWidth: '90px', flexShrink: 0 }}
          />
        </div>
        <div className="pf-rate-info">
          {fxSummaryText.split("\n").map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
          {quoteRefreshSummary && quoteRefreshSummary !== "-" ? (
            <div>{quoteRefreshSummary}</div>
          ) : null}
          {quoteWarningLine ? (
            <div className="pf-quote-warning">
              <span>{quoteWarningLine}</span>
              {unmatchedKrDisplayTickers.length > 0 ? (
                <span className="pf-quote-warning-links">
                  {unmatchedKrDisplayTickers.map((ticker) => (
                    <button
                      key={ticker}
                      type="button"
                      className="pf-quote-unmatched-link"
                      onClick={() => openManualKrCodeModal(ticker)}
                    >
                      {ticker}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {/* Auth gate */}
      {!authLoading && !isAuthed ? (
        <div className="pf-auth-gate">
          로그인 후 데이터를 확인할 수 있습니다.
        </div>
      ) : null}

      {/* Content */}
      <div className="pf-content">
        <div className="pf-sec-title">투자 현황</div>

        <div className="pf-invest-wrap">
          {/* Left: NAV stack */}
          <div className="pf-nav-stack">
            <div className="pf-nav-stat-card">
              <div className="pf-nsc-top">
                <span className="pf-nsc-label">KR NAV</span>
                <span className="pf-nsc-flag">🇰🇷</span>
              </div>
              <div className="pf-nsc-val">
                <Money currency="KRW" amountInt={krHoldingsMarketValueKrw} />
              </div>
              <div className="pf-nsc-pnl">
                {renderPnlAmt("KRW", krHoldingsPnlKrw)}
                {renderPnlPctChip(krPnlPct)}
              </div>
              {krPnlPct !== null ? (
                <div className="pf-loss-bar-wrap">
                  <div className="pf-loss-bar-track">
                    <div
                      className={`pf-loss-bar-fill${krPnlPct > 0 ? " is-pos" : ""}`}
                      style={{ width: `${Math.min(Math.abs(krPnlPct), 100)}%` }}
                    />
                  </div>
                  <div className="pf-loss-bar-label">
                    <span>{krPnlPct >= 0 ? "수익률" : "손실률"}</span>
                    <span>{percentFormat(Math.abs(krPnlPct))}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pf-nav-stat-card">
              <div className="pf-nsc-top">
                <span className="pf-nsc-label">US NAV</span>
                <span className="pf-nsc-flag">🇺🇸</span>
              </div>
              <div className="pf-nsc-val">
                <Money currency="USD" amountInt={usHoldingsMarketValueCents} />
              </div>
              <div className="pf-nsc-pnl">
                {renderPnlAmt("USD", usdHoldingsPnlCents)}
                {renderPnlPctChip(usPnlPct)}
              </div>
              {usPnlPct !== null ? (
                <div className="pf-loss-bar-wrap">
                  <div className="pf-loss-bar-track">
                    <div
                      className={`pf-loss-bar-fill${usPnlPct > 0 ? " is-pos" : ""}`}
                      style={{ width: `${Math.min(Math.abs(usPnlPct), 100)}%` }}
                    />
                  </div>
                  <div className="pf-loss-bar-label">
                    <span>{usPnlPct >= 0 ? "수익률" : "손실률"}</span>
                    <span>{percentFormat(Math.abs(usPnlPct))}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="pf-cash-row">
              <div className="pf-cash-card">
                <p className="pf-cash-label">예수금</p>
                <p className="pf-cash-val">
                  <Money currency="KRW" amountInt={totalDepositKrw} />
                </p>
              </div>
              <div className="pf-cash-card">
                <p className="pf-cash-label">현금</p>
                <p className="pf-cash-val">
                  <Money currency="KRW" amountInt={cashKrw} />
                </p>
              </div>
            </div>
          </div>

          {/* Right: Donut chart */}
          <div
            className="pf-chart-card"
            style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '24px', padding: '16px 20px' }}
          >
            <div
              className="pf-donut-outer"
              style={{ width: '180px', height: '180px', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <DonutChart slices={donutSlices} total={donutTotal} />
              <div className="pf-donut-center">
                <div className="pf-donut-center-val"><CompactKrw amount={totalAssetKrw} /></div>
                <div className="pf-donut-center-sub">총 자산</div>
              </div>
            </div>
            {donutSlices.length === 0 ? (
              <div className="pf-empty-chart">데이터가 없습니다.</div>
            ) : (
              <div
                className="pf-legend"
                style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, justifyContent: 'center' }}
              >
                {donutSlices.map((slice) => (
                  <div
                    key={slice.key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '16px 130px 120px 55px',
                      alignItems: 'center',
                      gap: '0px 10px',
                      padding: '3px 0',
                    }}
                  >
                    <div className="pf-ldot" style={{ background: slice.color }} />
                    <span style={{ fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {slice.label}
                    </span>
                    <span style={{ fontSize: '12px', fontFamily: 'JetBrains Mono, monospace', whiteSpace: 'nowrap' }}>
                      <Money currency="KRW" amountInt={slice.amountKrw} />
                    </span>
                    <span style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {donutTotal > 0
                        ? `${((slice.amountKrw / donutTotal) * 100).toFixed(2)}%`
                        : "0.00%"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Holdings bar */}
        <div className="pf-holdings-bar">
          <div className="pf-tab-group">
            <button
              type="button"
              className={`pf-tab${donutMode === "TICKER" ? " is-active" : ""}`}
              onClick={() => setDonutMode("TICKER")}
            >
              종목별
            </button>
            <button
              type="button"
              className={`pf-tab${donutMode === "SECTOR" ? " is-active" : ""}`}
              onClick={() => setDonutMode("SECTOR")}
            >
              섹터별
            </button>
            <button
              type="button"
              className={`pf-tab${donutMode === "COUNTRY" ? " is-active" : ""}`}
              onClick={() => setDonutMode("COUNTRY")}
            >
              국가별
            </button>
          </div>
          <div className="pf-filter-group">
            <button
              type="button"
              className={`pf-chip${market === "ALL" ? " is-active" : ""}`}
              onClick={() => setMarket("ALL")}
            >
              ALL
            </button>
            <button
              type="button"
              className={`pf-chip${market === "KR" ? " is-active" : ""}`}
              onClick={() => setMarket("KR")}
            >
              KR
            </button>
            <button
              type="button"
              className={`pf-chip${market === "US" ? " is-active" : ""}`}
              onClick={() => setMarket("US")}
            >
              US
            </button>
          </div>
          <input
            className="pf-search-input"
            type="text"
            placeholder="Ticker 검색..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {/* Holdings table */}
        <div className="pf-tbl-wrap">
          <table className="pf-table">
            <colgroup>
              <col className="pf-c1" />
              <col className="pf-c2" />
              <col className="pf-c3" />
              <col className="pf-c4" />
              <col className="pf-c5" />
              <col className="pf-c6" />
            </colgroup>
            <thead>
              <tr>
                <th onClick={() => handleSortClick("ticker")}>
                  보유종목 {renderSortArrow("ticker")}
                </th>
                <th onClick={() => handleSortClick("dailyChangeRate")}>
                  1일 등락률 {renderSortArrow("dailyChangeRate")}
                </th>
                <th onClick={() => handleSortClick("marketValue")}>
                  NAV {renderSortArrow("marketValue")}
                </th>
                <th onClick={() => handleSortClick("pnl")}>
                  PnL {renderSortArrow("pnl")}
                </th>
                <th onClick={() => handleSortClick("pnlRate")}>
                  PnL% {renderSortArrow("pnlRate")}
                </th>
                <th onClick={() => handleSortClick("weight")}>
                  비중 {renderSortArrow("weight")}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>로딩 중...</td>
                </tr>
              ) : sortedTableRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="pf-muted">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedTableRows.map((row) => {
                  const { holding, computed } = row;
                  const displayName = resolveHoldingDisplayName(holding);
                  const flag = holding.market === "KR" ? "🇰🇷" : "🇺🇸";
                  const weightPct =
                    totalMarketValueKrwForWeight > 0
                      ? (row.marketValueComparableKrw / totalMarketValueKrwForWeight) * 100
                      : 0;

                  return (
                    <tr
                      key={holding.id}
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
                        <span className="pf-t-flag">{flag}</span>
                        <span className="pf-t-name">{displayName}</span>
                        <span className="pf-t-code">
                          {holding.tickerCode ?? holding.ticker}
                        </span>
                      </td>
                      <td>
                        {row.dailyChangeRate === null ? (
                          <span className="pf-chip-flat">—</span>
                        ) : row.dailyChangeRate > 0 ? (
                          <span className="pf-chip-pos">
                            {formatDailyChangeLabel(row.dailyChangeRate)}
                          </span>
                        ) : row.dailyChangeRate < 0 ? (
                          <span className="pf-chip-neg">
                            {formatDailyChangeLabel(row.dailyChangeRate)}
                          </span>
                        ) : (
                          <span className="pf-chip-flat">
                            {formatDailyChangeLabel(row.dailyChangeRate)}
                          </span>
                        )}
                      </td>
                      <td>
                        <Money currency={holding.currency} amountInt={computed.marketValue} />
                      </td>
                      <td
                        className={pnlToneClass(computed.pnl, "pf-pnl-pos", "pf-pnl-neg")}
                        style={{
                          color: computed.pnl > 0 ? "#16a34a" : computed.pnl < 0 ? "#dc2626" : "#6b7280",
                          fontWeight: computed.pnl !== 0 ? 600 : undefined,
                        }}
                      >
                        <Money currency={holding.currency} amountInt={computed.pnl} signed />
                      </td>
                      <td
                        className={pnlToneClass(computed.pnlRate, "pf-pnl-pos", "pf-pnl-neg")}
                        style={{
                          color: computed.pnlRate > 0 ? "#16a34a" : computed.pnlRate < 0 ? "#dc2626" : "#6b7280",
                          fontWeight: computed.pnlRate !== 0 ? 600 : undefined,
                        }}
                      >
                        {computed.pnlRate > 0 ? "+" : ""}{percentFormat(computed.pnlRate)}
                      </td>
                      <td className="pf-muted">{weightPct.toFixed(2)}%</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ticker strip (bottom) */}
      <div className="pf-ticker">
        <div className="pf-tick-item">
          <span className="pf-tick-label">KOSPI</span>
          <span className="pf-tick-val">
            {marketIndexes.kospi
              ? marketIndexes.kospi.price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })
              : "—"}
          </span>
          <span className={`pf-badge ${marketIndexes.kospi == null ? "is-flat" : marketIndexes.kospi.changePercent > 0 ? "is-up" : marketIndexes.kospi.changePercent < 0 ? "is-down" : "is-flat"}`}>
            {marketIndexes.kospi
              ? `${marketIndexes.kospi.changePercent > 0 ? "+" : ""}${marketIndexes.kospi.changePercent.toFixed(2)}%`
              : "—"}
          </span>
        </div>
        <div className="pf-tick-item">
          <span className="pf-tick-label">KOSDAQ</span>
          <span className="pf-tick-val">
            {marketIndexes.kosdaq
              ? marketIndexes.kosdaq.price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })
              : "—"}
          </span>
          <span className={`pf-badge ${marketIndexes.kosdaq == null ? "is-flat" : marketIndexes.kosdaq.changePercent > 0 ? "is-up" : marketIndexes.kosdaq.changePercent < 0 ? "is-down" : "is-flat"}`}>
            {marketIndexes.kosdaq
              ? `${marketIndexes.kosdaq.changePercent > 0 ? "+" : ""}${marketIndexes.kosdaq.changePercent.toFixed(2)}%`
              : "—"}
          </span>
        </div>
        <div className="pf-tick-item">
          <span className="pf-tick-label">S&amp;P 500</span>
          <span className="pf-tick-val">
            {marketIndexes.sp500
              ? marketIndexes.sp500.price.toLocaleString("en-US", { maximumFractionDigits: 2 })
              : "—"}
          </span>
          <span className={`pf-badge ${marketIndexes.sp500 == null ? "is-flat" : marketIndexes.sp500.changePercent > 0 ? "is-up" : marketIndexes.sp500.changePercent < 0 ? "is-down" : "is-flat"}`}>
            {marketIndexes.sp500
              ? `${marketIndexes.sp500.changePercent > 0 ? "+" : ""}${marketIndexes.sp500.changePercent.toFixed(2)}%`
              : "—"}
          </span>
        </div>
        <div className="pf-tick-item">
          <span className="pf-tick-label">USD/KRW</span>
          <span className="pf-tick-val">
            {fxRate.toLocaleString("ko-KR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>
        <div className="pf-live-wrap">
          <div className="pf-live-dot" />
          <span className="pf-live-label">Live · {formatKstLiveLabel(nowMs)} KST</span>
        </div>
      </div>

      {/* Manual KR code modal */}
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
    </div>
  );
}
