"use client";

import CalendarDayNumber from "@/components/common/CalendarDayNumber";
import { MemoEntry, MemoType } from "@/lib/models/types";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

interface MemoCalendarSectionProps {
  selectedMonth: string;
  monthDates: string[];
  leadingBlankCount: number;
  calendarMap: Record<string, CalendarDayInfo>;
  entriesByDate: Map<string, MemoEntry[]>;
  selectedDate: string;
  today: string;
  onSelectDate: (date: string) => void;
  onMonthChange: (month: string) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function memoTypeClass(type: MemoType): string {
  return type.toLowerCase().replace(/\s+/g, "-");
}

export function MemoCalendarSection({
  selectedMonth,
  monthDates,
  leadingBlankCount,
  calendarMap,
  entriesByDate,
  selectedDate,
  today,
  onSelectDate,
  onMonthChange,
}: MemoCalendarSectionProps) {
  const [year, month] = selectedMonth.split("-").map(Number);
  const moveMonth = (offset: number) => {
    const date = new Date(year, month - 1 + offset, 1);
    onMonthChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
  };
  return (
    <section className="memo-calendar-wrap">
      <div className="memo-calendar-caption">
        <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
        <strong>{year}년 {month}월</strong>
        <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
      </div>
      <div className="memo-calendar-grid memo-calendar-weekdays">
        {WEEKDAY_LABELS.map((label, index) => {
          const isRed = index === 0;
          const isBlue = index === 6;

          return (
            <div
              key={label}
              className={`memo-calendar-weekday${isRed ? " is-red" : isBlue ? " is-blue" : ""}`}
            >
              {label}
            </div>
          );
        })}
      </div>
      <div className="memo-calendar-grid">
        {Array.from({ length: leadingBlankCount }).map((_, index) => (
          <div key={`blank-${index}`} className="memo-calendar-day blank" />
        ))}

        {monthDates.map((date) => {
          const info = calendarMap[date];
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const dow = info?.dow ?? new Date(`${date}T00:00:00`).getDay();
          const isRed = Boolean(info?.isHoliday) || dow === 0;
          const isBlue = !isRed && dow === 6;
          const entries = entriesByDate.get(date) ?? [];

          return (
            <button
              key={date}
              type="button"
              aria-label={`${date}, 메모 ${entries.length}건`}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
              className={`memo-calendar-day${isToday ? " is-today" : ""}${isSelected ? " selected" : ""}`}
              onClick={() => onSelectDate(date)}
            >
              <div className="memo-day-header">
                <CalendarDayNumber
                  value={Number(date.slice(-2))}
                  isToday={isToday}
                  tone={isRed ? "red" : isBlue ? "blue" : "default"}
                />
              </div>
              {entries.length > 0 ? (
                <div className="memo-day-dots" aria-label={`${entries.length} memos`}>
                  {Array.from(new Set(entries.map((entry) => entry.memoType))).map((type) => (
                    <span
                      key={type}
                      className={`memo-type-dot is-${memoTypeClass(type)}`}
                    />
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default MemoCalendarSection;
