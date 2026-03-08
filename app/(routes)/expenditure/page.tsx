"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "@/components/common/SectionCard";
import { ExpenseCellModal } from "@/components/ExpenseCellModal";
import { ExpenditureChartsSection } from "@/components/expenditure/ExpenditureChartsSection";
import { ExpenditureHeaderBar } from "@/components/expenditure/ExpenditureHeaderBar";
import { ExpenditureMonthCalendar } from "@/components/expenditure/ExpenditureMonthCalendar";
import { ExpenditureWeekSection } from "@/components/expenditure/ExpenditureWeekSection";
import type { MonthlyBucketBarPoint } from "@/components/MonthlyBucketBarChart";
import type { MonthlySubcategoryPiePoint } from "@/components/MonthlySubcategoryPieChart";
import { useExpenses } from "@/lib/hooks/useExpenses";
import {
  ExpenseBucket,
  ExpenseSubcategory,
  EXPENSE_SUBCATEGORIES,
} from "@/lib/models/types";
import {
  buildExpenseCellSumMap,
  computeDailyNetFromBucketTotals,
  listExpenseEntriesByCell,
  listExpenseEntriesByMonth,
  summarizeExpenseBuckets,
  summarizeExpenseSubcategories,
} from "@/lib/services/expenseService";
import {
  formatWeekRangeCompact,
  getDayOfWeekKST,
  getDatesInRange,
  getMonthStartEnd,
  getWeekRangeSundayStart,
} from "@/lib/date/calendar";
import { getCurrentMonthKST, getTodayKST } from "@/lib/date/kst";

interface SelectedCell {
  date: string;
  bucket: ExpenseBucket;
  subcategory?: ExpenseSubcategory;
  title: string;
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

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek] ?? WEEKDAY_LABELS[0];
}

function defaultSelectedDateForMonth(month: string, todayKst: string): string {
  const monthRange = getMonthStartEnd(month);

  if (todayKst.startsWith(`${month}-`)) {
    return todayKst;
  }

  return monthRange.from;
}

function matchesExpenseCell(
  entry: {
    bucket: ExpenseBucket;
    subcategory?: ExpenseSubcategory;
  },
  bucket: ExpenseBucket,
  subcategory?: ExpenseSubcategory,
): boolean {
  if (entry.bucket !== bucket) {
    return false;
  }

  if (!subcategory) {
    return true;
  }

  return entry.subcategory === subcategory;
}

export default function ExpenditurePage() {
  const {
    entries,
    loading,
    authLoading,
    isAuthenticated,
    create,
    update,
    remove,
  } = useExpenses();
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKST());
  const todayKst = useMemo(() => getTodayKST(), []);
  const [selectedDate, setSelectedDate] = useState(() =>
    defaultSelectedDateForMonth(getCurrentMonthKST(), todayKst),
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const calendarMonthCacheRef = useRef<Record<string, Record<string, CalendarDayInfo>>>({});
  const isAuthed = isAuthenticated;
  const monthRange = useMemo(() => getMonthStartEnd(selectedMonth), [selectedMonth]);
  const calendarFetchRange = useMemo(() => {
    const startOfGrid = getWeekRangeSundayStart(monthRange.from).from;
    const endOfGrid = getWeekRangeSundayStart(monthRange.to).to;

    return {
      from: startOfGrid,
      to: endOfGrid,
    };
  }, [monthRange.from, monthRange.to]);
  const selectedWeekRange = useMemo(
    () => getWeekRangeSundayStart(selectedDate),
    [selectedDate],
  );
  const selectedWeekDates = useMemo(
    () => getDatesInRange(selectedWeekRange.from, selectedWeekRange.to),
    [selectedWeekRange.from, selectedWeekRange.to],
  );

  useEffect(() => {
    if (authLoading || isAuthed) {
      return;
    }

    setSelectedCell(null);
  }, [authLoading, isAuthed]);

  useEffect(() => {
    if (!selectedDate.startsWith(`${selectedMonth}-`)) {
      setSelectedDate(defaultSelectedDateForMonth(selectedMonth, todayKst));
    }
  }, [selectedDate, selectedMonth, todayKst]);

  const monthEntries = useMemo(
    () => listExpenseEntriesByMonth(entries, selectedMonth),
    [entries, selectedMonth],
  );
  const weekDateSet = useMemo(() => new Set(selectedWeekDates), [selectedWeekDates]);
  const weekEntries = useMemo(
    () => entries.filter((entry) => weekDateSet.has(entry.date)),
    [entries, weekDateSet],
  );
  const weekCellSumMap = useMemo(() => buildExpenseCellSumMap(weekEntries), [weekEntries]);
  const monthDailyBreakdowns = useMemo(() => {
    const map: Record<string, { income: number; spend: number }> = {};

    monthEntries.forEach((entry) => {
      const current = map[entry.date] ?? { income: 0, spend: 0 };

      map[entry.date] = {
        income:
          entry.bucket === "INCOME"
            ? current.income + entry.amountInt
            : current.income,
        spend:
          entry.bucket === "INCOME"
            ? current.spend
            : current.spend + entry.amountInt,
      };
    });

    return map;
  }, [monthEntries]);

  const weekRows = useMemo(
    () =>
      selectedWeekDates.map((date) => {
        const info = calendarMap[date];
        const dayOfWeek = info?.dow ?? getDayOfWeekKST(date);
        const isHoliday = info?.isHoliday ?? false;
        const isSunday = info ? info.dow === 0 : false;
        const isSaturday = info ? info.dow === 6 : false;
        const income = weekCellSumMap.get(`${date}|INCOME`) ?? 0;
        const subscription = weekEntries
          .filter((entry) =>
            entry.date === date &&
            matchesExpenseCell(entry, "SUBSCRIPTION", "Subscription"),
          )
          .reduce((sum, entry) => sum + entry.amountInt, 0);
        const rent = weekEntries
          .filter((entry) =>
            entry.date === date && matchesExpenseCell(entry, "SUBSCRIPTION", "Rent"),
          )
          .reduce((sum, entry) => sum + entry.amountInt, 0);
        const debt = weekEntries
          .filter((entry) =>
            entry.date === date && matchesExpenseCell(entry, "SUBSCRIPTION", "Debt"),
          )
          .reduce((sum, entry) => sum + entry.amountInt, 0);
        const plus = weekCellSumMap.get(`${date}|PLUS`) ?? 0;
        const spending = weekCellSumMap.get(`${date}|SPENDING`) ?? 0;
        const dailyTotal = income - (subscription + rent + debt + plus + spending);

        return {
          date,
          weekday: weekdayLabel(dayOfWeek),
          isSunday,
          isSaturday,
          isHoliday,
          holidayName: info?.holidayName,
          INCOME: income,
          SUBSCRIPTION_ONLY: subscription,
          RENT: rent,
          DEBT: debt,
          PLUS: plus,
          SPENDING: spending,
          dailyTotal,
          isToday: date === todayKst,
          isOutsideSelectedMonth: !date.startsWith(`${selectedMonth}-`),
        };
      }),
    [calendarMap, selectedMonth, selectedWeekDates, todayKst, weekCellSumMap, weekEntries],
  );

  const weeklyTotals = useMemo(
    () =>
      weekRows.reduce(
        (acc, row) => ({
          income: acc.income + row.INCOME,
          subscription: acc.subscription + row.SUBSCRIPTION_ONLY,
          rent: acc.rent + row.RENT,
          debt: acc.debt + row.DEBT,
          plus: acc.plus + row.PLUS,
          spending: acc.spending + row.SPENDING,
          dailyTotal: acc.dailyTotal + row.dailyTotal,
        }),
        {
          income: 0,
          subscription: 0,
          rent: 0,
          debt: 0,
          plus: 0,
          spending: 0,
          dailyTotal: 0,
        },
      ),
    [weekRows],
  );

  const monthlyBucketTotals = useMemo(
    () => summarizeExpenseBuckets(monthEntries),
    [monthEntries],
  );

  const monthlyNet = useMemo(
    () => computeDailyNetFromBucketTotals(monthlyBucketTotals),
    [monthlyBucketTotals],
  );
  const monthlyBucketChartData = useMemo<MonthlyBucketBarPoint[]>(
    () => [
      { category: "Income", amountInt: monthlyBucketTotals.INCOME },
      { category: "Subscription", amountInt: monthlyBucketTotals.SUBSCRIPTION },
      { category: "Plus", amountInt: monthlyBucketTotals.PLUS },
      { category: "Spending", amountInt: monthlyBucketTotals.SPENDING },
    ],
    [monthlyBucketTotals],
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
  const monthlySplitTotals = useMemo(
    () => ({
      income: monthlyBucketTotals.INCOME,
      subscription: monthlySubcategoryTotals.Subscription,
      rent: monthlySubcategoryTotals.Rent,
      debt: monthlySubcategoryTotals.Debt,
      plus: monthlyBucketTotals.PLUS,
      spending: monthlyBucketTotals.SPENDING,
      dailyTotal: monthlyNet,
    }),
    [monthlyBucketTotals, monthlyNet, monthlySubcategoryTotals],
  );
  const monthlyTotalSpendInt = useMemo(
    () =>
      monthlyBucketTotals.SUBSCRIPTION +
      monthlyBucketTotals.PLUS +
      monthlyBucketTotals.SPENDING,
    [monthlyBucketTotals],
  );

  useEffect(() => {
    let cancelled = false;
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
          `/api/calendar-days?from=${calendarFetchRange.from}&to=${calendarFetchRange.to}&country=KR`,
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
  }, [calendarFetchRange.from, calendarFetchRange.to, selectedMonth]);

  const selectedCellEntries = useMemo(() => {
    if (!selectedCell) {
      return [];
    }

    return listExpenseEntriesByCell(
      entries,
      selectedCell.date,
      selectedCell.bucket,
      selectedCell.subcategory,
    );
  }, [entries, selectedCell]);

  return (
    <>
      <ExpenditureHeaderBar
        loading={loading}
        monthlyTotalSpendInt={monthlyTotalSpendInt}
        selectedMonth={selectedMonth}
        selectedDate={selectedDate}
        selectedWeekLabel={formatWeekRangeCompact(selectedWeekRange.from, selectedWeekRange.to)}
        onMonthChange={(value) => {
          const nextMonth = value || getCurrentMonthKST();
          setSelectedMonth(nextMonth);
          setSelectedDate(defaultSelectedDateForMonth(nextMonth, todayKst));
        }}
      />

      {!authLoading && !isAuthed ? (
        <SectionCard>
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </SectionCard>
      ) : null}

      <ExpenditureMonthCalendar
        month={selectedMonth}
        selectedDate={selectedDate}
        selectedWeekDates={selectedWeekDates}
        today={todayKst}
        calendarMap={calendarMap}
        dailyBreakdowns={monthDailyBreakdowns}
        onSelectDate={setSelectedDate}
      />

      <ExpenditureWeekSection
        rangeLabel={formatWeekRangeCompact(selectedWeekRange.from, selectedWeekRange.to)}
        rows={weekRows}
        loading={loading}
        isAuthed={isAuthed}
        weeklyTotals={weeklyTotals}
        monthlyTotals={monthlySplitTotals}
        onSelectCell={(cell) => setSelectedCell(cell)}
      />

      <ExpenditureChartsSection
        monthlyBucketChartData={monthlyBucketChartData}
        monthlySubcategoryPieData={monthlySubcategoryPieData}
        monthlyTotalSpendInt={monthlyTotalSpendInt}
      />

      <ExpenseCellModal
        open={Boolean(selectedCell)}
        date={selectedCell?.date ?? ""}
        bucket={selectedCell?.bucket ?? "INCOME"}
        subcategory={selectedCell?.subcategory}
        titleOverride={selectedCell?.title}
        entries={selectedCellEntries}
        onClose={() => setSelectedCell(null)}
        onCreate={(input) => {
          if (!isAuthed) {
            window.alert("로그인 후 사용 가능합니다.");
            return;
          }
          create(input);
        }}
        onUpdate={(id, input) => {
          if (!isAuthed) {
            window.alert("로그인 후 사용 가능합니다.");
            return;
          }
          update(id, input);
        }}
        onDelete={(id) => {
          if (!isAuthed) {
            window.alert("로그인 후 사용 가능합니다.");
            return;
          }
          remove(id);
        }}
      />
    </>
  );
}
