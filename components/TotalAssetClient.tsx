"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SummaryCardGrid } from "@/components/SummaryCardGrid";
import { TotalAssetCalendar } from "@/components/TotalAssetCalendar";
import { TotalAssetTrendChart } from "@/components/TotalAssetTrendChart";
import { usePortfolio } from "@/lib/hooks/usePortfolio";
import { PortfolioHolding, TotalAssetSnapshot } from "@/lib/models/types";
import {
  calculatePortfolioTotalAsset,
  HoldingQuoteUpdate,
} from "@/lib/services/portfolioService";
import {
  buildTotalAssetTrendByMonth,
  DEFAULT_USDKRW_FX_RATE,
  deleteTotalAssetSnapshotByDate,
  getTotalAssetSnapshotByDate,
  listTotalAssetSnapshots,
  PORTFOLIO_FX_STORAGE_KEY,
  readPortfolioCashSettings,
  readStoredFxRate,
  TotalAssetSnapshotInput,
  upsertTotalAssetSnapshot,
  updateTotalAssetSnapshotNotes,
} from "@/lib/services/totalAssetService";
import { currentKstHour, getMonthRangeFromYm, todayKstYmd, toYm } from "@/lib/utils/date";
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

const QUOTE_MAX_CONCURRENCY = 3;
const SSR_SAFE_MONTH = "1970-01";
const SSR_SAFE_DATE = "1970-01-01";

export function TotalAssetClient() {
  const { holdings, loading, updateQuotes } = usePortfolio();
  const [mounted, setMounted] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(SSR_SAFE_MONTH);
  const [selectedDate, setSelectedDate] = useState(SSR_SAFE_DATE);
  const [todayKst, setTodayKst] = useState(SSR_SAFE_DATE);
  const [nowKstHour, setNowKstHour] = useState(0);
  const [snapshots, setSnapshots] = useState<TotalAssetSnapshot[]>([]);
  const [notesInput, setNotesInput] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [fxRate, setFxRate] = useState(DEFAULT_USDKRW_FX_RATE);
  const [fxAsOf, setFxAsOf] = useState("");
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const calendarMonthCacheRef = useRef<Record<string, Record<string, CalendarDayInfo>>>({});

  useEffect(() => {
    const initialMonth = toYm(new Date());
    const initialToday = todayKstYmd();

    setSelectedMonth(initialMonth);
    setSelectedDate(initialToday);
    setTodayKst(initialToday);
    setNowKstHour(currentKstHour());
    setSnapshots(listTotalAssetSnapshots());
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

  const snapshotsByDate = useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.date, snapshot])),
    [snapshots],
  );

  const selectedSnapshot = useMemo(
    () => snapshotsByDate.get(selectedDate),
    [selectedDate, snapshotsByDate],
  );

  useEffect(() => {
    setNotesInput(selectedSnapshot?.notes ?? "");
  }, [selectedSnapshot?.id, selectedSnapshot?.notes]);

  const monthRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);

  const monthSnapshots = useMemo(
    () =>
      snapshots.filter(
        (snapshot) => snapshot.date >= monthRange.from && snapshot.date <= monthRange.to,
      ),
    [monthRange.from, monthRange.to, snapshots],
  );

  const latestSnapshot = useMemo(
    () => (snapshots.length === 0 ? undefined : snapshots[snapshots.length - 1]),
    [snapshots],
  );

  const trendData = useMemo(
    () => buildTotalAssetTrendByMonth(snapshots, selectedMonth),
    [selectedMonth, snapshots],
  );

  const monthPeakSnapshot = useMemo(() => {
    if (monthSnapshots.length === 0) {
      return undefined;
    }

    return monthSnapshots.reduce((best, current) =>
      current.totalAssetKrwInt > best.totalAssetKrwInt ? current : best,
    );
  }, [monthSnapshots]);

  const shouldShowMorningReminder = useMemo(
    () => mounted && nowKstHour >= 7 && !snapshotsByDate.has(todayKst),
    [mounted, nowKstHour, snapshotsByDate, todayKst],
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
    async (targetDate: string, explicitNotes?: string) => {
      if (!mounted || loading) {
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
          cashKrw: cashSettings.cashKrw,
        });

        const payload: TotalAssetSnapshotInput = {
          date: targetDate,
          totalAssetKrwInt: computed.totalAssetKrw,
          fxRate: fx.rate,
          notes: explicitNotes,
        };

        const updated = upsertTotalAssetSnapshot(payload);
        setSnapshots(updated);
        setStatusMessage(`${targetDate} 스냅샷을 저장했습니다.`);
      } catch {
        setStatusMessage("스냅샷 저장 중 오류가 발생했습니다.");
      } finally {
        setIsRecording(false);
      }
    },
    [fetchFxRate, holdings, loading, mounted, refreshUsHoldingsQuotes],
  );

  const handleRecordSelected = () => {
    if (!mounted) {
      return;
    }

    const notesToSave = notesInput.trim() || undefined;
    void recordSnapshot(selectedDate, notesToSave);
  };

  const handleSaveNotes = () => {
    if (!mounted) {
      return;
    }

    const existing = getTotalAssetSnapshotByDate(selectedDate);

    if (!existing) {
      window.alert("먼저 해당 날짜의 스냅샷을 기록하세요.");
      return;
    }

    const updated = updateTotalAssetSnapshotNotes(selectedDate, notesInput);
    setSnapshots(updated);
    setStatusMessage(`${selectedDate} 메모를 저장했습니다.`);
  };

  const handleDelete = () => {
    if (!mounted) {
      return;
    }

    const existing = getTotalAssetSnapshotByDate(selectedDate);

    if (!existing) {
      return;
    }

    if (!window.confirm(`${selectedDate} 스냅샷을 삭제할까요?`)) {
      return;
    }

    const updated = deleteTotalAssetSnapshotByDate(selectedDate);
    setSnapshots(updated);
    setStatusMessage(`${selectedDate} 스냅샷을 삭제했습니다.`);
  };

  const summaryCards = useMemo(
    () =>
      mounted
        ? [
            {
              title: "선택일 총자산",
              value: selectedSnapshot
                ? moneyFormat("KRW", selectedSnapshot.totalAssetKrwInt)
                : "-",
              subtitle: selectedSnapshot
                ? `환율 ${selectedSnapshot.fxRate.toFixed(2)}`
                : "-",
            },
            {
              title: "월 기록 수",
              value: monthSnapshots.length,
              subtitle: `${monthRange.from} ~ ${monthRange.to}`,
            },
            {
              title: "월 최고 자산",
              value: monthPeakSnapshot
                ? moneyFormat("KRW", monthPeakSnapshot.totalAssetKrwInt)
                : "-",
              subtitle: monthPeakSnapshot ? monthPeakSnapshot.date : "-",
            },
            {
              title: "최신 기록",
              value: latestSnapshot
                ? moneyFormat("KRW", latestSnapshot.totalAssetKrwInt)
                : "-",
              subtitle: latestSnapshot ? latestSnapshot.date : "-",
            },
          ]
        : [
            { title: "선택일 총자산", value: "-", subtitle: "-" },
            { title: "월 기록 수", value: "-", subtitle: "-" },
            { title: "월 최고 자산", value: "-", subtitle: "-" },
            { title: "최신 기록", value: "-", subtitle: "-" },
          ],
    [latestSnapshot, monthPeakSnapshot, monthRange.from, monthRange.to, monthSnapshots.length, mounted, selectedSnapshot],
  );

  return (
    <>
      <PageHeader
        title="Total Asset"
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={handleRecordSelected}
            disabled={!mounted || loading || isRecording}
          >
            {isRecording ? "자동 기록 중..." : mounted ? `${selectedDate} 자동 기록` : "자동 기록"}
          </button>
        }
      />

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
              void recordSnapshot(todayKst, snapshotsByDate.get(todayKst)?.notes);
            }}
            disabled={isRecording || loading}
          >
            오늘 스냅샷 기록
          </button>
        </section>
      ) : null}

      <SummaryCardGrid cards={summaryCards} />

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
                value={notesInput}
                onChange={(event) => setNotesInput(event.target.value)}
              />
            </label>

            <div className="form-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="primary-button"
                onClick={handleRecordSelected}
                disabled={!mounted || isRecording || loading}
              >
                Refresh
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={handleSaveNotes}
                disabled={!selectedSnapshot}
              >
                Save
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDelete}
                disabled={!selectedSnapshot}
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
    </>
  );
}
