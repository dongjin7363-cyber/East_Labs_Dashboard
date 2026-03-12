"use client";

import { useEffect, useMemo, useState } from "react";
import { ScheduleCalendarSection } from "@/components/schedule/ScheduleCalendarSection";
import { ScheduleEventForm } from "@/components/schedule/ScheduleEventForm";
import { ScheduleWeekTodoBoard } from "@/components/schedule/ScheduleWeekTodoBoard";
import { useSchedule } from "@/lib/hooks/useSchedule";
import { ScheduleEvent, ScheduleTodo } from "@/lib/models/types";
import {
  getDatesInRange,
  getDatesInMonthFromYm,
  getMonthRangeFromYm,
  getWeekRangeSundayStart,
  getDayOfWeekKST,
  toYm,
  todayKstYmd,
} from "@/lib/utils/date";

interface CalendarDayMeta {
  date: string;
  dow: number;
  isHoliday: boolean;
}

interface CalendarDaysApiResponse {
  days?: CalendarDayMeta[];
}

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

function groupEventsByDate(events: ScheduleEvent[]): Map<string, ScheduleEvent[]> {
  const grouped = new Map<string, ScheduleEvent[]>();

  events.forEach((event) => {
    const current = grouped.get(event.date) ?? [];
    grouped.set(event.date, [...current, event]);
  });

  return grouped;
}

function groupTodosByDate(todos: ScheduleTodo[]): Map<string, ScheduleTodo[]> {
  const grouped = new Map<string, ScheduleTodo[]>();

  todos.forEach((todo) => {
    const current = grouped.get(todo.date) ?? [];
    grouped.set(todo.date, [...current, todo]);
  });

  return grouped;
}

export default function SchedulePage() {
  const {
    events,
    todos,
    loading,
    createEvent,
    updateEvent,
    removeEvent,
    createTodo,
    toggleTodo,
    removeTodo,
  } = useSchedule();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  const today = todayKstYmd();
  const monthRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);
  const monthDates = useMemo(() => getDatesInMonthFromYm(selectedMonth), [selectedMonth]);
  const weekRange = useMemo(() => getWeekRangeSundayStart(selectedDate), [selectedDate]);
  const weekDates = useMemo(
    () => getDatesInRange(weekRange.from, weekRange.to),
    [weekRange.from, weekRange.to],
  );

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const todosByDate = useMemo(() => groupTodosByDate(todos), [todos]);
  const selectedDateEvents = useMemo(
    () => [...(eventsByDate.get(selectedDate) ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [eventsByDate, selectedDate],
  );

  const leadingBlankCount = useMemo(() => {
    const firstDate = monthDates[0];
    return firstDate ? getDayOfWeekKST(firstDate) : 0;
  }, [monthDates]);

  useEffect(() => {
    const range = getMonthRangeFromYm(selectedMonth);

    if (selectedDate < range.from || selectedDate > range.to) {
      setSelectedDate(range.from);
    }
  }, [selectedDate, selectedMonth]);

  useEffect(() => {
    let cancelled = false;

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
        const nextMap: Record<string, CalendarDayInfo> = {};

        (data.days ?? []).forEach((day) => {
          nextMap[day.date] = {
            dow: day.dow,
            isHoliday: day.isHoliday,
          };
        });

        if (!cancelled) {
          setCalendarMap(nextMap);
        }
      } catch {
        if (!cancelled) {
          setCalendarMap({});
        }
      }
    };

    void loadCalendarDays();

    return () => {
      cancelled = true;
    };
  }, [monthRange.from, monthRange.to]);

  return (
    <div className="schedule-page">
      <ScheduleCalendarSection
        selectedMonth={selectedMonth}
        monthDates={monthDates}
        leadingBlankCount={leadingBlankCount}
        calendarMap={calendarMap}
        eventsByDate={eventsByDate}
        selectedDate={selectedDate}
        today={today}
        weekRange={weekRange}
        onMonthChange={(value) => {
          const nextMonth = value || toYm(new Date());
          setSelectedMonth(nextMonth);
          if (!selectedDate.startsWith(nextMonth)) {
            setSelectedDate(`${nextMonth}-01`);
          }
        }}
        onSelectDate={(date) => {
          setSelectedDate(date);
          setIsEventModalOpen(true);
        }}
      />

      <ScheduleWeekTodoBoard
        weekDates={weekDates}
        selectedDate={selectedDate}
        today={today}
        todosByDate={todosByDate}
        calendarMap={calendarMap}
        onCreateTodo={(input) => createTodo({ ...input, isDone: false })}
        onToggleTodo={toggleTodo}
        onDeleteTodo={removeTodo}
      />

      <ScheduleEventForm
        open={isEventModalOpen}
        date={selectedDate}
        events={selectedDateEvents}
        onClose={() => setIsEventModalOpen(false)}
        onCreate={createEvent}
        onUpdate={updateEvent}
        onDelete={removeEvent}
      />

      {loading ? <div className="schedule-loading-indicator">일정을 불러오는 중...</div> : null}
    </div>
  );
}
