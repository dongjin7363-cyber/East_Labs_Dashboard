"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { RealizedTradeModal } from "@/components/RealizedTradeModal";
import {
  AssetTrendBenchmarkKey,
  AssetTrendBenchmarkPoint,
  buildAssetTrendBenchmarkData,
  createEmptyIndexHistorySeries,
  IndexHistorySeriesMap,
} from "@/lib/asset-trend/benchmark";
import { useRealizedTrades } from "@/lib/hooks/useRealizedTrades";
import { useTotalAssets } from "@/lib/hooks/useTotalAssets";
import { Market, RealizedTrade, TotalAssetSnapshot } from "@/lib/models/types";
import {
  buildDailyNetSeries,
  buildMonthlyNetSeriesByYear,
  convertTradeAmountToKrw,
  filterRealizedTrades,
  resolveTradeCurrency,
  summarizeRealizedTrades,
} from "@/lib/services/realizedTradeService";
import {
  getDatesInMonthFromYm,
  getMonthRangeFromYm,
  todayKstYmd,
  toYm,
  toYmd,
} from "@/lib/utils/date";
import { moneyFormat, moneyFormatParts, percentFormat } from "@/lib/utils/money";
import { Currency } from "@/lib/models/types";

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
  portfolio: "#111827",
  kospi: "#EF4444",
  sp500: "#10B981",
  kosdaq: "#3B82F6",
};

const SERIES_LABEL: Record<AssetTrendBenchmarkKey, string> = {
  portfolio: "Portfolio",
  kospi: "KOSPI",
  sp500: "S&P 500",
  kosdaq: "KOSDAQ",
};

const SERIES_ORDER: AssetTrendBenchmarkKey[] = [
  "portfolio",
  "kospi",
  "sp500",
  "kosdaq",
];

interface IndexHistoryApiResponse {
  series?: Partial<IndexHistorySeriesMap>;
  errors?: string[];
}

interface FxApiResponse {
  rate: number;
  asOf: string;
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

function formatCompactKrw(amount: number): string {
  if (!Number.isFinite(amount) || amount === 0) {
    return "₩0";
  }

  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 100_000_000) {
    return `${sign}₩${(abs / 100_000_000).toFixed(1)}억`;
  }

  if (abs >= 10_000_000) {
    return `${sign}₩${(abs / 1_000_000).toFixed(1)}M`;
  }

  if (abs >= 1_000) {
    return `${sign}₩${(abs / 1_000_000).toFixed(2)}M`;
  }

  return `${sign}₩${abs}`;
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

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

function navColor(
  value: number,
  min: number,
  max: number,
  mid: number,
): string {
  if (max === min) return "#FDE68A";
  const isUp = value >= mid;
  const range = isUp ? max - mid : mid - min;
  const t = range === 0 ? 0 : (isUp ? value - mid : mid - value) / range;
  const clamped = Math.max(0, Math.min(1, t));

  const red: [number, number, number] = [252, 165, 165];
  const yellow: [number, number, number] = [253, 230, 138];
  const green: [number, number, number] = [5, 150, 105];

  const rgb = isUp
    ? lerpColor(yellow, green, clamped)
    : lerpColor(yellow, red, clamped);

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
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
  const H = 220;
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
            strokeWidth={key === "portfolio" ? 2.5 : 1.8}
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

interface DailyBarsProps {
  points: Array<{ date: string; value: number | null }>;
}

function DailyBarsChart({ points }: DailyBarsProps) {
  const W = 340;
  const H = 82;
  const padL = 2;
  const padR = 2;
  const axisY = 50;

  const validValues = points
    .map((p) => p.value)
    .filter((v): v is number => typeof v === "number");

  if (validValues.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        className="perf-daily-svg"
      >
        <line x1={padL} y1={axisY} x2={W - padR} y2={axisY} stroke="rgba(0,0,0,0.15)" strokeWidth={0.8} />
        <text className="perf-svg-text" x={W / 2} y={H / 2} textAnchor="middle">
          데이터 없음
        </text>
      </svg>
    );
  }

  const posMax = Math.max(0, ...validValues);
  const negMin = Math.min(0, ...validValues);
  const maxAbs = Math.max(Math.abs(posMax), Math.abs(negMin), 1);

  const posPx = axisY - 6;
  const negPx = H - axisY - 6;

  const n = points.length;
  const chartW = W - padL - padR;
  const slot = n > 0 ? chartW / n : chartW;
  const barW = Math.max(2, Math.min(10, slot * 0.7));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      preserveAspectRatio="xMidYMid meet"
      className="perf-daily-svg"
    >
      <line
        x1={padL}
        y1={axisY}
        x2={W - padR}
        y2={axisY}
        stroke="rgba(0,0,0,0.18)"
        strokeWidth={0.8}
      />
      {points.map((p, i) => {
        const v = p.value;
        if (typeof v !== "number" || v === 0) return null;
        const x = padL + i * slot + slot / 2 - barW / 2;
        if (v > 0) {
          const h = (v / maxAbs) * posPx;
          return (
            <rect
              key={p.date}
              x={x}
              y={axisY - h}
              width={barW}
              height={h}
              fill="#059669"
              rx={1}
            >
              <title>{`${p.date.slice(5)} ${moneyFormat("KRW", v)}`}</title>
            </rect>
          );
        }
        const h = (Math.abs(v) / maxAbs) * negPx;
        return (
          <rect
            key={p.date}
            x={x}
            y={axisY}
            width={barW}
            height={h}
            fill="#DC2626"
            rx={1}
          >
            <title>{`${p.date.slice(5)} ${moneyFormat("KRW", v)}`}</title>
          </rect>
        );
      })}
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
  const { snapshots } = useTotalAssets();

  const [mounted, setMounted] = useState(false);
  const [today, setToday] = useState(SSR_SAFE_DATE);
  const [selectedMonth, setSelectedMonth] = useState(SSR_SAFE_MONTH);
  const [market, setMarket] = useState<"ALL" | Market>("ALL");
  const [tableMarket, setTableMarket] = useState<"ALL" | Market>("ALL");
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
  const benchmarkRequestSeqRef = useRef(0);

  useEffect(() => {
    const t = todayKstYmd();
    const ym = toYm(new Date());
    const monthRange = getMonthRangeFromYm(ym);
    setToday(t);
    setSelectedMonth(ym);
    setCustomRange({ from: monthRange.from, to: t });
    setCustomDraft({ from: monthRange.from, to: t });
    setFxRate(readStoredFx());
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

  const benchmarkFetchFrom = useMemo(() => {
    if (!isValidDate(periodRange.from)) return periodRange.from;
    const base = new Date(`${periodRange.from}T00:00:00`);
    base.setDate(base.getDate() - 14);
    return toYmd(base);
  }, [periodRange.from]);

  useEffect(() => {
    if (!mounted) return;
    if (
      !isValidDate(periodRange.from) ||
      !isValidDate(periodRange.to) ||
      periodRange.from > periodRange.to
    ) {
      return;
    }

    const seq = ++benchmarkRequestSeqRef.current;

    const load = async () => {
      try {
        const params = new URLSearchParams({
          from: benchmarkFetchFrom,
          to: periodRange.to,
          _ts: `${Date.now()}`,
        });
        const response = await fetch(`/api/index-history?${params.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`index-history ${response.status}`);
        const data = (await response.json()) as IndexHistoryApiResponse;
        if (seq !== benchmarkRequestSeqRef.current) return;
        const next: IndexHistorySeriesMap = {
          kospi: Array.isArray(data.series?.kospi) ? data.series.kospi : [],
          kosdaq: Array.isArray(data.series?.kosdaq) ? data.series.kosdaq : [],
          sp500: Array.isArray(data.series?.sp500) ? data.series.sp500 : [],
        };
        setIndexSeries((prev) => ({
          kospi: next.kospi.length > 0 ? next.kospi : prev.kospi,
          kosdaq: next.kosdaq.length > 0 ? next.kosdaq : prev.kosdaq,
          sp500: next.sp500.length > 0 ? next.sp500 : prev.sp500,
        }));
      } catch {
        /* leave previous series in place */
      }
    };

    void load();
  }, [mounted, benchmarkFetchFrom, periodRange.from, periodRange.to]);

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
        market: tableMarket,
        search,
      }),
    [monthFilteredTrades, tableMarket, search],
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

  const dailyNet = useMemo(
    () =>
      buildDailyNetSeries(monthFilteredTrades, {
        fxRate,
        includeUsd: true,
      }),
    [monthFilteredTrades, fxRate],
  );

  const monthlyNet = useMemo(
    () =>
      buildMonthlyNetSeriesByYear(yearTrades, selectedYear, {
        fxRate,
        includeUsd: true,
      }),
    [yearTrades, selectedYear, fxRate],
  );

  const yearlyCumulative = useMemo(
    () => monthlyNet.reduce((sum, p) => sum + p.netPnlInt, 0),
    [monthlyNet],
  );

  const monthlyMaxAbs = useMemo(
    () =>
      monthlyNet.reduce((max, p) => Math.max(max, Math.abs(p.netPnlInt)), 1),
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

  const monthOptions = useMemo(() => getMonthOptions(today, 12), [today]);

  return (
    <div className="perf-page">
      {/* Page header */}
      <div className="perf-page-header">
        <h1 className="perf-page-title">Performance</h1>
        <select
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
          <p className="perf-scard-label">월 순수익</p>
          <p
            className={`perf-scard-val ${monthlyTotal > 0 ? "is-pos" : monthlyTotal < 0 ? "is-neg" : ""}`}
          >
            <MoneyText currency="KRW" amountInt={monthlyTotal} signed />
          </p>
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
            대비
          </p>
        </div>
        <div className="perf-scard">
          <p className="perf-scard-label">연 누적 순수익</p>
          <p
            className={`perf-scard-val ${yearlyCumulative > 0 ? "is-pos" : yearlyCumulative < 0 ? "is-neg" : ""}`}
          >
            <MoneyText currency="KRW" amountInt={yearlyCumulative} signed />
          </p>
        </div>
      </div>

      {!authLoading && !isAuthenticated ? (
        <div className="perf-auth-gate">로그인 후 데이터를 확인할 수 있습니다.</div>
      ) : null}

      {/* Main grid */}
      <div className="perf-main-grid">
        {/* LEFT: chart */}
        <div className="perf-col-chart">
          <div className="perf-chart-header">
            <span className="perf-chart-title">포트폴리오 vs 지수</span>
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
                className="perf-date-input"
                value={customDraft.from === SSR_SAFE_DATE ? "" : customDraft.from}
                onChange={(event) =>
                  setCustomDraft((prev) => ({ ...prev, from: event.target.value }))
                }
              />
              <span className="perf-custom-dash">–</span>
              <input
                type="date"
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

          <div className="perf-chart-legend">
            {SERIES_ORDER.map((key) => (
              <div className="perf-cl-item" key={key}>
                <span
                  className="perf-cl-line"
                  style={{
                    background: SERIES_COLOR[key],
                    height: key === "portfolio" ? 2.5 : 2,
                  }}
                />
                {SERIES_LABEL[key]}
              </div>
            ))}
          </div>

          <div className="perf-chart-svg-wrap">
            <BenchmarkLineChart
              data={benchmarkData}
              visible={{
                portfolio: true,
                kospi: true,
                sp500: true,
                kosdaq: true,
              }}
            />
          </div>

          {/* Rate strip */}
          <div className="perf-rate-strip">
            {SERIES_ORDER.map((key) => {
              const period = benchmarkSummary[key].periodReturnPct;
              const daily = benchmarkSummary[key].dailyReturnPct;
              return (
                <div className="perf-rate-item" key={key}>
                  <div className="perf-rate-name">
                    <span
                      className="perf-rate-dot"
                      style={{ background: SERIES_COLOR[key] }}
                    />
                    {SERIES_LABEL[key]}
                  </div>
                  <div
                    className={`perf-rate-today ${
                      daily === null ? "" : daily > 0 ? "is-pos" : daily < 0 ? "is-neg" : ""
                    }`}
                  >
                    {daily === null
                      ? "—"
                      : `${daily > 0 ? "+" : ""}${daily.toFixed(2)}%`}
                  </div>
                  <div className="perf-rate-period">
                    기간{" "}
                    {period === null
                      ? "—"
                      : `${period > 0 ? "+" : ""}${period.toFixed(2)}%`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: table */}
        <div className="perf-col-table">
          <div className="perf-tbl-head">
            <button
              type="button"
              className={`perf-tbl-chip${tableMarket === "ALL" ? " is-active" : ""}`}
              onClick={() => setTableMarket("ALL")}
            >
              ALL
            </button>
            <button
              type="button"
              className={`perf-tbl-chip${tableMarket === "KR" ? " is-active" : ""}`}
              onClick={() => setTableMarket("KR")}
            >
              KR
            </button>
            <button
              type="button"
              className={`perf-tbl-chip${tableMarket === "US" ? " is-active" : ""}`}
              onClick={() => setTableMarket("US")}
            >
              US
            </button>
            <input
              className="perf-search-sm"
              type="text"
              placeholder="Ticker 검색..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="perf-tbl-scroll">
            <table className="perf-table">
              <thead>
                <tr>
                  <th style={{ textAlign: "left", width: "13%" }}>날짜</th>
                  <th style={{ textAlign: "left", width: "37%" }}>종목</th>
                  <th style={{ width: "17%" }}>수익률</th>
                  <th style={{ width: "33%" }}>PnL</th>
                </tr>
              </thead>
              <tbody>
                {tradesLoading ? (
                  <tr>
                    <td colSpan={4} className="perf-empty-row">
                      로딩 중...
                    </td>
                  </tr>
                ) : sortedTableTrades.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="perf-empty-row">
                      거래 내역이 없습니다.
                    </td>
                  </tr>
                ) : (
                  sortedTableTrades.map((trade) => {
                    const currency = resolveTradeCurrency(trade.market);
                    return (
                      <tr
                        key={trade.id}
                        className="perf-row-click"
                        onClick={() => setSelected(trade)}
                      >
                        <td>{trade.date.slice(5)}</td>
                        <td className="perf-td-ticker">
                          <span className={trade.market === "KR" ? "perf-mkt-kr" : "perf-mkt-us"}>
                            {trade.market}
                          </span>
                          {" "}{trade.ticker}
                        </td>
                        <td
                          className={
                            trade.returnPct > 0
                              ? "perf-ret-pos"
                              : trade.returnPct < 0
                                ? "perf-ret-neg"
                                : ""
                          }
                        >
                          {percentFormat(trade.returnPct)}
                        </td>
                        <td
                          className={
                            trade.pnlInt > 0
                              ? "perf-pnl-pos"
                              : trade.pnlInt < 0
                                ? "perf-pnl-neg"
                                : ""
                          }
                        >
                          <MoneyText currency={currency} amountInt={trade.pnlInt} signed />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="perf-bottom-strip">
        {/* Monthly bars */}
        <div className="perf-bs-col">
          <p className="perf-bs-title">월별 순수익</p>
          <p className="perf-bs-sub">
            연 누적{" "}
            <span
              className={`perf-bs-amount ${
                yearlyCumulative > 0 ? "is-pos" : yearlyCumulative < 0 ? "is-neg" : ""
              }`}
            >
              {formatCompactKrw(yearlyCumulative)}
            </span>
          </p>
          <div className="perf-bars">
            {monthlyNet.map((p) => {
              const height = `${(Math.abs(p.netPnlInt) / monthlyMaxAbs) * 100}%`;
              const isCurrent = p.month === selectedMonth;
              const color =
                p.netPnlInt === 0
                  ? "var(--east-surface-2)"
                  : isCurrent
                    ? "var(--east-cobalt)"
                    : p.netPnlInt > 0
                      ? "var(--east-pos)"
                      : "var(--east-neg)";
              const monthNum = Number.parseInt(p.month.slice(5, 7), 10);
              return (
                <div className="perf-bar-wrap" key={p.month}>
                  <div
                    className="perf-bar"
                    style={{ height, background: color }}
                    title={`${monthNum}월: ${moneyFormat("KRW", p.netPnlInt)}`}
                  />
                  <div
                    className="perf-bar-lbl"
                    style={isCurrent ? { color: "var(--east-cobalt)", fontWeight: 500 } : undefined}
                  >
                    {monthNum}월
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily bars */}
        <div className="perf-bs-col">
          <p className="perf-bs-title">일별 순수익</p>
          <p className="perf-bs-sub">
            {Number.parseInt(selectedMonth.slice(5, 7), 10)}월 · 누적{" "}
            <span
              className={`perf-bs-amount ${
                monthlyTotal > 0 ? "is-pos" : monthlyTotal < 0 ? "is-neg" : ""
              }`}
            >
              {formatCompactKrw(monthlyTotal)}
            </span>
          </p>
          <DailyBarsChart
            points={dailyNet.map((d) => ({ date: d.date, value: d.netPnlInt }))}
          />
        </div>

        {/* NAV heatmap */}
        <div className="perf-bs-col perf-bs-col-last">
          <p className="perf-bs-title">일별 NAV 히트맵</p>
          <p className="perf-bs-sub">
            {Number.parseInt(selectedMonth.slice(5, 7), 10)}월 · 색이 진할수록 높은 NAV
          </p>
          <NavHeatmap month={selectedMonth} today={today} snapshots={monthSnapshots} />
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

interface NavHeatmapProps {
  month: string;
  today: string;
  snapshots: TotalAssetSnapshot[];
}

function NavHeatmap({ month, today, snapshots }: NavHeatmapProps) {
  const dates = useMemo(
    () => (isValidDate(month + "-01") ? getDatesInMonthFromYm(month) : []),
    [month],
  );
  const snapshotMap = useMemo(
    () => new Map(snapshots.map((s) => [s.date, s.totalAssetKrwInt])),
    [snapshots],
  );

  if (dates.length === 0) {
    return <div className="perf-heatmap-empty">데이터 없음</div>;
  }

  const values = dates
    .map((d) => snapshotMap.get(d))
    .filter((v): v is number => typeof v === "number");

  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const mid = values.length > 0 ? (min + max) / 2 : 0;

  const firstDate = dates[0];
  const firstDow = new Date(`${firstDate}T00:00:00Z`).getUTCDay();

  return (
    <div className="perf-heatmap">
      {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
        <div className="perf-hm-dow" key={d}>
          {d}
        </div>
      ))}
      {Array.from({ length: firstDow }).map((_, i) => (
        <div className="perf-hm-cell empty" key={`b-${i}`} />
      ))}
      {dates.map((date) => {
        const value = snapshotMap.get(date);
        const dayNum = Number.parseInt(date.slice(8, 10), 10);
        const isToday = date === today;
        let bg = "var(--east-surface-2)";
        if (typeof value === "number") {
          bg = navColor(value, min, max, mid);
        }
        return (
          <div
            key={date}
            className={`perf-hm-cell${isToday ? " is-today" : ""}`}
            style={{ background: bg }}
            title={
              typeof value === "number"
                ? `${dayNum}: ${moneyFormat("KRW", value)}`
                : `${dayNum}`
            }
          />
        );
      })}
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
