"use client";

import { useMemo } from "react";
import { getDatesInMonthFromYm, getMonthRangeFromYm } from "@/lib/utils/date";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface MemoCalendarProps {
  month: string;
  selectedDate: string;
  today: string;
  countByDate: Record<string, number>;
  calendarMap: Record<string, CalendarDayInfo>;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function MemoCalendar({
  month,
  selectedDate,
  today,
  countByDate,
  calendarMap,
  onSelectDate,
}: MemoCalendarProps) {
  const monthRange = useMemo(() => getMonthRangeFromYm(month), [month]);
  const dates = useMemo(() => getDatesInMonthFromYm(month), [month]);

  const monthLabel = useMemo(() => {
    const [year, monthNum] = monthRange.from.split("-");
    return `${year}년 ${Number.parseInt(monthNum, 10)}월`;
  }, [monthRange.from]);

  const leadingBlankCount = useMemo(() => {
    const firstDayInfo = calendarMap[monthRange.from];

    if (firstDayInfo) {
      return firstDayInfo.dow;
    }

    const matched = monthRange.from.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!matched) {
      return 0;
    }

    const year = Number.parseInt(matched[1], 10);
    const monthNum = Number.parseInt(matched[2], 10);
    const day = Number.parseInt(matched[3], 10);
    const utcDate = new Date(Date.UTC(year, monthNum - 1, day));

    return utcDate.getUTCDay();
  }, [calendarMap, monthRange.from]);

  return (
    <section className="memo-calendar-wrap">
      <div className="memo-calendar-caption">{monthLabel}</div>

      <div className="memo-calendar-grid memo-calendar-weekdays">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`memo-calendar-weekday ${
              index === 0 ? "is-red" : index === 6 ? "is-blue" : ""
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="memo-calendar-grid memo-calendar-days">
        {Array.from({ length: leadingBlankCount }).map((_, index) => (
          <div key={`blank-${index}`} className="memo-calendar-day blank" />
        ))}

        {dates.map((date) => {
          const dayInfo = calendarMap[date];
          const count = countByDate[date] ?? 0;
          const day = Number.parseInt(date.slice(8, 10), 10);
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const isRed = Boolean(dayInfo?.isHoliday || dayInfo?.dow === 0);
          const isBlue = !isRed && dayInfo?.dow === 6;

          return (
            <button
              key={date}
              type="button"
              className={`memo-calendar-day ${isSelected ? "selected" : ""} ${
                isToday ? "is-today" : ""
              }`}
              onClick={() => onSelectDate(date)}
            >
              <span
                className={`memo-day-number ${
                  isRed ? "is-red" : isBlue ? "is-blue" : ""
                }`}
                title={dayInfo?.holidayName || ""}
              >
                {day}
              </span>
              {count > 0 ? <span className="memo-day-badge">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
