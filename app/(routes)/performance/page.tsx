"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { RealizedTradeModal } from "@/components/RealizedTradeModal";
import { TotalAssetCalendar } from "@/components/TotalAssetCalendar";
import {
  AssetTrendBenchmarkKey,
  AssetTrendBenchmarkPoint,
  buildAssetTrendBenchmarkData,
  createEmptyIndexHistorySeries,
  IndexHistorySeriesMap,
} from "@/lib/asset-trend/benchmark";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { useRealizedTrades } from "@/lib/hooks/useRealizedTrades";
import { useTotalAssets } from "@/lib/hooks/useTotalAssets";
import { Currency, Market, PortfolioHolding, RealizedTrade } from "@/lib/models/types";
import { calculatePortfolioTotalAsset } from "@/lib/services/portfolioService";
import { fetchSnapshotFxRate, loadSnapshotCash } from "@/lib/services/snapshotInputs";
import {
  buildMonthlyNetSeriesByYear,
  convertTradeAmountToKrw,
  filterRealizedTrades,
  resolveTradeCurrency,
  summarizeRealizedTrades,
} from "@/lib/services/realizedTradeService";
import {
  getMonthRangeFromYm,
  todayKstYmd,
  toYm,
  toYmd,
} from "@/lib/utils/date";
import { moneyFormat, moneyFormatParts, percentFormat } from "@/lib/utils/money";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const DEFAULT_FX_RATE = 1350;
const SSR_SAFE_DATE = "1970-01-01";
const SSR_SAFE_MONTH = "1970-01";

type PeriodKey = "1m" | "3m" | "6m" | "1y" | "custom";

const PERIOD_LABELS: Record<PeriodKey, string> = {
  "1m": "이번 달",
  "3m": "3개월",
  "6m": "6개월",
  "1y": "1년",
  custom: "직접 입력",
};

const SERIES_COLOR: Record<AssetTrendBenchmarkKey, string> = {
  portfolio: "#111111",
  kospi: "#ef4444",
  sp500: "#16a34a",
  kosdaq: "#2563eb",
  nasdaq: "#f97316",
};

const SERIES_LABEL: Record<AssetTrendBenchmarkKey, string> = {
  portfolio: "Portfolio",
  kospi: "KOSPI",
  sp500: "S&P 500",
  kosdaq: "KOSDAQ",
  nasdaq: "NASDAQ",
};

const SERIES_ORDER: AssetTrendBenchmarkKey[] = [
  "portfolio",
  "kospi",
  "kosdaq",
  "sp500",
  "nasdaq",
];

interface IndexHistoryApiResponse {
  series?: Partial<IndexHistorySeriesMap>;
  errors?: string[];
}

interface FxApiResponse {
  rate: number;
  asOf: string;
}

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== SSR_SAFE_DATE;
}

function MoneyText({
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
    <span className="perf-money">
      {prefix}
      <span className="perf-money-symbol">{symbol}</span>
      {cleanValue}
    </span>
  );
}

const SYM_KRW = <span className="perf-money-symbol">₩</span>;

function CompactKrw({ amount }: { amount: number }) {
  if (!Number.isFinite(amount) || amount === 0) {
    return <>{SYM_KRW}0</>;
  }

  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 100_000_000) {
    return <>{sign}{SYM_KRW}{(abs / 100_000_000).toFixed(1)}억</>;
  }

  if (abs >= 10_000_000) {
    return <>{sign}{SYM_KRW}{(abs / 1_000_000).toFixed(1)}M</>;
  }

  if (abs >= 1_000) {
    return <>{sign}{SYM_KRW}{(abs / 1_000_000).toFixed(2)}M</>;
  }

  return <>{sign}{SYM_KRW}{abs}</>;
}

function computePeriodRange(
  period: PeriodKey,
  today: string,
  custom: { from: string; to: string },
): { from: string; to: string } {
  if (period === "custom") {
    return custom;
  }

  if (!isValidDate(today)) {
    return { from: today, to: today };
  }

  if (period === "1m") {
    const monthRange = getMonthRangeFromYm(today.slice(0, 7));
    return { from: monthRange.from, to: today };
  }

  const todayDate = new Date(`${today}T00:00:00`);
  const fromDate = new Date(todayDate);

  if (period === "3m") {
    fromDate.setMonth(fromDate.getMonth() - 3);
  } else if (period === "6m") {
    fromDate.setMonth(fromDate.getMonth() - 6);
  } else if (period === "1y") {
    fromDate.setFullYear(fromDate.getFullYear() - 1);
  }

  return { from: toYmd(fromDate), to: today };
}

function getMonthOptions(today: string, count = 12): string[] {
  const out: string[] = [];
  if (!isValidDate(today)) return out;

  const [y, m] = today.split("-").map((part) => Number.parseInt(part, 10));

  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const ym = `${d.getUTCFullYear()}-${`${d.getUTCMonth() + 1}`.padStart(2, "0")}`;
    out.push(ym);
  }

  return out;
}

function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return `${y}년 ${Number.parseInt(m, 10)}월`;
}

interface BenchmarkLineChartProps {
  data: AssetTrendBenchmarkPoint[];
  visible: Record<AssetTrendBenchmarkKey, boolean>;
}

function buildSmoothPath(
  pts: Array<{ x: number; y: number }>,
  tension = 1,
): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) {
    const { x, y } = pts[0];
    return `M ${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  const segments: string[] = [`M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`];

  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const c1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const c2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    segments.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }

  return segments.join(" ");
}

function BenchmarkLineChart({ data, visible }: BenchmarkLineChartProps) {
  const W = 640;
  const H = 190;
  const padL = 44;
  const padR = 12;
  const padT = 16;
  const padB = 28;

  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const points = data;
  const n = points.length;

  const visibleSeries = SERIES_ORDER.filter((k) => visible[k]);

  const allValues = points.flatMap((p) =>
    visibleSeries
      .map((k) => p[k])
      .filter((v): v is number => typeof v === "number"),
  );

  if (allValues.length === 0 || n === 0) {
    return (
      <div className="perf-empty-chart">선택한 기간의 비교 데이터가 없습니다.</div>
    );
  }

  const dataMin = Math.min(...allValues, 0);
  const dataMax = Math.max(...allValues, 0);
  const span = Math.max(dataMax - dataMin, 1);
  const yMin = dataMin - span * 0.1;
  const yMax = dataMax + span * 0.1;
  const yRange = yMax - yMin || 1;

  const toX = (i: number) =>
    padL + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
  const toY = (v: number) => padT + ((yMax - v) / yRange) * chartH;

  const buildPath = (key: AssetTrendBenchmarkKey): string => {
    const pts: Array<{ x: number; y: number }> = [];
    points.forEach((p, i) => {
      const v = p[key];
      if (typeof v !== "number") return;
      pts.push({ x: toX(i), y: toY(v) });
    });
    return buildSmoothPath(pts);
  };

  const ticks = 4;
  const tickValues = Array.from({ length: ticks + 1 }, (_, i) => yMin + (yRange * i) / ticks);

  const labelFirst = points[0]?.date ?? "";
  const labelLast = points[n - 1]?.date ?? "";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      width="100%"
      height="100%"
      className="perf-line-svg"
      role="img"
      aria-label="선택 기간의 포트폴리오와 지수 수익률 비교"
    >
      {tickValues.map((tv, idx) => {
        const y = toY(tv);
        const isZero = Math.abs(tv) < 0.001;
        return (
          <g key={idx}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke={isZero ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.06)"}
              strokeWidth={1}
              strokeDasharray={isZero ? undefined : "4,4"}
            />
            <text
              className="perf-svg-text"
              x={padL - 6}
              y={y + 4}
              textAnchor="end"
            >
              {`${tv >= 0 ? "+" : ""}${tv.toFixed(1)}%`}
            </text>
          </g>
        );
      })}
      {SERIES_ORDER.map((key) => {
        if (!visible[key]) return null;
        const d = buildPath(key);
        if (!d) return null;
        return (
          <path
            key={key}
            d={d}
            fill="none"
            stroke={SERIES_COLOR[key]}
            strokeWidth={key === "portfolio" ? 1.5 : 0.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
      <text
        className="perf-svg-text"
        x={padL}
        y={H - 8}
        textAnchor="start"
      >
        {labelFirst}
      </text>
      <text
        className="perf-svg-text"
        x={W - padR}
        y={H - 8}
        textAnchor="end"
      >
        {labelLast}
      </text>
    </svg>
  );
}

export default function PerformancePage() {
  const {
    trades,
    loading: tradesLoading,
    authLoading,
    isAuthenticated,
    create,
    update,
    remove,
  } = useRealizedTrades();
  const { snapshots, upsertSnapshot } = useTotalAssets();
  const { holdings, loading: portfolioLoading, userId } = usePortfolio();

  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState(SSR_SAFE_DATE);
  const [selectedMonth, setSelectedMonth] = useState(SSR_SAFE_MONTH);
  const [market, setMarket] = useState<"ALL" | Market>("ALL");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<PeriodKey>("1m");
  const [customRange, setCustomRange] = useState({
    from: SSR_SAFE_DATE,
    to: SSR_SAFE_DATE,
  });
  const [customDraft, setCustomDraft] = useState({
    from: SSR_SAFE_DATE,
    to: SSR_SAFE_DATE,
  });
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [indexSeries, setIndexSeries] = useState<IndexHistorySeriesMap>(
    createEmptyIndexHistorySeries,
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RealizedTrade | undefined>();
  const [selected, setSelected] = useState<RealizedTrade | undefined>();
  const [chartTab, setChartTab] = useState<"benchmark" | "nav">("benchmark");
  const [navSelectedDate, setNavSelectedDate] = useState(SSR_SAFE_DATE);
  const [navCalendarMap, setNavCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [sortCol, setSortCol] = useState<'returnPct' | 'pnlInt' | null>(null);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const benchmarkRequestSeqRef = useRef(0);
  const historyCache = useRef(new Map<string, IndexHistorySeriesMap>());
  const [historyStatus, setHistoryStatus] = useState("");

  useEffect(() => {
    const t = todayKstYmd();
    const ym = toYm(new Date());
    const monthRange = getMonthRangeFromYm(ym);
    setToday(t);
    setSelectedMonth(ym);
    setCustomRange({ from: monthRange.from, to: t });
    setCustomDraft({ from: monthRange.from, to: t });
    setFxRate(readStoredFx());
    setNavSelectedDate(t);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (authLoading || isAuthenticated) return;
    setFormOpen(false);
    setEditing(undefined);
    setSelected(undefined);
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    let mounted = true;

    const loadFx = async () => {
      try {
        const response = await fetch("/api/fx");
        if (!response.ok) throw new Error(`FX error: ${response.status}`);
        const data = (await response.json()) as Partial<FxApiResponse>;
        const next = Number(data.rate);
        if (!mounted || !Number.isFinite(next) || next <= 0) return;
        setFxRate(next);
        window.localStorage.setItem(FX_STORAGE_KEY, `${next}`);
      } catch {
        /* keep existing */
      }
    };

    void loadFx();
    return () => {
      mounted = false;
    };
  }, []);

  const periodRange = useMemo(
    () => computePeriodRange(period, today, customRange),
    [period, today, customRange],
  );

  // Presets share a single one-year download; switching ranges only recalculates the chart.
  const annualStart = computePeriodRange("1y", today, customRange).from;
  const withinAnnualRange = periodRange.from >= annualStart && periodRange.to <= today;
  const fetchStart = withinAnnualRange ? annualStart : periodRange.from;
  const fetchTo = withinAnnualRange ? today : periodRange.to;
  const benchmarkFetchFrom = useMemo(() => {
    if (!isValidDate(fetchStart)) return fetchStart;
    const base = new Date(`${fetchStart}T00:00:00`);
    base.setDate(base.getDate() - 14);
    return toYmd(base);
  }, [fetchStart]);

  useEffect(() => {
    if (!mounted || !isValidDate(benchmarkFetchFrom) || !isValidDate(fetchTo)) return;
    const seq = ++benchmarkRequestSeqRef.current;
    const key = `${benchmarkFetchFrom}:${fetchTo}`;
    const cached = historyCache.current.get(key);
    if (cached) { setIndexSeries(cached); setHistoryStatus(""); return; }
    const controller = new AbortController();
    setIndexSeries(createEmptyIndexHistorySeries());
    setHistoryStatus("지수 데이터 불러오는 중…");
    const load = async () => {
      try {
        const params = new URLSearchParams({ from: benchmarkFetchFrom, to: fetchTo });
        const response = await fetch(`/api/index-history?${params}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 400 ? "조회 기간은 최대 1년으로 설정해 주세요." : "지수 데이터를 불러오지 못했습니다. 새로고침해 주세요.");
        const data = (await response.json()) as IndexHistoryApiResponse;
        if (seq !== benchmarkRequestSeqRef.current || controller.signal.aborted) return;
        const next = createEmptyIndexHistorySeries();
        for (const key of Object.keys(next) as (keyof IndexHistorySeriesMap)[]) {
          next[key] = Array.isArray(data.series?.[key]) ? data.series[key]! : [];
        }
        const missing = Object.keys(next).filter((key) => next[key as keyof IndexHistorySeriesMap].length === 0);
        if (missing.length === 0) historyCache.current.set(key, next);
        setIndexSeries(next);
        setHistoryStatus(missing.length ? `${missing.map((key) => SERIES_LABEL[key as AssetTrendBenchmarkKey]).join(", ")} 데이터를 불러오지 못했습니다.` : "");
      } catch (error) {
        if (!controller.signal.aborted && seq === benchmarkRequestSeqRef.current) setHistoryStatus(error instanceof Error ? error.message : "지수 조회 실패");
      }
    };
    void load();
    return () => controller.abort();
  }, [mounted, benchmarkFetchFrom, fetchTo]);

  const benchmarkResult = useMemo(
    () =>
      buildAssetTrendBenchmarkData({
        snapshots,
        indexSeries,
        compareStartDate: isValidDate(periodRange.from) ? periodRange.from : today,
        compareEndDate: isValidDate(periodRange.to) ? periodRange.to : today,
      }),
    [snapshots, indexSeries, periodRange.from, periodRange.to, today],
  );

  const benchmarkData = benchmarkResult.data;
  const benchmarkSummary = benchmarkResult.summary;

  const monthRange = useMemo(
    () => (isValidDate(selectedMonth + "-01") ? getMonthRangeFromYm(selectedMonth) : { from: today, to: today }),
    [selectedMonth, today],
  );
  useEffect(() => {
    if (!mounted) return;
    const controller = new AbortController();
    setNavCalendarMap({});
    void (async () => {
      try {
        const response = await fetch(`/api/calendar-days?from=${monthRange.from}&to=${monthRange.to}&country=KR`, { signal: controller.signal });
        if (!response.ok) throw new Error("Calendar unavailable");
        const data = await response.json() as { days?: Array<CalendarDayInfo & { date: string }> };
        if (!controller.signal.aborted) setNavCalendarMap(Object.fromEntries((data.days ?? []).map(day => [day.date, day])));
      } catch { /* Weekday colors remain available without the holiday service. */ }
    })();
    return () => controller.abort();
  }, [mounted, monthRange.from, monthRange.to]);

  const selectedYear = useMemo(() => {
    const m = selectedMonth.match(/^(\d{4})-\d{2}$/);
    return m ? Number.parseInt(m[1], 10) : new Date().getFullYear();
  }, [selectedMonth]);

  const monthFilteredTrades = useMemo(
    () =>
      filterRealizedTrades(trades, {
        dateRange: monthRange,
        market,
      }),
    [trades, monthRange, market],
  );

  const tableTrades = useMemo(
    () =>
      filterRealizedTrades(monthFilteredTrades, {
        search,
      }),
    [monthFilteredTrades, search],
  );

  const sortedTableTrades = useMemo(
    () =>
      [...tableTrades].sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) return byDate;
        return b.createdAt.localeCompare(a.createdAt);
      }),
    [tableTrades],
  );

  const handleSort = (col: 'returnPct' | 'pnlInt') => {
    if (sortCol === col) {
      setSortDir(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const sortedTrades = useMemo(() => {
    if (!sortCol) return sortedTableTrades;
    return [...sortedTableTrades].sort((a, b) => {
      const diff = Number(a[sortCol]) - Number(b[sortCol]);
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [sortedTableTrades, sortCol, sortDir]);

  const summary = useMemo(
    () => summarizeRealizedTrades(monthFilteredTrades, { fxRate, includeUsd: true }),
    [monthFilteredTrades, fxRate],
  );

  const monthlyTotal = useMemo(
    () =>
      monthFilteredTrades.reduce(
        (sum, t) => sum + convertTradeAmountToKrw(t.pnlInt, t.market, fxRate),
        0,
      ),
    [monthFilteredTrades, fxRate],
  );

  const yearTrades = useMemo(
    () => filterRealizedTrades(trades, { market }),
    [trades, market],
  );

  const monthlyNet = useMemo(() => {
    const options = { fxRate, includeUsd: true };
    const kr = buildMonthlyNetSeriesByYear(yearTrades.filter((trade) => trade.market === "KR"), selectedYear, options);
    const us = buildMonthlyNetSeriesByYear(yearTrades.filter((trade) => trade.market === "US"), selectedYear, options);
    return kr.map((point, index) => ({
      month: point.month,
      krPnlInt: point.netPnlInt,
      usPnlInt: us[index].netPnlInt,
      netPnlInt: point.netPnlInt + us[index].netPnlInt,
    }));
  }, [yearTrades, selectedYear, fxRate]);

  const yearlyCumulative = useMemo(
    () => monthlyNet.reduce((sum, p) => sum + p.netPnlInt, 0),
    [monthlyNet],
  );

  const monthlyMaxAbs = useMemo(
    () =>
      monthlyNet.reduce((max, p) => Math.max(max, Math.abs(p.krPnlInt), Math.abs(p.usPnlInt)), 1),
    [monthlyNet],
  );

  const portfolioReturnPct = benchmarkSummary.portfolio.periodReturnPct;
  const kospiReturnPct = benchmarkSummary.kospi.periodReturnPct;

  const monthSnapshots = useMemo(
    () =>
      snapshots.filter(
        (s) => s.date >= monthRange.from && s.date <= monthRange.to,
      ),
    [snapshots, monthRange],
  );

  const handleEdit = (trade: RealizedTrade) => {
    setEditing(trade);
    setFormOpen(true);
    setSelected(undefined);
  };

  const handleDelete = (trade: RealizedTrade) => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }
    if (!window.confirm("해당 거래를 삭제할까요?")) return;
    remove(trade.id);
    setSelected(undefined);
  };

  const handleAdd = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }
    setEditing(undefined);
    setFormOpen(true);
  };

  const handlePeriodClick = (key: PeriodKey) => {
    setPeriod(key);
    if (key === "custom") {
      setCustomDraft(customRange);
    }
  };

  const handleApplyCustom = () => {
    if (!isValidDate(customDraft.from) || !isValidDate(customDraft.to)) return;
    if (customDraft.from > customDraft.to) return;
    setCustomRange(customDraft);
  };

  const monthOptions = useMemo(() => Array.from(new Set([...getMonthOptions(today, 12), ...monthlyNet.map((p) => p.month)])).sort().reverse(), [today, monthlyNet]);

  const fetchNavFxRate = useCallback(async () => {
    const fx = await fetchSnapshotFxRate();
    window.localStorage.setItem(FX_STORAGE_KEY, `${fx.rate}`);
    setFxRate(fx.rate);
    return fx;
  }, []);

  const refreshHoldingQuotes = useCallback(
    async (sourceHoldings: PortfolioHolding[]): Promise<PortfolioHolding[]> => {
      const usTargets = sourceHoldings.filter((h) => h.market === "US");
      if (usTargets.length === 0) return sourceHoldings;
      const updates: { id: string; price: number }[] = [];
      await Promise.all(
        usTargets.map(async (h) => {
          try {
            const res = await fetch(
              `/api/quote?market=US&ticker=${encodeURIComponent(h.ticker)}`,
              { cache: "no-store" },
            );
            if (!res.ok) return;
            const data = (await res.json()) as { priceInt?: number };
            const price = Number(data.priceInt);
            if (Number.isFinite(price) && price > 0) updates.push({ id: h.id, price });
          } catch {}
        }),
      );
      if (updates.length === 0) return sourceHoldings;
      const priceMap = new Map(updates.map((u) => [u.id, u.price]));
      return sourceHoldings.map((h) => {
        const p = priceMap.get(h.id);
        return p !== undefined ? { ...h, currentPrice: p } : h;
      });
    },
    [],
  );

  const recordSnapshot = useCallback(
    async (targetDate: string) => {
      if (!mounted || !isAuthenticated || !userId || portfolioLoading || targetDate === SSR_SAFE_DATE) return;
      setIsRecording(true);
      try {
        const updatedHoldings = await refreshHoldingQuotes(holdings);
        const { rate } = await fetchNavFxRate();
        const cash = await loadSnapshotCash(userId);
        const computed = calculatePortfolioTotalAsset({
          holdings: updatedHoldings,
          fxRate: rate,
          depositKrw: cash.depositKrw,
          depositUsdCents: cash.depositUsdCents,
          cashKrw: cash.cashKrw,
        });
        upsertSnapshot({ date: targetDate, totalAssetKrwInt: computed.totalAssetKrw, fxRate: rate });
      } catch (error) {
        window.alert(error instanceof Error ? error.message : "자산 기록에 실패했습니다.");
      } finally {
        setIsRecording(false);
      }
    },
    [mounted, isAuthenticated, userId, portfolioLoading, holdings, fetchNavFxRate, refreshHoldingQuotes, upsertSnapshot],
  );

  return (
    <div className="perf-page">
      {/* Page header */}
      <div className="perf-page-header">
        <div className="perf-heading"><h1 className="perf-page-title">Performance</h1><p>투자 성과와 실현손익을 한눈에</p></div>
        <div className="perf-header-filters"><span className="perf-filter-label">손익 · 거래 기준</span>
        <select
          aria-label="손익 조회 월"
          className="perf-select-sm"
          value={selectedMonth}
          onChange={(event) => setSelectedMonth(event.target.value)}
          disabled={!mounted}
        >
          {monthOptions.map((ym) => (
            <option key={ym} value={ym}>
              {formatMonthLabel(ym)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`perf-chip${market === "ALL" ? " is-active" : ""}`}
          onClick={() => setMarket("ALL")}
        >
          ALL
        </button>
        <button
          type="button"
          className={`perf-chip${market === "KR" ? " is-active" : ""}`}
          onClick={() => setMarket("KR")}
        >
          KR
        </button>
        <button
          type="button"
          className={`perf-chip${market === "US" ? " is-active" : ""}`}
          onClick={() => setMarket("US")}
        >
          US
        </button>
        </div>
        <button
          type="button"
          className="perf-btn-add"
          onClick={handleAdd}
          disabled={!isAuthenticated}
        >
          + 거래 추가
        </button>
      </div>

      {/* Summary cards */}
      <div className="perf-stats-row">
        <div className="perf-scard">
          <p className="perf-scard-label">월 실현손익</p>
          <p
            className={`perf-scard-val ${monthlyTotal > 0 ? "is-pos" : monthlyTotal < 0 ? "is-neg" : ""}`}
          >
            <MoneyText currency="KRW" amountInt={monthlyTotal} signed />
          </p><p className="perf-scard-sub">{formatMonthLabel(selectedMonth)} · {market}</p>
        </div>
        <div className="perf-scard">
          <p className="perf-scard-label">총 거래</p>
          <p className="perf-scard-val">
            {summary.totalCount}
            <span className="perf-scard-unit"> 건</span>
          </p>
          <p className="perf-scard-sub">
            수익 {summary.winCount}건 ·{" "}
            {summary.totalCount > 0 ? percentFormat(summary.winRate) : "—"}
          </p>
        </div>
        <div className="perf-scard">
          <p className="perf-scard-label">포트폴리오 수익률</p>
          <p
            className={`perf-scard-val ${
              portfolioReturnPct === null
                ? ""
                : portfolioReturnPct > 0
                  ? "is-pos"
                  : portfolioReturnPct < 0
                    ? "is-neg"
                    : ""
            }`}
          >
            {portfolioReturnPct === null
              ? "—"
              : `${portfolioReturnPct > 0 ? "+" : ""}${portfolioReturnPct.toFixed(2)}%`}
          </p>
          <p className="perf-scard-sub">
            KOSPI{" "}
            {kospiReturnPct === null
              ? "—"
              : `${kospiReturnPct > 0 ? "+" : ""}${kospiReturnPct.toFixed(2)}%`}{" "}
            · {PERIOD_LABELS[period]} 비교
          </p>
        </div>
        <div className="perf-scard">
          <p className="perf-scard-label">연 누적 실현손익</p>
          <p
            className={`perf-scard-val ${yearlyCumulative > 0 ? "is-pos" : yearlyCumulative < 0 ? "is-neg" : ""}`}
          >
            <MoneyText currency="KRW" amountInt={yearlyCumulative} signed />
          </p><p className="perf-scard-sub">{selectedYear}년 · {market} · 원화 환산</p>
        </div>
      </div>

      {!authLoading && !isAuthenticated ? (
        <div className="perf-auth-gate">로그인 후 데이터를 확인할 수 있습니다.</div>
      ) : null}

      {/* Main grid */}
      <div className="perf-main-grid">
        {/* LEFT: chart */}
        <div className="perf-col-chart">
          {/* Panel tab chips */}
          <div className="perf-main-tabs">
            <div className="perf-main-tabs-left">
              <button
                type="button"
                className={`perf-main-tab${chartTab === "benchmark" ? " is-active" : ""}`}
                onClick={() => setChartTab("benchmark")}
              >
                포트폴리오 vs 지수
              </button>
              <button
                type="button"
                className={`perf-main-tab${chartTab === "nav" ? " is-active" : ""}`}
                onClick={() => setChartTab("nav")}
              >
                일별 자산
              </button>
            </div>
            {chartTab === "nav" && (
              <button
                type="button"
                className="perf-nav-record-btn"
                onClick={() => void recordSnapshot(navSelectedDate)}
                disabled={!mounted || !isAuthenticated || isRecording || portfolioLoading || !isValidDate(navSelectedDate)}
              >
                {isRecording
                  ? "기록 중..."
                  : !isValidDate(navSelectedDate)
                  ? "날짜 선택"
                  : navSelectedDate === today
                  ? "오늘 기록"
                  : monthSnapshots.some((s) => s.date === navSelectedDate)
                  ? `${Number(navSelectedDate.slice(5, 7))}/${Number(navSelectedDate.slice(8, 10))} 수정`
                  : `${Number(navSelectedDate.slice(5, 7))}/${Number(navSelectedDate.slice(8, 10))} 기록`}
              </button>
            )}
          </div>

          {chartTab === "benchmark" ? (
            <>
              <div className="perf-chart-header">
                <span className="perf-chart-caption">전체 자산 기준 · {periodRange.from} — {periodRange.to}</span>
                <div className="perf-period-tabs">
                  {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className={`perf-period-tab${period === key ? " is-active" : ""}`}
                      onClick={() => handlePeriodClick(key)}
                    >
                      {PERIOD_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>

              {period === "custom" ? (
                <div className="perf-custom-range">
                  <input
                    type="date"
                    aria-label="비교 시작일"
                    className="perf-date-input"
                    value={customDraft.from === SSR_SAFE_DATE ? "" : customDraft.from}
                    onChange={(event) =>
                      setCustomDraft((prev) => ({ ...prev, from: event.target.value }))
                    }
                  />
                  <span className="perf-custom-dash">–</span>
                  <input
                    type="date"
                    aria-label="비교 종료일"
                    className="perf-date-input"
                    value={customDraft.to === SSR_SAFE_DATE ? "" : customDraft.to}
                    onChange={(event) =>
                      setCustomDraft((prev) => ({ ...prev, to: event.target.value }))
                    }
                  />
                  <button type="button" className="perf-apply-btn" onClick={handleApplyCustom}>
                    적용
                  </button>
                </div>
              ) : null}

              {historyStatus && <p className="perf-history-status" role="status">{historyStatus}</p>}
              <div className="perf-chart-svg-wrap">
                <BenchmarkLineChart
                  data={benchmarkData}
                  visible={{
                    portfolio: true,
                    kospi: true,
                    sp500: true,
                    kosdaq: true,
                    nasdaq: true,
                  }}
                />
              </div>

              <div className="perf-rate-strip">
                {SERIES_ORDER.map((key) => {
                  const period = benchmarkSummary[key].periodReturnPct;
                  const daily = benchmarkSummary[key].dailyReturnPct;
                  return (
                    <div className="perf-rate-item" key={key}>
                      <div className="perf-rate-topline">
                      <div className="perf-rate-name">
                        <span
                          className="perf-rate-dot"
                          style={{ background: SERIES_COLOR[key] }}
                        />
                        {SERIES_LABEL[key]}
                      </div>
                      <div className="perf-rate-today" aria-label={`${SERIES_LABEL[key]} 일간 등락률`}>
                        <span className={daily === null || daily === 0 ? "pf-chip-flat" : daily > 0 ? "pf-chip-pos" : "pf-chip-neg"}>
                          {daily === null ? "—" : `${daily > 0 ? "↑ " : daily < 0 ? "↓ " : ""}${Math.abs(daily).toFixed(2)}%`}
                        </span>
                      </div>
                      </div>
                      <div className="perf-rate-period">
                        {period === null
                          ? "—"
                          : `${period > 0 ? "+" : ""}${period.toFixed(2)}%`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="perf-nav-content">
              <TotalAssetCalendar
                month={selectedMonth}
                selectedDate={navSelectedDate}
                today={today}
                snapshots={snapshots}
                calendarMap={navCalendarMap}
                onSelectDate={setNavSelectedDate}
              />
            </div>
          )}
        </div>

        <section className="perf-monthly-panel" aria-label="월별 실현손익">
          <div className="perf-section-heading">
            <div><div className="perf-monthly-heading-line"><h2>월별 실현손익</h2>          <div className="perf-monthly-legend">
            {market !== "US" && <span><i style={{ background: "#4c78bb" }} />KR</span>}
            {market !== "KR" && <span><i style={{ background: "#37896f" }} />US</span>}
          </div>
</div></div>
            <div className="perf-monthly-total"><span>연 누적</span><strong className={yearlyCumulative > 0 ? "is-pos" : yearlyCumulative < 0 ? "is-neg" : ""}><MoneyText currency="KRW" amountInt={yearlyCumulative} signed /></strong></div>
          </div>
          <div className="perf-month-chart-layout">
            <div className="perf-month-axis" aria-label="실현손익 금액 축">
              {[1, 0.5, 0, -0.5, -1].map((ratio) => <span key={ratio} style={{ top: `${50 - ratio * 36}%` }}><CompactKrw amount={Math.round(monthlyMaxAbs * ratio)} /></span>)}
            </div>
          <div className="perf-monthly-scroll">
            <div className="perf-monthly-bars">
              {monthlyNet.map((p) => {
                const monthNum = Number.parseInt(p.month.slice(5, 7), 10);
                const isCurrent = p.month === selectedMonth;
                const amounts = [
                  { key: "KR", value: p.krPnlInt, color: "#4c78bb", negativeColor: "#829fc9" },
                  { key: "US", value: p.usPnlInt, color: "#37896f", negativeColor: "#78ac99" },
                ].filter((entry) => market === "ALL" || entry.key === market);
                const detail = `${monthNum}월 · KR ${moneyFormat("KRW", p.krPnlInt)} · US ${moneyFormat("KRW", p.usPnlInt)} · 합계 ${moneyFormat("KRW", p.netPnlInt)}`;
                return (
                  <button type="button" key={p.month} className={`perf-month-slot${isCurrent ? " is-selected" : ""}`} onClick={() => setSelectedMonth(p.month)} aria-pressed={isCurrent} aria-label={detail} aria-describedby={`monthly-detail-${p.month}`}>
                    <span className="perf-month-value"><CompactKrw amount={p.netPnlInt} /></span>
                    {amounts.map((entry, index) => {
                      const height = entry.value === 0 ? 0.6 : Math.max(0.6, Math.abs(entry.value) / monthlyMaxAbs * 36);
                      return <span key={entry.key} data-market={entry.key} data-pnl={entry.value} className="perf-month-bar perf-month-market-bar" style={{ height: `${height}%`, top: `${entry.value >= 0 ? 50 - height : 50}%`, left: amounts.length === 1 ? "50%" : index === 0 ? "35%" : "65%", background: entry.value === 0 ? "#e3e7ed" : entry.value > 0 ? entry.color : entry.negativeColor }} />;
                    })}
                    <span role="tooltip" id={`monthly-detail-${p.month}`} className={`perf-month-tooltip${monthNum <= 2 ? " is-first" : monthNum >= 11 ? " is-last" : ""}`}>
                      <strong>{monthNum}월 실현손익</strong>
                      {amounts.map((entry) => <span className="perf-month-tooltip-row" key={entry.key}><span><i style={{ background: entry.color }} />{entry.key}</span><b className={entry.value < 0 ? "is-loss" : undefined}>{moneyFormat("KRW", entry.value)}</b></span>)}
                      <span className="perf-month-tooltip-row perf-month-tooltip-total"><span>합계</span><b className={p.netPnlInt < 0 ? "is-loss" : undefined}>{moneyFormat("KRW", p.netPnlInt)}</b></span>
                    </span>
                    <span className="perf-month-label">{monthNum}월</span>
                  </button>
                );
              })}
            </div>
          </div>
          </div>
        </section>

        {/* RIGHT: table */}
        <div className="perf-col-table">
          <div className="perf-section-heading perf-trades-heading"><div><h2>거래 내역</h2><p>{formatMonthLabel(selectedMonth)} · {market} · {tableTrades.length}건</p></div>
            <input
              className="perf-search-sm"
              type="text"
              placeholder="종목 검색"
              aria-label="거래 종목 검색"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="perf-tbl-scroll" style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '32px minmax(60px, 1fr) 48px 190px', minWidth: '350px', padding: '6px 8px', borderBottom: '2px solid #e5e7eb', fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>
              <span>마켓</span>
              <span>종목</span>
              <button type="button" className="perf-sort-button" onClick={() => handleSort('returnPct')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px' }}>
                PnL%
                <span style={{ fontSize: '10px', color: sortCol === 'returnPct' ? '#1D4ED8' : '#9ca3af' }}>
                  {sortCol === 'returnPct' ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
                </span>
              </button>
              <button type="button" className="perf-sort-button" onClick={() => handleSort('pnlInt')} style={{ textAlign: 'right', cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '3px' }}>
                PnL
                <span style={{ fontSize: '10px', color: sortCol === 'pnlInt' ? '#1D4ED8' : '#9ca3af' }}>
                  {sortCol === 'pnlInt' ? (sortDir === 'desc' ? '▼' : '▲') : '⇅'}
                </span>
              </button>
            </div>
            {tradesLoading ? (
              <div className="perf-empty-row">로딩 중...</div>
            ) : sortedTrades.length === 0 ? (
              <div className="perf-empty-row"><strong>표시할 거래가 없습니다</strong><span>조회 월이나 마켓을 변경해 보세요.</span></div>
            ) : (
              sortedTrades.map((trade) => {
                const currency = resolveTradeCurrency(trade.market);
                return (
                  <div
                    key={trade.id}
                    className="perf-row-click"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(trade); } }}
                    onClick={() => setSelected(trade)}
                    style={{ display: 'grid', gridTemplateColumns: '32px minmax(60px, 1fr) 48px 190px', minWidth: '350px', padding: '6px 8px', borderBottom: '1px solid #f3f4f6', alignItems: 'center' }}
                  >
                    <span>
                      <span className={trade.market === "KR" ? "perf-mkt-kr" : "perf-mkt-us"}>
                        {trade.market}
                      </span>
                    </span>
                    <span style={{ fontSize: '13px', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {trade.ticker}
                    </span>
                    <span style={{ fontSize: '13px', textAlign: 'right', color: trade.returnPct > 0 ? '#16a34a' : trade.returnPct < 0 ? '#dc2626' : '#6b7280' }}>
                      {trade.returnPct > 0 ? '+' : ''}{Number(trade.returnPct).toFixed(1)}%
                    </span>
                    <span style={{ fontSize: '13px', textAlign: 'right', color: trade.pnlInt > 0 ? '#16a34a' : trade.pnlInt < 0 ? '#dc2626' : '#6b7280' }}>
                      {currency === 'KRW' ? (
                        <><span style={{ fontSize: '0.7em', opacity: 0.65 }}>{trade.pnlInt >= 0 ? '+₩' : '-₩'}</span>{Math.abs(trade.pnlInt).toLocaleString()}</>
                      ) : (
                        <><span style={{ fontSize: '0.7em', opacity: 0.65 }}>{trade.pnlInt >= 0 ? '+$' : '-$'}</span>{Math.abs(trade.pnlInt / 100).toFixed(2)}<span className="perf-trade-krw"> ({moneyFormat("KRW", convertTradeAmountToKrw(trade.pnlInt, trade.market, fxRate))})</span></>
                      )}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>


      </div>

      {/* Modals */}
      <RealizedTradeModal
        open={formOpen}
        mode={editing ? "edit" : "create"}
        trade={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => {
          if (!isAuthenticated) {
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

      <Modal
        open={Boolean(selected)}
        title={selected ? `${selected.date} ${selected.ticker}` : "상세"}
        onClose={() => setSelected(undefined)}
      >
        {selected ? (
          (() => {
            const currency = resolveTradeCurrency(selected.market);
            return (
              <>
                <div className="rtm-detail-grid">
                  <div className="rtm-detail-card">
                    <p className="rtm-detail-label">Market</p>
                    <p className="rtm-detail-val">{selected.market}</p>
                  </div>
                  <div className="rtm-detail-card">
                    <p className="rtm-detail-label">Qty</p>
                    <p className="rtm-detail-val">{selected.qty}</p>
                  </div>
                  <div className="rtm-detail-card">
                    <p className="rtm-detail-label">매수금액</p>
                    <p className="rtm-detail-val">{moneyFormat(currency, selected.buyAmountInt)}</p>
                  </div>
                  <div className="rtm-detail-card">
                    <p className="rtm-detail-label">매도금액</p>
                    <p className="rtm-detail-val">{moneyFormat(currency, selected.sellAmountInt)}</p>
                  </div>
                  <div className="rtm-detail-card">
                    <p className="rtm-detail-label">수익률</p>
                    <p className={`rtm-detail-val${selected.returnPct > 0 ? " is-pos" : selected.returnPct < 0 ? " is-neg" : ""}`}>
                      {percentFormat(selected.returnPct)}
                    </p>
                  </div>
                  <div className="rtm-detail-card">
                    <p className="rtm-detail-label">실현손익</p>
                    <p className={`rtm-detail-val${selected.pnlInt > 0 ? " is-pos" : selected.pnlInt < 0 ? " is-neg" : ""}`}>
                      {moneyFormat(currency, selected.pnlInt)}
                    </p>
                  </div>
                </div>
                <div className="rtm-detail-actions">
                  <button
                    type="button"
                    className="rtm-btn-edit"
                    onClick={() => handleEdit(selected)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="rtm-btn-delete"
                    onClick={() => handleDelete(selected)}
                  >
                    삭제
                  </button>
                </div>
              </>
            );
          })()
        ) : null}
      </Modal>
    </div>
  );
}

function readStoredFx(): number {
  if (typeof window === "undefined") return DEFAULT_FX_RATE;
  const raw = window.localStorage.getItem(FX_STORAGE_KEY);
  if (!raw) return DEFAULT_FX_RATE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_FX_RATE;
}
