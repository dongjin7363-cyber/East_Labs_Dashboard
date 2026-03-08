"use client";

import { useMemo } from "react";
import { getDatesInMonthFromYm, getMonthRangeFromYm } from "@/lib/utils/date";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface ExpenditureCalendarProps {
  month: string;
  selectedDate: string;
  selectedWeekDates: string[];
  today: string;
  calendarMap: Record<string, CalendarDayInfo>;
  dailyBreakdowns: Record<string, { income: number; spend: number }>;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function fallbackDow(date: string): number {
  const matched = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!matched) {
    return 0;
  }

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function formatKrwCompact(amount: number): string {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function ExpenditureCalendar({
  month,
  selectedDate,
  selectedWeekDates,
  today,
  calendarMap,
  dailyBreakdowns,
  onSelectDate,
}: ExpenditureCalendarProps) {
  const monthRange = useMemo(() => getMonthRangeFromYm(month), [month]);
  const dates = useMemo(() => getDatesInMonthFromYm(month), [month]);
  const selectedWeekSet = useMemo(
    () => new Set(selectedWeekDates),
    [selectedWeekDates],
  );

  const monthLabel = useMemo(() => {
    const [year, monthNum] = monthRange.from.split("-");
    return `${year}년 ${Number.parseInt(monthNum, 10)}월`;
  }, [monthRange.from]);

  const leadingBlankCount = useMemo(() => {
    const firstDayInfo = calendarMap[monthRange.from];

    if (firstDayInfo) {
      return firstDayInfo.dow;
    }

    return fallbackDow(monthRange.from);
  }, [calendarMap, monthRange.from]);

  return (
    <section className="ta-calendar-wrap expense-calendar-wrap">
      <div className="ta-calendar-caption">{monthLabel}</div>

      <div className="ta-calendar-grid ta-calendar-weekdays">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`ta-calendar-weekday ${
              index === 0 ? "is-red" : index === 6 ? "is-blue" : ""
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="ta-calendar-grid ta-calendar-days">
        {Array.from({ length: leadingBlankCount }).map((_, index) => (
          <div key={`blank-${index}`} className="ta-calendar-day blank" />
        ))}

        {dates.map((date) => {
          const dayInfo = calendarMap[date];
          const breakdown = dailyBreakdowns[date];
          const day = Number.parseInt(date.slice(8, 10), 10);
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const isInSelectedWeek = selectedWeekSet.has(date);
          const isRed = Boolean(dayInfo?.isHoliday || dayInfo?.dow === 0);
          const isBlue = !isRed && dayInfo?.dow === 6;

          return (
            <button
              key={date}
              type="button"
              className={`ta-calendar-day expense-calendar-day ${
                isSelected ? "selected" : ""
              } ${isToday ? "is-today" : ""} ${
                isInSelectedWeek ? "in-week" : ""
              }`}
              onClick={() => onSelectDate(date)}
              title={dayInfo?.holidayName}
            >
              <span className={`ta-day-number ${isRed ? "is-red" : isBlue ? "is-blue" : ""}`}>
                {day}
              </span>
              <div className="expense-calendar-breakdown">
                {breakdown && breakdown.income > 0 ? (
                  <span className="expense-calendar-total is-positive">
                    {formatKrwCompact(breakdown.income)}
                  </span>
                ) : null}
                {breakdown && breakdown.spend > 0 ? (
                  <span className="expense-calendar-total is-negative">
                    -{formatKrwCompact(breakdown.spend)}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
