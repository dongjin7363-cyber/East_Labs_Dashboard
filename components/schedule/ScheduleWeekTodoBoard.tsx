"use client";

import { useState } from "react";
import { SectionCard } from "@/components/common/SectionCard";
import { ScheduleTodo } from "@/lib/models/types";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

interface ScheduleWeekTodoBoardProps {
  weekDates: string[];
  selectedDate: string;
  today: string;
  todosByDate: Map<string, ScheduleTodo[]>;
  calendarMap: Record<string, CalendarDayInfo>;
  onCreateTodo: (input: { date: string; text: string; sortOrder?: number }) => void | Promise<void>;
  onToggleTodo: (id: string, isDone: boolean) => void | Promise<void>;
  onDeleteTodo: (id: string) => void | Promise<void>;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

function sortTodos(todos: ScheduleTodo[]): ScheduleTodo[] {
  return [...todos].sort((a, b) => {
    const byDone = Number(a.isDone) - Number(b.isDone);

    if (byDone !== 0) {
      return byDone;
    }

    const byOrder = a.sortOrder - b.sortOrder;

    if (byOrder !== 0) {
      return byOrder;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function ScheduleWeekTodoBoard({
  weekDates,
  selectedDate,
  today,
  todosByDate,
  calendarMap,
  onCreateTodo,
  onToggleTodo,
  onDeleteTodo,
}: ScheduleWeekTodoBoardProps) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingByDate, setSavingByDate] = useState<Record<string, boolean>>({});

  const submitTodo = async (date: string) => {
    if (savingByDate[date]) {
      return;
    }

    const raw = inputs[date] ?? "";
    const text = raw.trim();

    if (!text) {
      return;
    }

    const existing = todosByDate.get(date) ?? [];

    setSavingByDate((current) => ({ ...current, [date]: true }));

    try {
      await onCreateTodo({
        date,
        text,
        sortOrder: existing.length,
      });
      setInputs((current) => ({ ...current, [date]: "" }));
    } finally {
      setSavingByDate((current) => ({ ...current, [date]: false }));
    }
  };

  return (
    <SectionCard title="주간 To Do">
      <div className="schedule-week-board">
        {weekDates.map((date) => {
          const info = calendarMap[date];
          const todos = sortTodos(todosByDate.get(date) ?? []);
          const isToday = date === today;
          const isSelected = date === selectedDate;
          const isRed = Boolean(info?.isHoliday) || info?.dow === 0;
          const isBlue = !isRed && info?.dow === 6;

          return (
            <section
              key={date}
              className={`schedule-week-card${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}`}
            >
              <header className="schedule-week-card-header">
                <strong className={`schedule-week-day-label${isRed ? " is-red" : isBlue ? " is-blue" : ""}${isToday ? " is-today" : ""}`}>
                  {WEEKDAY_LABELS[info?.dow ?? new Date(`${date}T00:00:00`).getDay()]} {Number.parseInt(date.slice(8, 10), 10)}
                </strong>
              </header>

              <div className="schedule-week-todo-list">
                {todos.length > 0 ? (
                  todos.map((todo) => (
                    <label key={todo.id} className={`schedule-todo-item${todo.isDone ? " is-done" : ""}`}>
                      <input
                        type="checkbox"
                        checked={todo.isDone}
                        onChange={(event) => void onToggleTodo(todo.id, event.target.checked)}
                      />
                      <span>{todo.text}</span>
                      <button type="button" className="schedule-todo-delete" onClick={() => void onDeleteTodo(todo.id)}>
                        ×
                      </button>
                    </label>
                  ))
                ) : null}
              </div>

              <form
                className="schedule-week-todo-input-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitTodo(date);
                }}
              >
                <input
                  type="text"
                  value={inputs[date] ?? ""}
                  placeholder="할 일 추가"
                  onChange={(event) =>
                    setInputs((current) => ({ ...current, [date]: event.target.value }))
                  }
                  disabled={Boolean(savingByDate[date])}
                />
              </form>
            </section>
          );
        })}
      </div>
    </SectionCard>
  );
}

export default ScheduleWeekTodoBoard;
