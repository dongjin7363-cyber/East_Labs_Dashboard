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
}: MemoCalendarSectionProps) {
  return (
    <section className="memo-calendar-wrap">
      <div className="memo-calendar-caption">{selectedMonth}</div>
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
          const isRed = Boolean(info?.isHoliday) || info?.dow === 0;
          const isBlue = !isRed && info?.dow === 6;
          const entries = entriesByDate.get(date) ?? [];

          return (
            <button
              key={date}
              type="button"
              className={`memo-calendar-day${isToday ? " is-today" : ""}${isSelected ? " selected" : ""}`}
              onClick={() => onSelectDate(date)}
            >
              <div className="memo-day-header">
                <CalendarDayNumber
                  value={date.slice(-2)}
                  isToday={isToday}
                  tone={isRed ? "red" : isBlue ? "blue" : "default"}
                />
              </div>
              {entries.length > 0 ? (
                <div className="memo-day-dots" aria-label={`${entries.length} memos`}>
                  {entries.map((entry, index) => (
                    <span
                      key={`${entry.id}-${index}`}
                      className={`memo-type-dot is-${memoTypeClass(entry.memoType)}`}
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
