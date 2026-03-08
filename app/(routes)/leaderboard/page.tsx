"use client";

import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "@/components/common/SectionCard";
import { LeaderboardChartsSection } from "@/components/leaderboard/LeaderboardChartsSection";
import { LeaderboardHeaderBar } from "@/components/leaderboard/LeaderboardHeaderBar";
import {
  LeaderboardSortKey,
  LeaderboardTradesTable,
} from "@/components/leaderboard/LeaderboardTradesTable";
import { Modal } from "@/components/Modal";
import { RealizedTradeModal } from "@/components/RealizedTradeModal";
import { useRealizedTrades } from "@/lib/hooks/useRealizedTrades";
import { Market, RealizedTrade } from "@/lib/models/types";
import {
  buildDailyNetSeries,
  buildMonthlyNetSeriesByYear,
  convertTradeAmountToKrw,
  filterRealizedTrades,
  getPnlKrw,
  resolveTradeCurrency,
  summarizeRealizedTrades,
} from "@/lib/services/realizedTradeService";
import { getMonthRangeFromYm, toYm } from "@/lib/utils/date";
import { moneyFormat, percentFormat } from "@/lib/utils/money";
import { SortState, sortRows, toggleSort } from "@/lib/utils/sort";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const DEFAULT_FX_RATE = 1350;

interface FxApiResponse {
  rate: number;
  asOf: string;
}

interface TradingDaysApiResponse {
  days: string[];
}

function buildWeekdaysFallback(from: string, to: string): string[] {
  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T00:00:00`);

  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return [];
  }

  const days: string[] = [];
  const cursor = new Date(fromDate);

  while (cursor.getTime() <= toDate.getTime()) {
    const day = cursor.getDay();

    if (day !== 0 && day !== 6) {
      const year = cursor.getFullYear();
      const month = `${cursor.getMonth() + 1}`.padStart(2, "0");
      const date = `${cursor.getDate()}`.padStart(2, "0");
      days.push(`${year}-${month}-${date}`);
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export default function LeaderboardPage() {
  const {
    trades,
    loading,
    authLoading,
    isAuthenticated,
    create,
    update,
    remove,
  } = useRealizedTrades();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState<"ALL" | Market>("ALL");
  const [sortState, setSortState] = useState<SortState<LeaderboardSortKey>>({
    key: null,
    mode: null,
  });
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [tradingDays, setTradingDays] = useState<string[]>([]);

  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RealizedTrade | undefined>();
  const [selected, setSelected] = useState<RealizedTrade | undefined>();
  const isAuthed = isAuthenticated;

  useEffect(() => {
    if (authLoading || isAuthed) {
      return;
    }

    setFormOpen(false);
    setEditing(undefined);
    setSelected(undefined);
  }, [authLoading, isAuthed]);

  useEffect(() => {
    const savedFx = window.localStorage.getItem(FX_STORAGE_KEY);
    if (savedFx) {
      const parsed = Number(savedFx);
      if (Number.isFinite(parsed) && parsed > 0) {
        setFxRate(parsed);
      }
    }

    let mounted = true;

    const loadFx = async () => {
      try {
        const response = await fetch("/api/fx");

        if (!response.ok) {
          throw new Error(`FX API error: ${response.status}`);
        }

        const data = (await response.json()) as Partial<FxApiResponse>;
        const nextRate = Number(data.rate);

        if (!mounted || !Number.isFinite(nextRate) || nextRate <= 0) {
          return;
        }

        setFxRate(nextRate);
        window.localStorage.setItem(FX_STORAGE_KEY, `${nextRate}`);
      } catch {
        // Keep localStorage/default fx rate.
      }
    };

    void loadFx();

    return () => {
      mounted = false;
    };
  }, []);

  const dateRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);
  const selectedYear = useMemo(() => {
    const matched = selectedMonth.match(/^(\d{4})-\d{2}$/);

    if (!matched) {
      return new Date().getFullYear();
    }

    const parsed = Number.parseInt(matched[1], 10);
    return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
  }, [selectedMonth]);

  useEffect(() => {
    let cancelled = false;

    const loadTradingDays = async () => {
      try {
        const response = await fetch(
          `/api/trading-days?from=${dateRange.from}&to=${dateRange.to}&country=KR`,
        );

        if (!response.ok) {
          throw new Error(`Trading days API error: ${response.status}`);
        }

        const data = (await response.json()) as Partial<TradingDaysApiResponse>;
        const days = Array.isArray(data.days) ? data.days : [];

        if (!cancelled) {
          setTradingDays(days);
        }
      } catch {
        if (!cancelled) {
          setTradingDays(buildWeekdaysFallback(dateRange.from, dateRange.to));
        }
      }
    };

    void loadTradingDays();

    return () => {
      cancelled = true;
    };
  }, [dateRange.from, dateRange.to]);

  const filtered = useMemo(
    () =>
      filterRealizedTrades(trades, {
        dateRange,
        market,
        search,
      }),
    [dateRange, market, search, trades],
  );

  const filteredForYearlyMonthly = useMemo(
    () =>
      filterRealizedTrades(trades, {
        market,
        search,
      }),
    [market, search, trades],
  );

  const sortedFiltered = useMemo(
    () =>
      sortRows(
        filtered,
        sortState,
        (trade, key) => {
          if (key === "date") {
            return new Date(`${trade.date}T00:00:00`);
          }

          if (key === "market") {
            return trade.market;
          }

          if (key === "ticker") {
            return trade.ticker;
          }

          if (key === "qty") {
            return trade.qty;
          }

          if (key === "buyPriceInt") {
            return trade.buyPriceInt;
          }

          if (key === "sellPriceInt") {
            return trade.sellPriceInt;
          }

          if (key === "returnPct") {
            return trade.returnPct;
          }

          if (key === "pnlInt") {
            return trade.pnlInt;
          }

          return trade.rating;
        },
        (a, b) => {
          const byDate = a.date.localeCompare(b.date);

          if (byDate !== 0) {
            return byDate;
          }

          return a.createdAt.localeCompare(b.createdAt);
        },
      ),
    [filtered, sortState],
  );

  const summary = useMemo(
    () => summarizeRealizedTrades(filtered, { fxRate, includeUsd: true }),
    [filtered, fxRate],
  );

  const dailyNet = useMemo(
    () =>
      buildDailyNetSeries(filtered, {
        fxRate,
        includeUsd: true,
        tradingDays,
      }),
    [filtered, fxRate, tradingDays],
  );

  const monthlyTotal = useMemo(
    () => filtered.reduce((sum, trade) => sum + getPnlKrw(trade, fxRate), 0),
    [filtered, fxRate],
  );

  const sumDailyBars = useMemo(
    () =>
      dailyNet.reduce(
        (sum, point) => sum + (typeof point.netPnlInt === "number" ? point.netPnlInt : 0),
        0,
      ),
    [dailyNet],
  );

  const monthlyNet = useMemo(
    () =>
      buildMonthlyNetSeriesByYear(filteredForYearlyMonthly, selectedYear, {
        fxRate,
        includeUsd: true,
      }),
    [filteredForYearlyMonthly, fxRate, selectedYear],
  );

  const yearlyCumulative = useMemo(
    () => monthlyNet.reduce((sum, point) => sum + point.netPnlInt, 0),
    [monthlyNet],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    const diff = monthlyTotal - sumDailyBars;
    console.log("monthlyTotal", monthlyTotal);
    console.log("sumDailyBars", sumDailyBars);
    console.log("diff", diff);
  }, [monthlyTotal, sumDailyBars]);

  const openCreate = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (trade: RealizedTrade) => {
    setEditing(trade);
    setFormOpen(true);
    setSelected(undefined);
  };

  const handleDelete = (trade: RealizedTrade) => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!window.confirm("해당 거래를 삭제할까요?")) {
      return;
    }

    remove(trade.id);
    setSelected(undefined);
  };

  const handleSortClick = (key: LeaderboardSortKey) => {
    setSortState((prev) => toggleSort(prev, key));
  };

  return (
    <>
      <LeaderboardHeaderBar
        selectedMonth={selectedMonth}
        market={market}
        search={search}
        onMonthChange={(value) => setSelectedMonth(value || toYm(new Date()))}
        onMarketChange={setMarket}
        onSearchChange={setSearch}
        totalCount={summary.totalCount}
        winCount={summary.winCount}
        winRate={summary.winRate}
        monthlyTotal={monthlyTotal}
        isAuthed={isAuthed}
        onCreate={openCreate}
      />

      {!authLoading && !isAuthed ? (
        <SectionCard>
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </SectionCard>
      ) : null}

      <LeaderboardTradesTable
        loading={loading}
        trades={sortedFiltered}
        sortState={sortState}
        onSortClick={handleSortClick}
        onSelectTrade={setSelected}
      />

      <LeaderboardChartsSection
        dailyNet={dailyNet}
        monthlyTotal={monthlyTotal}
        monthlyNet={monthlyNet}
        selectedYear={selectedYear}
        yearlyCumulative={yearlyCumulative}
      />

      <RealizedTradeModal
        open={isFormOpen}
        mode={editing ? "edit" : "create"}
        trade={editing}
        onClose={() => setFormOpen(false)}
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

      <Modal
        open={Boolean(selected)}
        title={selected ? `${selected.date} ${selected.ticker}` : "상세"}
        onClose={() => setSelected(undefined)}
      >
        {selected ? (
          (() => {
            const currency = resolveTradeCurrency(selected.market);
            const pnlKrw = convertTradeAmountToKrw(selected.pnlInt, selected.market, fxRate);

            return (
              <>
                <div className="detail-grid">
                  <div className="detail-item">
                    <h4>Market</h4>
                    <p>{selected.market}</p>
                  </div>
                  <div className="detail-item">
                    <h4>Qty</h4>
                    <p>{selected.qty}</p>
                  </div>
                  <div className="detail-item">
                    <h4>매수금액</h4>
                    <p>{moneyFormat(currency, selected.buyAmountInt)}</p>
                  </div>
                  <div className="detail-item">
                    <h4>매도금액</h4>
                    <p>{moneyFormat(currency, selected.sellAmountInt)}</p>
                  </div>
                  <div className="detail-item">
                    <h4>수익률</h4>
                    <p>{percentFormat(selected.returnPct)}</p>
                  </div>
                  <div className="detail-item">
                    <h4>실현손익</h4>
                    <p>{moneyFormat(currency, selected.pnlInt)}</p>
                  </div>
                  <div className="detail-item">
                    <h4>실현손익(KRW 환산)</h4>
                    <p>{moneyFormat("KRW", pnlKrw)}</p>
                  </div>
                  <div className="detail-item">
                    <h4>Rating</h4>
                    <p>{selected.rating || "-"}</p>
                  </div>
                  <div className="detail-item">
                    <h4>Comment</h4>
                    <p>{selected.content || "-"}</p>
                  </div>
                </div>

                <div className="form-actions" style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => openEdit(selected)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="danger-button"
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
    </>
  );
}
