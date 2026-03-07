"use client";

import { ExpenditureCalendar } from "@/components/expenditure/ExpenditureCalendar";
import { ComponentProps } from "react";

type CalendarProps = ComponentProps<typeof ExpenditureCalendar>;

interface ExpenditureMonthCalendarProps extends CalendarProps {
  selectedMonth: string;
  selectedWeekLabel: string;
  onMonthChange: (month: string) => void;
}

export function ExpenditureMonthCalendar({
  selectedMonth,
  selectedDate,
  selectedWeekLabel,
  onMonthChange,
  ...calendarProps
}: ExpenditureMonthCalendarProps) {
  return (
    <section className="panel">
      <div className="filter-row expense-calendar-controls">
        <label>
          월 선택
          <input
            type="month"
            value={selectedMonth}
            onChange={(event) => onMonthChange(event.target.value)}
          />
        </label>
        <div className="expense-selected-meta">
          <span className="expense-selected-meta-label">선택 날짜</span>
          <strong>{selectedDate}</strong>
        </div>
        <div className="expense-selected-meta">
          <span className="expense-selected-meta-label">선택 주</span>
          <strong>{selectedWeekLabel}</strong>
        </div>
      </div>

      <ExpenditureCalendar
        {...calendarProps}
        month={selectedMonth}
        selectedDate={selectedDate}
      />
    </section>
  );
}

export default ExpenditureMonthCalendar;
