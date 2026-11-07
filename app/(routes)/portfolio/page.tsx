"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MarketIndexes } from "@/lib/marketIndexes";
import { PortfolioFundsCard } from "@/components/portfolio/PortfolioFundsCard";
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
  percentFormat,
  usdCentsToUsdFloat,
  usdToKrw,
} from "@/lib/utils/money";
import { supabase } from "@/lib/supabaseClient";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const LAST_QUOTE_REFRESH_STORAGE_KEY = "pf_last_quote_refresh_at_v1";
const QUOTE_REFRESH_COMPLETED_STORAGE_KEY = "pf_quote_refresh_completed_at_v1";
const QUOTE_AUTO_REFRESH_INTERVAL_MS = 600_000;
const LAST_QUOTE_FAIL_STORAGE_KEY = "pf_last_quote_fail_at_v1";
const QUOTE_BLACKLIST_STORAGE_KEY = "pf_quote_blacklist_v1";
const DEFAULT_FX_RATE = 1350;
const QUOTE_FAIL_COOLDOWN_MS = 600_000;
const QUOTE_FAILURE_TICKER_PREVIEW_LIMIT = 5;
const QUOTE_UNSUPPORTED_SKIP_MESSAGE = "지원되지 않는 티커는 24시간 동안 자동 스킵됩니다";

const DONUT_COLORS = [
  "#4D68CB",
  "#9296C8",
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
  amountUsdCents?: number;
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
  const usdAmounts = new Map<string, number>();
  const domesticGroups = new Set<string>();
  // Keep native USD amounts instead of reversing the rounded KRW values.
  holdings.forEach((holding) => {
    const amount = calcHoldingComputed(holding).marketValue;
    if (!Number.isFinite(amount) || amount <= 0) return;
    const key = mode === "COUNTRY" ? holding.market
      : mode === "SECTOR" ? holding.sector ?? "Other"
      : resolveHoldingGroupingKey(holding);
    if (holding.market === "US") {
      usdAmounts.set(key, (usdAmounts.get(key) ?? 0) + amount);
    } else {
      domesticGroups.add(key);
    }
  });

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
      label: labelMap.get(key) ?? ({ Deposit: "예수금", Cash: "현금", KR: "한국", US: "미국" } as Record<string, string>)[key] ?? key,
      amountKrw,
      // Mixed-market sectors retain a single KRW total.
      amountUsdCents: domesticGroups.has(key) || key === "Deposit" || key === "Cash"
        ? undefined : usdAmounts.get(key),
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
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hoveredSlice = slices.find(slice => slice.key === hoveredKey);
  const tooltipWidth = Math.min(330, Math.max(90, (hoveredSlice?.label.length ?? 0) * 10 + 28));
  const cx = 180, cy = 120, radius = 78;
  let cumulative = 0;
  const arcs = total > 0 ? slices.map((slice) => {
    const fraction = slice.amountKrw / total;
    const span = fraction * 2 * Math.PI;
    const start = cumulative / total * 2 * Math.PI - Math.PI / 2;
    cumulative += slice.amountKrw;
    const stroke = Math.min(16, span * radius * .65);
    const inset = (stroke / radius + Math.min(.07, span * .15)) / 2;
    const from = start + inset, to = start + span - inset;
    const mid = start + span / 2;
    const point = (angle: number, r: number) => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    const [x1, y1] = point(from, radius), [x2, y2] = point(to, radius);
    const [lx, ly] = point(mid, radius + 24);
    const right = Math.cos(mid) >= 0;
    return { ...slice, fraction, stroke, lx, ly, right,
      d: `M ${x1} ${y1} A ${radius} ${radius} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}` };
  }) : [];
  return (
    <svg className="pf-donut-svg" viewBox="0 0 360 240" role="img" aria-label="자산 구성 비중">
      {arcs.length === 0 ? <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--east-surface-2)" strokeWidth="16" /> : null}
      {arcs.map(arc => (
        <g key={arc.key}>
          <path d={arc.d} fill="none" stroke={arc.color} strokeWidth={arc.stroke} strokeLinecap="round"
            className="pf-donut-segment" tabIndex={0} aria-label={`${arc.label}: ${(arc.fraction * 100).toFixed(2)}%`}
            onMouseEnter={() => setHoveredKey(arc.key)} onMouseLeave={() => setHoveredKey(null)}
            onFocus={() => setHoveredKey(arc.key)} onBlur={() => setHoveredKey(null)}
            onKeyDown={event => { if (event.key === "Escape") setHoveredKey(null); }}
          />
          {arc.fraction >= .08 && slices.length <= 6 ? (
            <g className="pf-donut-callout">
              <text x={arc.lx + (arc.right ? 8 : -8)} y={arc.ly + 4}
                textAnchor={arc.right ? "start" : "end"} fill={arc.color}>
                {(arc.fraction * 100).toFixed(1)}%
              </text>
            </g>
          ) : null}
        </g>
      ))}
      {hoveredSlice && <g className="pf-donut-tooltip" role="tooltip" pointerEvents="none">
        <rect x={cx - tooltipWidth / 2} y="8" width={tooltipWidth} height="30" rx="8" fill="#20242c" />
        <text x={cx} y="28" textAnchor="middle" fill="white" fontSize="13" fontWeight="550">{hoveredSlice.label}</text>
      </g>}
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

function DualCurrencyMoney({ currency, amountInt, fxRate, signed = false, suffix }: {
  currency: Currency;
  amountInt: number;
  fxRate: number;
  signed?: boolean;
  suffix?: ReactNode;
}) {
  return (
    <span className="pf-dual-money">
      {suffix ? <span className="pf-money-with-suffix"><Money currency={currency} amountInt={amountInt} signed={signed} />{suffix}</span>
        : <Money currency={currency} amountInt={amountInt} signed={signed} />}
      {currency === "USD" ? (
        <span className="pf-krw-equivalent" title="현재 적용 환율 기준 원화 환산액">
          ≈ <Money currency="KRW" amountInt={usdToKrw(usdCentsToUsdFloat(amountInt), fxRate)} signed={signed} />
        </span>
      ) : null}
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
    userId,
  } = usePortfolio();
  const [isModalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PortfolioHolding | undefined>();
  const [donutMode, setDonutMode] = useState<DonutMode>("TICKER");
  const {
    state: accountState,
    loading: accountStateLoading,
    saveFunds,
  } = usePortfolioAccountState();
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [fxAsOf, setFxAsOf] = useState("");
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
  const [marketIndexes, setMarketIndexes] = useState<MarketIndexes>({
    kospi: null, kosdaq: null, sp500: null, nasdaq: null, fetchedAt: "",
  });
  const [indexesLoading, setIndexesLoading] = useState(true);
  const [indexesFailed, setIndexesFailed] = useState(false);
  const quoteRefreshInFlightRef = useRef(false);
  const quoteRefreshCompletedRef = useRef<{ userId: string | null; at: number } | null>(null);
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
    const controller = new AbortController();
    const fetchIndexes = async () => {
      try {
        const res = await fetch(`/api/market-index?_=${Date.now()}`, {
          cache: "no-store", signal: controller.signal,
        });
        if (!res.ok) throw new Error("Index lookup failed");
        const data = (await res.json()) as MarketIndexes;
        if (!controller.signal.aborted) {
          setMarketIndexes(data);
          setIndexesFailed(!data.kospi || !data.kosdaq || !data.sp500 || !data.nasdaq);
        }
      } catch {
        if (!controller.signal.aborted) setIndexesFailed(true);
      } finally {
        if (!controller.signal.aborted) setIndexesLoading(false);
      }
    };
    void fetchIndexes();
    const id = window.setInterval(fetchIndexes, 30_000);
    return () => { controller.abort(); window.clearInterval(id); };
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

  useEffect(() => {
    if (authLoading || isAuthed) {
      return;
    }

    setModalOpen(false);
    setEditing(undefined);
    setManualKrTicker(null);
    setManualKrCodeInput("");
  }, [authLoading, isAuthed]);

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

        // Read storage on every entry/visibility change, including after a remount.
        let storedCompletedAt: number | null = null;
        let storedQuoteAt: number | null = null;
        try {
          storedCompletedAt = parseStoredTimestamp(window.localStorage.getItem(
            `${QUOTE_REFRESH_COMPLETED_STORAGE_KEY}:${userId}`,
          ));
          storedQuoteAt = parseStoredTimestamp(window.localStorage.getItem(LAST_QUOTE_REFRESH_STORAGE_KEY));
        } catch {
          // The in-memory record still prevents repeats if storage is unavailable.
        }
        const memoryCompletedAt = quoteRefreshCompletedRef.current?.userId === userId
          ? quoteRefreshCompletedRef.current.at : null;
        const recentlyRefreshed = [memoryCompletedAt, storedCompletedAt, storedQuoteAt, lastQuoteRefreshAt]
          .some(at => at !== null && now >= at && now - at < QUOTE_AUTO_REFRESH_INTERVAL_MS);
        if (recentlyRefreshed) return;

        if (lastQuoteFailAt !== null && now >= lastQuoteFailAt && now - lastQuoteFailAt < QUOTE_FAIL_COOLDOWN_MS) {
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

        // Cooldown uses the request completion time; market data may be from an older session.
        const refreshedAt = Date.now();
        quoteRefreshCompletedRef.current = { userId, at: refreshedAt };
        try {
          window.localStorage.setItem(`${QUOTE_REFRESH_COMPLETED_STORAGE_KEY}:${userId}`, `${refreshedAt}`);
        } catch {
          // Keep the in-memory completion record when storage is unavailable.
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
    [lastQuoteFailAt, lastQuoteRefreshAt, userId, refresh],
  );

  const accessRefreshUserRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isAuthed) {
      accessRefreshUserRef.current = null;
      return;
    }
    if (loading || !quoteMetaLoaded || !userId || accessRefreshUserRef.current === userId) return;
    accessRefreshUserRef.current = userId;
    void refreshQuotesForVisible();
  }, [isAuthed, userId, loading, quoteMetaLoaded, refreshQuotesForVisible]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && isAuthed && quoteMetaLoaded) {
        void refreshQuotesForVisible();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [isAuthed, quoteMetaLoaded, refreshQuotesForVisible]);

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
      const rows = holdings.map((holding) => {
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
    [holdings, fxRate],
  );

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

  const renderCountryHoldings = (country: Market) => {
    const countryName = country === "US" ? "미국" : "한국";
    const rows = tableRows.filter(row => row.holding.market === country);
    if (loading) return <p className="pf-country-loading" role="status">로딩 중...</p>;
    if (rows.length === 0) return null;
    return <section className="pf-country-holdings" aria-label={countryName + " 보유 종목"}>
      {rows.map(row => {
              const { holding, computed, dailyChangeRate } = row;
              const name = resolveHoldingDisplayName(holding);
              return <button type="button" key={holding.id} className="pf-position-row"
                aria-label={name + " 보유종목 편집"} onClick={() => handleEdit(holding)}>
                <span className="pf-position-row-head">
                  <span className="pf-position-row-name">
                    <span className="pf-position-row-title" title={name}>{name}</span>
                  </span>
                  <span className={"pf-position-day " + (dailyChangeRate === null || dailyChangeRate === 0 ? "is-flat" : dailyChangeRate > 0 ? "is-up" : "is-down")}
                    aria-label={"1일 등락률 " + (dailyChangeRate === null ? "정보 없음" : percentFormat(dailyChangeRate))}>
                    {dailyChangeRate === null ? "—" : (dailyChangeRate > 0 ? "+" : "") + percentFormat(dailyChangeRate)}
                  </span>
                </span>
                <span className="pf-position-row-values">
                  <span><span className="pf-position-metric-label">평가금액</span>
                    <DualCurrencyMoney currency={holding.currency} amountInt={computed.marketValue} fxRate={fxRate} />
                  </span>
                  <span><span className="pf-position-metric-label">평가손익</span>
                    <span className={pnlToneClass(computed.pnl, "pf-pnl-pos", "pf-pnl-neg")}>
                      <DualCurrencyMoney currency={holding.currency} amountInt={computed.pnl} fxRate={fxRate} signed
                        suffix={<span className="pf-position-pnl-rate">({computed.pnlRate > 0 ? "+" : ""}{percentFormat(computed.pnlRate)})</span>} />
                    </span>
                  </span>
                </span>
              </button>;
      })}
    </section>;
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

  const pnlToneClass = (value: number, posClass: string, negClass: string): string => {
    if (value > 0) return posClass;
    if (value < 0) return negClass;
    return "";
  };

  return (
    <div className="pf-page">
      {/* Page header */}
      <div className="pf-page-header">
        <div className="pf-heading-row">
          <h1 className="pf-page-title">Portfolio</h1>
        <div className="pf-header-actions">
          <button
            type="button"
            className="pf-btn pf-header-icon"
            aria-label={isRefreshingQuotes ? "현재가 갱신 중" : "현재가 갱신"} title="현재가 갱신" aria-busy={isRefreshingQuotes}
            onClick={() => {
              void handleManualQuoteRefresh();
            }}
            disabled={!isAuthed || isRefreshingQuotes}
          >
            <svg className={isRefreshingQuotes ? "pf-refresh-spinning" : undefined} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></svg>
          </button>
          <button
            type="button"
            className="pf-btn pf-btn-primary pf-header-icon" aria-label="종목 추가" title="종목 추가"
            onClick={handleCreate}
            disabled={!isAuthed}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
          </button>
        </div>
        </div>

        <div className="pf-summary-row">
        <span className="pf-header-stat">
          <span className="pf-header-label">총 자산</span>
          <strong>
            <Money currency="KRW" amountInt={totalAssetKrw} />
          </strong>
        </span>

        <span className="pf-header-stat">
          <span className="pf-header-label">총 계좌 손익</span>
          <strong className={pnlToneClass(accountPnlKrw, "is-pos", "is-neg")}>
            <Money currency="KRW" amountInt={accountPnlKrw} />
            {totalPnlPct !== null && <span className="pf-summary-percent">({percentFormat(totalPnlPct)})</span>}
          </strong>
        </span>

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
        <section className="pf-overview-card" aria-labelledby="pf-overview-title">
          <div className="pf-overview-heading">
            <h2 id="pf-overview-title" className="pf-sec-title">투자 현황</h2>
          </div>
          <div className="pf-overview-allocation" aria-label="자산 구성">
          <div className="pf-tab-group pf-allocation-tabs" aria-label="자산 구성 기준">
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
            <div className="pf-donut-outer">
              <DonutChart slices={donutSlices} total={donutTotal} />
              <div className="pf-donut-center">
                <div className="pf-donut-center-val"><CompactKrw amount={totalAssetKrw} /></div>
                <div className="pf-donut-center-sub">총 자산</div>
              </div>
            </div>
            {donutSlices.length === 0 ? <div className="pf-empty-chart">데이터가 없습니다.</div> : (
              <ul className="pf-allocation-legend" aria-label="자산별 비중">
                {donutSlices.map(slice => (
                  <li key={slice.key} title={slice.label}>
                    <span className="pf-allocation-dot" style={{ background: slice.color }} aria-hidden="true" />
                    <span className="pf-allocation-label">{slice.label}</span>
                    <span className="pf-allocation-percent">{donutTotal > 0 ? ((slice.amountKrw / donutTotal) * 100).toFixed(1) : "0.0"}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        <div className="pf-minimal-assets">
          {/* Compact accounts and modal cash editors. */}
          <div className="pf-nav-stack">
            <div className="pf-account-banner">
              <div className="pf-country-group" aria-label="미국 투자 현황">
              <section className="pf-country-account" aria-label="미국 계좌" data-empty={usHoldingsMarketValueCents === 0 && usdHoldingsPnlCents === 0}>
                <span className="pf-country-flag" role="img" aria-label="미국">🇺🇸</span>
                <div className="pf-country-assets" aria-label="미국 자산 금액">
                  <strong><Money currency="USD" amountInt={usHoldingsMarketValueCents} /></strong>
                  <span className="pf-country-secondary">≈ <Money currency="KRW" amountInt={usdToKrw(usdCentsToUsdFloat(usHoldingsMarketValueCents), fxRate)} /></span>
                </div>
                <div className={"pf-country-pnl " + pnlToneClass(usdHoldingsPnlCents, "is-pos", "is-neg")} aria-label="미국 계좌 손익">
                  <strong><Money currency="USD" amountInt={usdHoldingsPnlCents} signed /></strong>
                  <span className="pf-country-secondary">{usPnlPct === null ? "—" : percentFormat(usPnlPct)}</span>
                </div>
              </section>
                {renderCountryHoldings("US")}
              </div>
              <div className="pf-country-group" aria-label="한국 투자 현황">
              <section className="pf-country-account" aria-label="한국 계좌" data-empty={krHoldingsMarketValueKrw === 0 && krHoldingsPnlKrw === 0}>
                <span className="pf-country-flag" role="img" aria-label="한국">🇰🇷</span>
                <div className="pf-country-assets" aria-label="한국 자산 금액">
                  <strong><Money currency="KRW" amountInt={krHoldingsMarketValueKrw} /></strong>
                  <span className="pf-country-secondary">—</span>
                </div>
                <div className={"pf-country-pnl " + pnlToneClass(krHoldingsPnlKrw, "is-pos", "is-neg")} aria-label="한국 계좌 손익">
                  <strong><Money currency="KRW" amountInt={krHoldingsPnlKrw} signed /></strong>
                  <span className="pf-country-secondary">{krPnlPct === null ? "—" : percentFormat(krPnlPct)}</span>
                </div>
              </section>
                {renderCountryHoldings("KR")}
              </div>
            </div>
            <div className="pf-cash-row" role="group" aria-label="예수금 및 현금">
              <PortfolioFundsCard key={"deposit:" + userId} kind="deposit" krw={depositKrw} usdCents={depositUsdCents} fxRate={fxRate}
                amount={<Money currency="KRW" amountInt={totalDepositKrw} />} disabled={!isAuthed || accountStateLoading}
                onSave={(krw, usdCents) => saveFunds({ depositKrwInt: krw, depositUsdCents: usdCents })} />
              <PortfolioFundsCard key={"cash:" + userId} kind="cash" krw={cashKrw} fxRate={fxRate}
                amount={<Money currency="KRW" amountInt={cashKrw} />} disabled={!isAuthed || accountStateLoading}
                onSave={krw => saveFunds({ cashKrwInt: krw })} />
            </div>
          </div>

        </div>
            <div className="pf-overview-meta">
          {fxSummaryText.split("\n").map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
          {quoteRefreshSummary && quoteRefreshSummary !== "-" ? (
            <div className="pf-update-summary">
              <span>시세 갱신 상세</span>
              <div>{quoteRefreshSummary}</div>
            </div>
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
        </section>

      </div>

      {/* Ticker strip (bottom) */}
      <div className="pf-ticker">
        {([
          ["kospi", "KOSPI"], ["kosdaq", "KOSDAQ"],
          ["sp500", "S&P 500"], ["nasdaq", "NASDAQ"],
        ] as const).map(([key, label]) => {
          const quote = marketIndexes[key];
          const change = quote?.changePercent;
          return (
            <div className="pf-tick-item" key={key}
              title={quote?.asOf ? `네이버 증권 · 시세 기준 ${quote.asOf}${quote.marketStatus === "CLOSE" ? " · 장 마감" : ""}` : "시세 조회 중 또는 제공처 응답 없음"}>
              <span className="pf-tick-label">{label}</span>
              <span className="pf-tick-val">{quote
                ? quote.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : indexesLoading ? "조회 중" : "조회 실패"}</span>
              <span className={`pf-badge ${change == null ? "is-flat" : change > 0 ? "is-up" : change < 0 ? "is-down" : "is-flat"}`}>
                {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
              </span>
            </div>
          );
        })}
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
          <div className={`pf-live-dot${indexesFailed ? " is-stale" : ""}`} />
          <span className="pf-live-label" role="status">
            {indexesLoading ? "지수 조회 중" : indexesFailed ? "일부 지수 조회 실패" : "지수 조회 완료"}
            {marketIndexes.fetchedAt ? ` · ${formatKstLiveLabel(Date.parse(marketIndexes.fetchedAt))} KST` : ""}
          </span>
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
