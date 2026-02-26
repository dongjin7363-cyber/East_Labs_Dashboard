"use client";

import { useEffect, useMemo, useState } from "react";
import { DailyNetChart } from "@/components/DailyNetChart";
import { Modal } from "@/components/Modal";
import { MonthlyNetChart } from "@/components/MonthlyNetChart";
import { PageHeader } from "@/components/PageHeader";
import { RealizedTradeModal } from "@/components/RealizedTradeModal";
import { SummaryCardGrid } from "@/components/SummaryCardGrid";
import { useRealizedTrades } from "@/lib/hooks/useRealizedTrades";
import { RealizedTrade, TradeRating } from "@/lib/models/types";
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

type LeaderboardSortKey =
  | "date"
  | "market"
  | "ticker"
  | "qty"
  | "buyPriceInt"
  | "sellPriceInt"
  | "returnPct"
  | "pnlInt"
  | "rating";

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
  const { trades, loading, create, update, remove } = useRealizedTrades();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState<"ALL" | TradeRating>("ALL");
  const [sortState, setSortState] = useState<SortState<LeaderboardSortKey>>({
    key: null,
    mode: null,
  });
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const [fxAsOf, setFxAsOf] = useState("");
  const [tradingDays, setTradingDays] = useState<string[]>([]);

  const [isFormOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RealizedTrade | undefined>();
  const [selected, setSelected] = useState<RealizedTrade | undefined>();

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
        setFxAsOf(typeof data.asOf === "string" ? data.asOf : "");
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
        search,
        rating,
      }),
    [dateRange, rating, search, trades],
  );

  const filteredForYearlyMonthly = useMemo(
    () =>
      filterRealizedTrades(trades, {
        search,
        rating,
      }),
    [rating, search, trades],
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
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (trade: RealizedTrade) => {
    setEditing(trade);
    setFormOpen(true);
    setSelected(undefined);
  };

  const handleDelete = (trade: RealizedTrade) => {
    if (!window.confirm("해당 거래를 삭제할까요?")) {
      return;
    }

    remove(trade.id);
    setSelected(undefined);
  };

  const handleSortClick = (key: LeaderboardSortKey) => {
    setSortState((prev) => toggleSort(prev, key));
  };

  const sortIndicator = (key: LeaderboardSortKey): string => {
    if (sortState.key !== key || !sortState.mode) {
      return "";
    }

    return sortState.mode === "DESC" ? "▼" : "▲";
  };

  const fxRateText =
    `1 USD = ₩${new Intl.NumberFormat("ko-KR", {
      maximumFractionDigits: 2,
    }).format(fxRate)}` + (fxAsOf ? ` (${fxAsOf})` : "");

  return (
    <>
      <PageHeader
        title="Leaderboard"
        actions={
          <button type="button" className="primary-button" onClick={openCreate}>
            거래 추가
          </button>
        }
      />

      <SummaryCardGrid
        cards={[
          {
            title: "총 거래 수",
            value: summary.totalCount,
          },
          {
            title: "수익 거래 수",
            value: summary.winCount,
            tone: "positive" as const,
          },
          {
            title: "순수익 합계(KRW 환산)",
            value: moneyFormat("KRW", monthlyTotal),
            subtitle: `USD 포함 환산 · ${fxRateText}`,
            tone: monthlyTotal >= 0 ? ("positive" as const) : ("negative" as const),
          },
          {
            title: "승률",
            value: percentFormat(summary.winRate),
          },
        ]}
      />

      <section className="panel">
        <div className="filter-row">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value || toYm(new Date()))
              }
            />
          </label>

          <label>
            검색
            <input
              placeholder="ticker / content"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label>
            Rating
            <select
              value={rating}
              onChange={(event) => setRating(event.target.value as "ALL" | TradeRating)}
            >
              <option value="ALL">ALL</option>
              <option value="Best">Best</option>
              <option value="Good">Good</option>
              <option value="Normal">Normal</option>
              <option value="Bad">Bad</option>
            </select>
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
                    onClick={() => handleSortClick("date")}
                  >
                    Date
                    <span className="sort-indicator">{sortIndicator("date")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("market")}
                  >
                    Market
                    <span className="sort-indicator">{sortIndicator("market")}</span>
                  </button>
                </th>
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
                    onClick={() => handleSortClick("buyPriceInt")}
                  >
                    BuyPrice
                    <span className="sort-indicator">{sortIndicator("buyPriceInt")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("sellPriceInt")}
                  >
                    SellPrice
                    <span className="sort-indicator">{sortIndicator("sellPriceInt")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("returnPct")}
                  >
                    Return%
                    <span className="sort-indicator">{sortIndicator("returnPct")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("pnlInt")}
                  >
                    PnL
                    <span className="sort-indicator">{sortIndicator("pnlInt")}</span>
                  </button>
                </th>
                <th>
                  <button
                    type="button"
                    className="table-sort-button"
                    onClick={() => handleSortClick("rating")}
                  >
                    Rating
                    <span className="sort-indicator">{sortIndicator("rating")}</span>
                  </button>
                </th>
                <th>Content</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10}>로딩 중...</td>
                </tr>
              ) : sortedFiltered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty-state">
                    데이터가 없습니다.
                  </td>
                </tr>
              ) : (
                sortedFiltered.map((trade) => {
                  const currency = resolveTradeCurrency(trade.market);

                  return (
                    <tr
                      key={trade.id}
                      className="clickable-row"
                      onClick={() => setSelected(trade)}
                    >
                      <td>{trade.date}</td>
                      <td>{trade.market}</td>
                      <td>{trade.ticker}</td>
                      <td>{trade.qty}</td>
                      <td>{moneyFormat(currency, trade.buyPriceInt)}</td>
                      <td>{moneyFormat(currency, trade.sellPriceInt)}</td>
                      <td
                        style={{
                          color:
                            trade.returnPct >= 0 ? "var(--positive)" : "var(--negative)",
                        }}
                      >
                        {percentFormat(trade.returnPct)}
                      </td>
                      <td
                        style={{
                          color: trade.pnlInt >= 0 ? "var(--positive)" : "var(--negative)",
                        }}
                      >
                        {moneyFormat(currency, trade.pnlInt)}
                      </td>
                      <td>{trade.rating || "-"}</td>
                      <td>{trade.content || "-"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>일별 순수익</h3>
          <div className="panel-submetric">
            월 누적 순수익(KRW 환산): {moneyFormat("KRW", monthlyTotal)}
          </div>
        </div>
        <DailyNetChart data={dailyNet} />
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>월별 순수익 ({selectedYear})</h3>
          <div className="panel-submetric">
            연 누적 순수익: {moneyFormat("KRW", yearlyCumulative)}
          </div>
        </div>
        <MonthlyNetChart data={monthlyNet} />
      </section>

      <RealizedTradeModal
        open={isFormOpen}
        mode={editing ? "edit" : "create"}
        trade={editing}
        onClose={() => setFormOpen(false)}
        onSubmit={(input) => {
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
