"use client";

import { useMemo } from "react";
import { TotalAssetSnapshot } from "@/lib/models/types";
import { getDatesInMonthFromYm, getMonthRangeFromYm } from "@/lib/utils/date";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface TotalAssetCalendarProps {
  month: string;
  selectedDate: string;
  today: string;
  snapshots: TotalAssetSnapshot[];
  calendarMap: Record<string, CalendarDayInfo>;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function fmtChangeMan(n: number): string | null {
  const man = Math.round(Math.abs(n) / 10_000);
  if (man === 0) return null;
  const sign = n > 0 ? "+" : "-";
  return `${sign}${man.toLocaleString("ko-KR")}만`;
}

export function TotalAssetCalendar({
  month,
  selectedDate,
  today,
  snapshots,
  calendarMap,
  onSelectDate,
}: TotalAssetCalendarProps) {
  const monthRange = useMemo(() => getMonthRangeFromYm(month), [month]);
  const dates = useMemo(() => getDatesInMonthFromYm(month), [month]);

  const monthLabel = useMemo(() => {
    const [year, monthNum] = monthRange.from.split("-");
    return `${year}년 ${Number.parseInt(monthNum, 10)}월`;
  }, [monthRange.from]);

  const leadingBlankCount = useMemo(() => {
    const firstDayInfo = calendarMap[monthRange.from];
    if (firstDayInfo) return firstDayInfo.dow;
    const matched = monthRange.from.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!matched) return 0;
    const utcDate = new Date(Date.UTC(+matched[1], +matched[2] - 1, +matched[3]));
    return utcDate.getUTCDay();
  }, [calendarMap, monthRange.from]);

  const changeByDate = useMemo(() => {
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const map = new Map<string, number>();
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];
      map.set(curr.date, curr.totalAssetKrwInt - prev.totalAssetKrwInt);
    }
    return map;
  }, [snapshots]);

  return (
    <section className="ta-calendar-wrap">
      <div className="ta-calendar-caption">{monthLabel}</div>
      <div className="fin-cal-grid">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="fin-cal-dow">{label}</div>
        ))}
        {Array.from({ length: leadingBlankCount }).map((_, index) => (
          <div key={`blank-${index}`} className="fin-cal-cell is-empty" />
        ))}
        {dates.map((date) => {
          const change = changeByDate.get(date);
          const dayInfo = calendarMap[date];
          const day = Number.parseInt(date.slice(8, 10), 10);
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const isRed = Boolean(dayInfo?.isHoliday || dayInfo?.dow === 0);
          const isBlue = !isRed && dayInfo?.dow === 6;

          let cls = "fin-cal-cell";
          if (isToday) cls += " is-today";
          if (isRed) cls += " is-sun";
          if (isBlue) cls += " is-sat";

          const changeText = change !== undefined && change !== 0
            ? fmtChangeMan(change)
            : null;

          return (
            <button
              key={date}
              type="button"
              className={cls}
              style={isSelected ? { outline: "2px solid #1D4ED8", outlineOffset: "-2px" } : undefined}
              onClick={() => onSelectDate(date)}
            >
              <span className="fin-cal-num">{day}</span>
              {changeText && change !== undefined && (
                <span className={`fin-cal-amt ${change > 0 ? "is-inc" : "is-exp"}`}>
                  {changeText}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
