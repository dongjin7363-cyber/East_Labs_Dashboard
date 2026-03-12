"use client";

import CalendarDayNumber from "@/components/common/CalendarDayNumber";
import { ScheduleEvent } from "@/lib/models/types";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

interface ScheduleCalendarSectionProps {
  selectedMonth: string;
  monthDates: string[];
  leadingBlankCount: number;
  calendarMap: Record<string, CalendarDayInfo>;
  eventsByDate: Map<string, ScheduleEvent[]>;
  selectedDate: string;
  today: string;
  weekRange: { from: string; to: string };
  onMonthChange: (value: string) => void;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

export function ScheduleCalendarSection({
  selectedMonth,
  monthDates,
  leadingBlankCount,
  calendarMap,
  eventsByDate,
  selectedDate,
  today,
  weekRange,
  onMonthChange,
  onSelectDate,
}: ScheduleCalendarSectionProps) {
  return (
    <section className="schedule-calendar-wrap panel">
      <div className="schedule-calendar-toolbar">
        <label className="schedule-calendar-month-control">
          <span>월 선택</span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </label>
      </div>
      <div className="schedule-calendar-grid schedule-calendar-weekdays">
        {WEEKDAY_LABELS.map((label, index) => {
          const isRed = index === 0;
          const isBlue = index === 6;

          return (
            <div
              key={label}
              className={`schedule-calendar-weekday${isRed ? " is-red" : isBlue ? " is-blue" : ""}`}
            >
              {label}
            </div>
          );
        })}
      </div>
      <div className="schedule-calendar-grid">
        {Array.from({ length: leadingBlankCount }).map((_, index) => (
          <div key={`blank-${index}`} className="schedule-calendar-day blank" />
        ))}

        {monthDates.map((date) => {
          const info = calendarMap[date];
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const isInWeek = date >= weekRange.from && date <= weekRange.to;
          const isRed = Boolean(info?.isHoliday) || info?.dow === 0;
          const isBlue = !isRed && info?.dow === 6;
          const dayEvents = eventsByDate.get(date) ?? [];
          const visibleEvents = dayEvents.slice(0, 3);
          const hiddenCount = Math.max(dayEvents.length - visibleEvents.length, 0);

          return (
            <button
              key={date}
              type="button"
              className={`schedule-calendar-day${isToday ? " is-today" : ""}${isSelected ? " selected" : ""}${isInWeek ? " is-week-selected" : ""}`}
              onClick={() => onSelectDate(date)}
            >
              <CalendarDayNumber
                value={date.slice(-2)}
                isToday={isToday}
                tone={isRed ? "red" : isBlue ? "blue" : "default"}
              />
              <div className="schedule-day-events">
                {visibleEvents.map((event) => (
                  <span
                    key={event.id}
                    className={`schedule-day-chip schedule-chip-${event.colorKey}`}
                    title={`${event.startTime} ${event.title}`}
                  >
                    {event.startTime} {event.title}
                  </span>
                ))}
                {hiddenCount > 0 ? (
                  <span className="schedule-day-chip schedule-day-chip-more">+{hiddenCount}</span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default ScheduleCalendarSection;
