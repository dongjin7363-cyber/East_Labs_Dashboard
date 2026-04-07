"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChartSectionCard } from "@/components/common/ChartSectionCard";
import { AssetTrendBenchmarkChart } from "@/components/asset-trend/AssetTrendBenchmarkChart";
import { PageHeader } from "@/components/PageHeader";
import { TotalAssetCalendar } from "@/components/TotalAssetCalendar";
import { TotalAssetTrendChart } from "@/components/TotalAssetTrendChart";
import {
  AssetTrendBenchmarkKey,
  buildAssetTrendBenchmarkData,
  createEmptyIndexHistorySeries,
  IndexHistorySeriesMap,
} from "@/lib/asset-trend/benchmark";
import { useTotalAssets } from "@/lib/hooks/useTotalAssets";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { PortfolioHolding } from "@/lib/models/types";
import {
  calculatePortfolioTotalAsset,
  HoldingQuoteUpdate,
} from "@/lib/services/portfolioService";
import {
  buildTotalAssetTrendByMonth,
  DEFAULT_USDKRW_FX_RATE,
  PORTFOLIO_FX_STORAGE_KEY,
  readPortfolioCashSettings,
  readStoredFxRate,
} from "@/lib/services/totalAssetService";
import { currentKstHour, getMonthRangeFromYm, todayKstYmd, toYm, toYmd } from "@/lib/utils/date";
import { moneyFormat } from "@/lib/utils/money";

interface QuoteApiResponse {
  ticker: string;
  market: "US" | "KR";
  currency: "USD" | "KRW";
  priceInt: number;
  asOf: string;
}

interface FxApiResponse {
  rate: number;
  asOf: string;
}

interface IndexHistoryApiResponse {
  series?: Partial<IndexHistorySeriesMap>;
  errors?: string[];
}

interface CalendarDayMeta {
  date: string;
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface CalendarDaysApiResponse {
  days?: CalendarDayMeta[];
}

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

function isValidBenchmarkDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && value !== SSR_SAFE_DATE;
}

function filterBenchmarkErrors(
  errors: string[],
  nextSeries: IndexHistorySeriesMap,
): string[] {
  return errors.filter((label) => {
    if (label === "KOSPI") {
      return nextSeries.kospi.length === 0;
    }

    if (label === "KOSDAQ") {
      return nextSeries.kosdaq.length === 0;
    }

    if (label === "S&P") {
      return nextSeries.sp500.length === 0;
    }

    return true;
  });
}

function hasAnyBenchmarkSeriesData(series: IndexHistorySeriesMap): boolean {
  return series.kospi.length > 0 || series.kosdaq.length > 0 || series.sp500.length > 0;
}

function getBenchmarkSeriesCounts(series: IndexHistorySeriesMap) {
  return {
    kospi: series.kospi.length,
    kosdaq: series.kosdaq.length,
    sp500: series.sp500.length,
  };
}

function mergeBenchmarkSeries(
  previous: IndexHistorySeriesMap,
  next: IndexHistorySeriesMap,
): IndexHistorySeriesMap {
  return {
    kospi: next.kospi.length > 0 ? next.kospi : previous.kospi,
    kosdaq: next.kosdaq.length > 0 ? next.kosdaq : previous.kosdaq,
    sp500: next.sp500.length > 0 ? next.sp500 : previous.sp500,
  };
}

const QUOTE_MAX_CONCURRENCY = 3;
const SSR_SAFE_MONTH = "1970-01";
const SSR_SAFE_DATE = "1970-01-01";
const BENCHMARK_FETCH_RETRY_DELAY_MS = 400;
const DEFAULT_BENCHMARK_VISIBILITY: Record<AssetTrendBenchmarkKey, boolean> = {
  portfolio: true,
  kospi: true,
  kosdaq: true,
  sp500: true,
};

export function TotalAssetClient() {
  const searchParams = useSearchParams();
  const {
    holdings,
    loading: portfolioLoading,
    updateQuotes,
    authLoading,
    isCloudMode,
  } = usePortfolio();
  const {
    snapshots,
    loading: snapshotLoading,
    getSnapshotByDate,
    upsertSnapshot,
    saveMemo,
    removeSnapshot,
  } = useTotalAssets();
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(SSR_SAFE_MONTH);
  const [selectedDate, setSelectedDate] = useState(SSR_SAFE_DATE);
  const [todayKst, setTodayKst] = useState(SSR_SAFE_DATE);
  const [compareStartDate, setCompareStartDate] = useState(SSR_SAFE_DATE);
  const [compareEndDate, setCompareEndDate] = useState(SSR_SAFE_DATE);
  const [nowKstHour, setNowKstHour] = useState(0);
  const [memoInput, setMemoInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [fxRate, setFxRate] = useState(DEFAULT_USDKRW_FX_RATE);
  const [fxAsOf, setFxAsOf] = useState("");
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const [indexSeries, setIndexSeries] = useState<IndexHistorySeriesMap>(
    createEmptyIndexHistorySeries,
  );
  const [benchmarkError, setBenchmarkError] = useState("");
  const [visibleBenchmarks, setVisibleBenchmarks] = useState(
    DEFAULT_BENCHMARK_VISIBILITY,
  );
  const calendarMonthCacheRef = useRef<Record<string, Record<string, CalendarDayInfo>>>({});
  const benchmarkRequestSeqRef = useRef(0);
  const indexSeriesRef = useRef<IndexHistorySeriesMap>(createEmptyIndexHistorySeries());
  const loading = portfolioLoading || snapshotLoading || authLoading;
  const monthRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);
  const compareDefaultEndDate = useMemo(
    () => (selectedMonth === todayKst.slice(0, 7) ? todayKst : monthRange.to),
    [monthRange.to, selectedMonth, todayKst],
  );
  const compareResetLabel = selectedMonth === todayKst.slice(0, 7) ? "이번 달" : "월 기본값";
  const benchmarkFetchFrom = useMemo(() => {
    const baseDate = new Date(`${compareStartDate}T00:00:00`);
    baseDate.setDate(baseDate.getDate() - 14);

    return toYmd(baseDate);
  }, [compareStartDate]);

  useEffect(() => {
    const initialMonth = toYm(new Date());
    const initialToday = todayKstYmd();

    setSelectedMonth(initialMonth);
    setSelectedDate(initialToday);
    setTodayKst(initialToday);
    setNowKstHour(currentKstHour());
    setFxRate(readStoredFxRate());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const range = getMonthRangeFromYm(selectedMonth);

    if (selectedDate < range.from || selectedDate > range.to) {
      setSelectedDate(range.from);
    }
  }, [mounted, selectedDate, selectedMonth]);

  useEffect(() => {
    indexSeriesRef.current = indexSeries;
  }, [indexSeries]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    setCompareStartDate(monthRange.from);
    setCompareEndDate(compareDefaultEndDate);
  }, [compareDefaultEndDate, monthRange.from, mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    let cancelled = false;
    const cachedMap = calendarMonthCacheRef.current[selectedMonth];

    if (cachedMap) {
      setCalendarMap(cachedMap);

      return () => {
        cancelled = true;
      };
    }

    setCalendarMap({});

    const monthRange = getMonthRangeFromYm(selectedMonth);

    const loadCalendarDays = async () => {
      try {
        const response = await fetch(
          `/api/calendar-days?from=${monthRange.from}&to=${monthRange.to}&country=KR`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(`calendar-days API error: ${response.status}`);
        }

        const data = (await response.json()) as CalendarDaysApiResponse;
        const days = Array.isArray(data.days) ? data.days : [];
        const nextMap: Record<string, CalendarDayInfo> = {};

        days.forEach((day) => {
          nextMap[day.date] = {
            dow: day.dow,
            isHoliday: day.isHoliday,
            holidayName: day.holidayName,
          };
        });

        if (!cancelled) {
          calendarMonthCacheRef.current[selectedMonth] = nextMap;
          setCalendarMap(nextMap);
        }
      } catch {
        const fallback = calendarMonthCacheRef.current[selectedMonth];

        if (!cancelled && fallback) {
          setCalendarMap(fallback);
        }
      }
    };

    void loadCalendarDays();

    return () => {
      cancelled = true;
    };
  }, [mounted, selectedMonth]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    if (
      !isValidBenchmarkDate(compareStartDate) ||
      !isValidBenchmarkDate(compareEndDate) ||
      !isValidBenchmarkDate(benchmarkFetchFrom) ||
      compareStartDate > compareEndDate
    ) {
      setBenchmarkError("");
    }
  }, [benchmarkFetchFrom, compareEndDate, compareStartDate, mounted]);

  const loadBenchmarkIndices = useCallback(async () => {
    if (!mounted) {
      return;
    }

    if (
      !isValidBenchmarkDate(compareStartDate) ||
      !isValidBenchmarkDate(compareEndDate) ||
      !isValidBenchmarkDate(benchmarkFetchFrom) ||
      compareStartDate > compareEndDate
    ) {
      return;
    }

    const requestSeq = ++benchmarkRequestSeqRef.current;
    setBenchmarkError("");

    const fetchOnce = async (): Promise<{
      nextSeries: IndexHistorySeriesMap;
      errors: string[];
    }> => {
      const params = new URLSearchParams({
        from: benchmarkFetchFrom,
        to: compareEndDate,
        _ts: `${Date.now()}`,
      });
      const response = await fetch(`/api/index-history?${params.toString()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`index-history API error: ${response.status}`);
      }

      const data = (await response.json()) as IndexHistoryApiResponse;
      const nextSeries: IndexHistorySeriesMap = {
        kospi: Array.isArray(data.series?.kospi) ? data.series.kospi : [],
        kosdaq: Array.isArray(data.series?.kosdaq) ? data.series.kosdaq : [],
        sp500: Array.isArray(data.series?.sp500) ? data.series.sp500 : [],
      };

      return {
        nextSeries,
        errors: filterBenchmarkErrors(
          Array.isArray(data.errors) ? data.errors : [],
          nextSeries,
        ),
      };
    };

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { nextSeries, errors } = await fetchOnce();

        if (requestSeq !== benchmarkRequestSeqRef.current) {
          return;
        }

        const hasAnyData = hasAnyBenchmarkSeriesData(nextSeries);

        if (!hasAnyData && attempt === 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, BENCHMARK_FETCH_RETRY_DELAY_MS);
          });
          continue;
        }

        const mergedSeries = mergeBenchmarkSeries(indexSeriesRef.current, nextSeries);

        setIndexSeries((previous) => ({
          kospi: nextSeries.kospi.length > 0 ? nextSeries.kospi : previous.kospi,
          kosdaq: nextSeries.kosdaq.length > 0 ? nextSeries.kosdaq : previous.kosdaq,
          sp500: nextSeries.sp500.length > 0 ? nextSeries.sp500 : previous.sp500,
        }));
        indexSeriesRef.current = mergedSeries;
        setBenchmarkError(
          errors.length > 0
            ? `비교 지수 데이터를 일부 불러오지 못했습니다: ${errors.join(", ")}`
            : hasAnyBenchmarkSeriesData(mergedSeries)
              ? ""
              : "비교 지수 데이터를 불러오지 못했습니다.",
        );
        console.debug("[asset-trend benchmark]", {
          compareStartDate,
          compareEndDate,
          benchmarkFetchFrom,
          nextSeriesCounts: getBenchmarkSeriesCounts(nextSeries),
          finalIndexSeriesCounts: getBenchmarkSeriesCounts(mergedSeries),
          benchmarkFetchStatus: hasAnyBenchmarkSeriesData(mergedSeries) ? "ready" : "error",
        });
        return;
      } catch {
        if (requestSeq !== benchmarkRequestSeqRef.current) {
          return;
        }

        if (attempt === 0) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, BENCHMARK_FETCH_RETRY_DELAY_MS);
          });
          continue;
        }

        setBenchmarkError("비교 지수 데이터를 불러오지 못했습니다.");
        console.debug("[asset-trend benchmark]", {
          compareStartDate,
          compareEndDate,
          benchmarkFetchFrom,
          nextSeriesCounts: getBenchmarkSeriesCounts(createEmptyIndexHistorySeries()),
          finalIndexSeriesCounts: getBenchmarkSeriesCounts(indexSeriesRef.current),
          benchmarkFetchStatus: "error",
        });
      }
    }
  }, [benchmarkFetchFrom, compareEndDate, compareStartDate, mounted]);

  useEffect(() => {
    void loadBenchmarkIndices();
  }, [loadBenchmarkIndices]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const handleWindowFocus = () => {
      void loadBenchmarkIndices();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadBenchmarkIndices();
      }
    };

    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loadBenchmarkIndices, mounted]);

  useEffect(() => {
    if (!mounted) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadBenchmarkIndices();
      }
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadBenchmarkIndices, mounted]);

  const snapshotsByDate = useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.date, snapshot])),
    [snapshots],
  );

  const selectedSnapshot = useMemo(
    () => snapshotsByDate.get(selectedDate),
    [selectedDate, snapshotsByDate],
  );

  useEffect(() => {
    setMemoInput(selectedSnapshot?.memo ?? "");
  }, [selectedSnapshot?.id, selectedSnapshot?.memo]);

  const monthSnapshots = useMemo(
    () =>
      snapshots.filter(
        (snapshot) => snapshot.date >= monthRange.from && snapshot.date <= monthRange.to,
      ),
    [monthRange.from, monthRange.to, snapshots],
  );

  const trendData = useMemo(
    () => buildTotalAssetTrendByMonth(snapshots, selectedMonth),
    [selectedMonth, snapshots],
  );
  const benchmarkResult = useMemo(
    () =>
      buildAssetTrendBenchmarkData({
        snapshots,
        indexSeries,
        compareStartDate,
        compareEndDate,
      }),
    [compareEndDate, compareStartDate, indexSeries, snapshots],
  );
  const benchmarkData = benchmarkResult.data;
  const benchmarkSummary = benchmarkResult.summary;
  const benchmarkDiagnostics = benchmarkResult.diagnostics;
  const showBenchmarkDebug = searchParams.get("debug") === "1";
  const benchmarkDebugPayload = useMemo(
    () => ({
      compareStartDate,
      compareEndDate,
      indexSeriesCounts: {
        kospi: indexSeries.kospi.length,
        kosdaq: indexSeries.kosdaq.length,
        sp500: indexSeries.sp500.length,
      },
      benchmarkDiagnostics,
      benchmarkSummary,
      benchmarkDataPreview: benchmarkData.slice(0, 5),
    }),
    [
      benchmarkData,
      benchmarkDiagnostics,
      benchmarkSummary,
      compareEndDate,
      compareStartDate,
      indexSeries.kosdaq.length,
      indexSeries.kospi.length,
      indexSeries.sp500.length,
    ],
  );

  const shouldShowMorningReminder = useMemo(
    () => mounted && isCloudMode && nowKstHour >= 7 && !snapshotsByDate.has(todayKst),
    [isCloudMode, mounted, nowKstHour, snapshotsByDate, todayKst],
  );

  const fetchHoldingQuote = useCallback(
    async (holding: PortfolioHolding): Promise<HoldingQuoteUpdate | null> => {
      if (holding.market !== "US") {
        return null;
      }

      try {
        const response = await fetch(
          `/api/quote?market=${holding.market}&ticker=${encodeURIComponent(holding.ticker)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as Partial<QuoteApiResponse>;
        const priceInt = Number(data.priceInt);

        if (!Number.isFinite(priceInt) || priceInt <= 0) {
          return null;
        }

        return {
          id: holding.id,
          currentPrice: priceInt,
          asOf: typeof data.asOf === "string" ? data.asOf : new Date().toISOString(),
        };
      } catch {
        return null;
      }
    },
    [],
  );

  const refreshUsHoldingsQuotes = useCallback(
    async (sourceHoldings: PortfolioHolding[]): Promise<PortfolioHolding[]> => {
      const targets = sourceHoldings.filter((holding) => holding.market === "US");

      if (targets.length === 0) {
        return sourceHoldings;
      }

      const updates: HoldingQuoteUpdate[] = [];
      let cursor = 0;

      const workers = Array.from(
        { length: Math.min(QUOTE_MAX_CONCURRENCY, targets.length) },
        async () => {
          while (true) {
            const currentIndex = cursor;
            cursor += 1;

            if (currentIndex >= targets.length) {
              return;
            }

            const quote = await fetchHoldingQuote(targets[currentIndex]);

            if (quote) {
              updates.push(quote);
            }
          }
        },
      );

      await Promise.all(workers);

      if (updates.length === 0) {
        return sourceHoldings;
      }

      updateQuotes(updates);
      const updateMap = new Map(updates.map((update) => [update.id, update]));

      return sourceHoldings.map((holding) => {
        const matched = updateMap.get(holding.id);

        if (!matched) {
          return holding;
        }

        return {
          ...holding,
          currentPrice: matched.currentPrice,
          priceUpdatedAt: matched.asOf ?? new Date().toISOString(),
        };
      });
    },
    [fetchHoldingQuote, updateQuotes],
  );

  const fetchFxRate = useCallback(async (): Promise<{ rate: number; asOf: string }> => {
    try {
      const response = await fetch("/api/fx", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`FX API error ${response.status}`);
      }

      const data = (await response.json()) as Partial<FxApiResponse>;
      const rate = Number(data.rate);

      if (!Number.isFinite(rate) || rate <= 0) {
        throw new Error("FX rate is invalid");
      }

      window.localStorage.setItem(PORTFOLIO_FX_STORAGE_KEY, `${rate}`);

      return {
        rate,
        asOf: typeof data.asOf === "string" ? data.asOf : "",
      };
    } catch {
      return {
        rate: readStoredFxRate() || DEFAULT_USDKRW_FX_RATE,
        asOf: "",
      };
    }
  }, []);

  const recordSnapshot = useCallback(
    async (targetDate: string, explicitMemo?: string) => {
      if (!mounted || loading || !isCloudMode) {
        return;
      }

      setStatusMessage("");
      setIsRecording(true);

      try {
        const holdingsWithLatestPrice = await refreshUsHoldingsQuotes(holdings);
        const fx = await fetchFxRate();
        const cashSettings = readPortfolioCashSettings();

        setFxRate(fx.rate);
        setFxAsOf(fx.asOf);

        const computed = calculatePortfolioTotalAsset({
          holdings: holdingsWithLatestPrice,
          fxRate: fx.rate,
          depositKrw: cashSettings.depositKrw,
          depositUsdCents: cashSettings.depositUsdCents,
          cashKrw: cashSettings.cashKrw,
        });

        const payload = {
          date: targetDate,
          totalAssetKrwInt: computed.totalAssetKrw,
          fxRate: fx.rate,
          memo: explicitMemo,
        };

        upsertSnapshot(payload);
        setStatusMessage(`${targetDate} 스냅샷을 저장했습니다.`);
      } catch {
        setStatusMessage("스냅샷 저장 중 오류가 발생했습니다.");
      } finally {
        setIsRecording(false);
      }
    },
    [fetchFxRate, holdings, isCloudMode, loading, mounted, refreshUsHoldingsQuotes, upsertSnapshot],
  );

  const handleRecordSelected = () => {
    if (!mounted) {
      return;
    }

    if (!isCloudMode) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const memoToSave = memoInput.trim() || undefined;
    void recordSnapshot(selectedDate, memoToSave);
  };

  const handleSaveNotes = () => {
    if (!mounted) {
      return;
    }

    if (!isCloudMode) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const existing = getSnapshotByDate(selectedDate);

    if (!existing) {
      window.alert("먼저 해당 날짜의 스냅샷을 기록하세요.");
      return;
    }

    saveMemo(selectedDate, memoInput);
    setStatusMessage(`${selectedDate} 메모를 저장했습니다.`);
  };

  const handleDelete = () => {
    if (!mounted) {
      return;
    }

    if (!isCloudMode) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const existing = getSnapshotByDate(selectedDate);

    if (!existing) {
      return;
    }

    if (!window.confirm(`${selectedDate} 스냅샷을 삭제할까요?`)) {
      return;
    }

    removeSnapshot(selectedDate);
    setStatusMessage(`${selectedDate} 스냅샷을 삭제했습니다.`);
  };

  const handleToggleBenchmark = (key: AssetTrendBenchmarkKey) => {
    setVisibleBenchmarks((current) => ({
      ...current,
      [key]: !current[key],
    }));
  };

  const clampCompareDate = (value: string): string => {
    if (!value) {
      return todayKst;
    }

    if (value > todayKst) {
      return todayKst;
    }

    return value;
  };

  const handleCompareStartDateChange = (value: string) => {
    const nextStart = clampCompareDate(value || monthRange.from);

    setCompareStartDate(nextStart);
    setCompareEndDate((current) => {
      const normalizedCurrent = clampCompareDate(current || compareDefaultEndDate);
      return normalizedCurrent < nextStart ? nextStart : normalizedCurrent;
    });
  };

  const handleCompareEndDateChange = (value: string) => {
    const nextEnd = clampCompareDate(value || compareDefaultEndDate);

    setCompareEndDate(nextEnd);
    setCompareStartDate((current) => {
      const normalizedCurrent = current || monthRange.from;
      return normalizedCurrent > nextEnd ? nextEnd : normalizedCurrent;
    });
  };

  const handleResetComparePeriod = () => {
    setCompareStartDate(monthRange.from);
    setCompareEndDate(compareDefaultEndDate);
  };

  return (
    <>
      <PageHeader
        title="Asset Trend"
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={handleRecordSelected}
            disabled={!mounted || loading || isRecording || !isCloudMode}
          >
            {isRecording ? "자동 기록 중..." : mounted ? `${selectedDate} 자동 기록` : "자동 기록"}
          </button>
        }
      />

      {!authLoading && !isCloudMode ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      {shouldShowMorningReminder ? (
        <section className="panel ta-reminder-banner">
          <div>
            오늘 07:00(KST) 이후 스냅샷이 아직 없습니다. 현재 가격/환율로 오늘 자산을 기록하세요.
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSelectedDate(todayKst);
              void recordSnapshot(todayKst, snapshotsByDate.get(todayKst)?.memo);
            }}
            disabled={isRecording || loading}
          >
            오늘 스냅샷 기록
          </button>
        </section>
      ) : null}

      <section className="panel">
        <div className="filter-row">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value || (mounted ? toYm(new Date()) : SSR_SAFE_MONTH))
              }
            />
          </label>

          <label>
            선택 날짜
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || SSR_SAFE_DATE)}
            />
          </label>

          <div className="fx-meta" style={{ marginLeft: "auto" }}>
            최근 환율(USD→KRW): <strong>{fxRate.toLocaleString("ko-KR")}</strong>
            {fxAsOf ? ` (${fxAsOf})` : ""}
          </div>
        </div>

        <div className="ta-layout">
          <TotalAssetCalendar
            month={selectedMonth}
            selectedDate={selectedDate}
            today={todayKst}
            snapshots={monthSnapshots}
            calendarMap={calendarMap}
            onSelectDate={setSelectedDate}
          />

          <aside className="ta-side-panel">
            <h3>{selectedDate}</h3>
            <div className="ta-kv-row">
              <span>총자산</span>
              <strong>
                {selectedSnapshot
                  ? moneyFormat("KRW", selectedSnapshot.totalAssetKrwInt)
                  : "기록 없음"}
              </strong>
            </div>
            <div className="ta-kv-row">
              <span>저장 환율</span>
              <strong>{selectedSnapshot ? selectedSnapshot.fxRate.toFixed(2) : "-"}</strong>
            </div>
            <div className="ta-kv-row">
              <span>저장 시각</span>
              <strong>
                {mounted && selectedSnapshot
                  ? new Date(selectedSnapshot.createdAt).toLocaleString("ko-KR")
                  : "-"}
              </strong>
            </div>

            <label className="ta-notes-label">
              메모
              <textarea
                rows={4}
                placeholder="선택 날짜 메모"
                value={memoInput}
                onChange={(event) => setMemoInput(event.target.value)}
              />
            </label>

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="primary-button"
                onClick={handleRecordSelected}
                disabled={!mounted || isRecording || loading || !isCloudMode}
              >
                Refresh
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleSaveNotes}
                disabled={!selectedSnapshot || !isCloudMode}
              >
                Save
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDelete}
                disabled={!selectedSnapshot || !isCloudMode}
              >
                Delete
              </button>
            </div>

            {statusMessage ? <p className="ta-status-text">{statusMessage}</p> : null}
          </aside>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>일별 총자산 추이 ({selectedMonth})</h3>
          <div className="panel-submetric">스냅샷 없는 날짜는 공백으로 표시됩니다.</div>
        </div>
        {mounted ? (
          <TotalAssetTrendChart data={trendData} calendarMap={calendarMap} />
        ) : (
          <div className="empty-state">차트 데이터 로딩 중...</div>
        )}
      </section>

      <ChartSectionCard>
        {mounted ? (
          <AssetTrendBenchmarkChart
            title={`포트폴리오 vs 지수 비교 (${selectedMonth})`}
            periodControls={
              <div className="ta-benchmark-period-controls">
                <label className="ta-benchmark-period-field">
                  <span>시작일</span>
                  <input
                    type="date"
                    value={compareStartDate}
                    max={compareEndDate}
                    onChange={(event) => handleCompareStartDateChange(event.target.value)}
                  />
                </label>
                <label className="ta-benchmark-period-field">
                  <span>종료일</span>
                  <input
                    type="date"
                    value={compareEndDate}
                    min={compareStartDate}
                    max={todayKst}
                    onChange={(event) => handleCompareEndDateChange(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="secondary-button ta-benchmark-period-reset"
                  onClick={handleResetComparePeriod}
                >
                  {compareResetLabel}
                </button>
              </div>
            }
            data={benchmarkData}
            summary={benchmarkSummary}
            calendarMap={calendarMap}
            visibleSeries={visibleBenchmarks}
            onToggleSeries={handleToggleBenchmark}
            errorMessage={benchmarkError}
          />
        ) : (
          <div className="empty-state">비교 차트 데이터 로딩 중...</div>
        )}
      </ChartSectionCard>

      {showBenchmarkDebug ? (
        <section className="panel">
          <div className="panel-header-inline">
            <h3>Benchmark Debug</h3>
          </div>
          <pre
            style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: "var(--muted)",
            }}
          >
            {JSON.stringify(benchmarkDebugPayload, null, 2)}
          </pre>
        </section>
      ) : null}
    </>
  );
}
