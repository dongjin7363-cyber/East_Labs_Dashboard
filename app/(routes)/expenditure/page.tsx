"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ExpenseCellModal } from "@/components/ExpenseCellModal";
import {
  MonthlyBucketBarChart,
  type MonthlyBucketBarPoint,
} from "@/components/MonthlyBucketBarChart";
import {
  MonthlySubcategoryPieChart,
  type MonthlySubcategoryPiePoint,
} from "@/components/MonthlySubcategoryPieChart";
import { PageHeader } from "@/components/PageHeader";
import { useExpenses } from "@/lib/hooks/useExpenses";
import { ExpenseBucket, EXPENSE_SUBCATEGORIES } from "@/lib/models/types";
import {
  buildExpenseCellSumMap,
  computeDailyNetFromBucketTotals,
  listExpenseEntriesByCell,
  listExpenseEntriesByMonth,
  summarizeExpenseBuckets,
  summarizeExpenseSubcategories,
} from "@/lib/services/expenseService";
import {
  getDatesInMonthFromYm,
  getMonthRangeFromYm,
  todayKstYmd,
  toYm,
} from "@/lib/utils/date";
import { moneyFormat } from "@/lib/utils/money";

interface BucketColumn {
  key: ExpenseBucket;
  label: string;
}

interface SelectedCell {
  date: string;
  bucket: ExpenseBucket;
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

const BUCKET_COLUMNS: BucketColumn[] = [
  { key: "INCOME", label: "Income" },
  { key: "SUBSCRIPTION", label: "Subscription" },
  { key: "PLUS", label: "Plus" },
  { key: "SPENDING", label: "Spending" },
];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function dayOfWeekFromDateString(date: string): number {
  const matched = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!matched) {
    return 0;
  }

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return utcDate.getUTCDay();
}

function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek] ?? WEEKDAY_LABELS[0];
}

function cellDisplay(amountInt: number): string {
  if (amountInt === 0) {
    return "-";
  }

  return moneyFormat("KRW", amountInt);
}

export default function ExpenditurePage() {
  const { entries, loading, create, update, remove } = useExpenses();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const calendarMonthCacheRef = useRef<Record<string, Record<string, CalendarDayInfo>>>({});
  const todayKst = useMemo(() => todayKstYmd(), []);
  const isCurrentKstMonthSelected = useMemo(
    () => selectedMonth === todayKst.slice(0, 7),
    [selectedMonth, todayKst],
  );

  const monthEntries = useMemo(
    () => listExpenseEntriesByMonth(entries, selectedMonth),
    [entries, selectedMonth],
  );
  const dates = useMemo(() => getDatesInMonthFromYm(selectedMonth), [selectedMonth]);

  const cellSumMap = useMemo(() => buildExpenseCellSumMap(monthEntries), [monthEntries]);

  const rows = useMemo(
    () =>
      dates.map((date) => {
        const info = calendarMap[date];
        const dayOfWeek = info?.dow ?? dayOfWeekFromDateString(date);
        const isHoliday = info?.isHoliday ?? false;
        const isSunday = info ? info.dow === 0 : false;
        const isSaturday = info ? info.dow === 6 : false;
        const income = cellSumMap.get(`${date}|INCOME`) ?? 0;
        const subscription = cellSumMap.get(`${date}|SUBSCRIPTION`) ?? 0;
        const plus = cellSumMap.get(`${date}|PLUS`) ?? 0;
        const spending = cellSumMap.get(`${date}|SPENDING`) ?? 0;
        const dailyTotal = income - (subscription + plus + spending);

        return {
          date,
          weekday: weekdayLabel(dayOfWeek),
          isSunday,
          isSaturday,
          isHoliday,
          holidayName: info?.holidayName,
          INCOME: income,
          SUBSCRIPTION: subscription,
          PLUS: plus,
          SPENDING: spending,
          dailyTotal,
        };
      }),
    [calendarMap, dates, cellSumMap],
  );

  const monthlyTotals = useMemo(
    () => summarizeExpenseBuckets(monthEntries),
    [monthEntries],
  );

  const monthlyNet = useMemo(
    () => computeDailyNetFromBucketTotals(monthlyTotals),
    [monthlyTotals],
  );
  const monthlyBucketChartData = useMemo<MonthlyBucketBarPoint[]>(
    () => [
      { category: "Income", amountInt: monthlyTotals.INCOME },
      { category: "Subscription", amountInt: monthlyTotals.SUBSCRIPTION },
      { category: "Plus", amountInt: monthlyTotals.PLUS },
      { category: "Spending", amountInt: monthlyTotals.SPENDING },
    ],
    [monthlyTotals],
  );
  const monthlySubcategoryTotals = useMemo(
    () => summarizeExpenseSubcategories(monthEntries),
    [monthEntries],
  );
  const monthlySubcategoryPieData = useMemo<MonthlySubcategoryPiePoint[]>(
    () =>
      EXPENSE_SUBCATEGORIES.map((subcategory) => ({
        subcategory,
        amountInt: monthlySubcategoryTotals[subcategory],
      })),
    [monthlySubcategoryTotals],
  );
  const monthlyTotalSpendInt = useMemo(
    () =>
      monthlyTotals.SUBSCRIPTION +
      monthlyTotals.PLUS +
      monthlyTotals.SPENDING,
    [monthlyTotals],
  );

  useEffect(() => {
    let cancelled = false;
    const monthRange = getMonthRangeFromYm(selectedMonth);
    const cachedMap = calendarMonthCacheRef.current[selectedMonth];

    if (cachedMap) {
      setCalendarMap(cachedMap);

      return () => {
        cancelled = true;
      };
    }

    setCalendarMap({});

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
  }, [selectedMonth]);

  const selectedCellEntries = useMemo(() => {
    if (!selectedCell) {
      return [];
    }

    return listExpenseEntriesByCell(monthEntries, selectedCell.date, selectedCell.bucket);
  }, [monthEntries, selectedCell]);

  return (
    <>
      <PageHeader
        title="Expenditure"
        titleMeta={
          <span className="inline-title-metric">
            <span className="inline-title-divider">|</span>
            <span className="inline-title-metric-label">총 소비(월)</span>
            <strong>{loading ? "—" : moneyFormat("KRW", monthlyTotalSpendInt)}</strong>
          </span>
        }
      />

      <section className="panel">
        <div className="filter-row">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value || toYm(new Date()))}
            />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Income</th>
                <th>Subscription</th>
                <th>Plus</th>
                <th>Spending</th>
                <th>Daily Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>로딩 중...</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr
                    key={row.date}
                    className={isCurrentKstMonthSelected && row.date === todayKst ? "expense-row-today" : ""}
                  >
                    <td>
                      <span
                        className={`expense-date-cell ${
                          row.isHoliday || row.isSunday
                            ? "is-red"
                            : row.isSaturday
                              ? "is-blue"
                              : ""
                        }`}
                        title={row.holidayName ? row.holidayName : undefined}
                      >
                        {row.date}
                        <span className="expense-weekday">({row.weekday})</span>
                      </span>
                    </td>
                    {BUCKET_COLUMNS.map((column) => {
                      const amount = row[column.key];

                      return (
                        <td key={`${row.date}-${column.key}`}>
                          <button
                            type="button"
                            className={`expense-sheet-cell ${amount !== 0 ? "has-value" : ""}`}
                            onClick={() =>
                              setSelectedCell({ date: row.date, bucket: column.key })
                            }
                          >
                            {cellDisplay(amount)}
                          </button>
                        </td>
                      );
                    })}
                    <td
                      style={{
                        color:
                          row.dailyTotal > 0
                            ? "var(--positive)"
                            : row.dailyTotal < 0
                              ? "var(--negative)"
                              : "var(--muted)",
                      }}
                    >
                      {cellDisplay(row.dailyTotal)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>Monthly Total</th>
                <th>{cellDisplay(monthlyTotals.INCOME)}</th>
                <th>{cellDisplay(monthlyTotals.SUBSCRIPTION)}</th>
                <th>{cellDisplay(monthlyTotals.PLUS)}</th>
                <th>{cellDisplay(monthlyTotals.SPENDING)}</th>
                <th
                  style={{
                    color:
                      monthlyNet > 0
                        ? "var(--positive)"
                        : monthlyNet < 0
                          ? "var(--negative)"
                          : "var(--muted)",
                  }}
                >
                  {cellDisplay(monthlyNet)}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="expense-chart-grid">
          <article className="expense-chart-card">
            <div className="expense-chart-header">
              <h3 className="expense-chart-title">월 카테고리 합계</h3>
            </div>
            <MonthlyBucketBarChart data={monthlyBucketChartData} />
          </article>
          <article className="expense-chart-card">
            <div className="expense-chart-header">
              <h3 className="expense-chart-title">월 세부항목 비중</h3>
              <div className="expense-chart-total-spend">
                <span className="expense-total-spend-label">총 소비</span>
                <strong className="expense-total-spend-value">
                  {moneyFormat("KRW", monthlyTotalSpendInt)}
                </strong>
              </div>
            </div>
            <MonthlySubcategoryPieChart data={monthlySubcategoryPieData} />
          </article>
        </div>
      </section>

      <ExpenseCellModal
        open={Boolean(selectedCell)}
        date={selectedCell?.date ?? ""}
        bucket={selectedCell?.bucket ?? "INCOME"}
        entries={selectedCellEntries}
        onClose={() => setSelectedCell(null)}
        onCreate={create}
        onUpdate={update}
        onDelete={remove}
      />
    </>
  );
}
