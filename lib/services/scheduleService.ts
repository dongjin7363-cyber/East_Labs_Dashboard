import { ScheduleColorKey, ScheduleEvent, ScheduleTodo, SCHEDULE_COLOR_KEYS } from "@/lib/models/types";
import { deserializeScheduleEvent } from "@/lib/repository/mappers/scheduleEventMapper";
import { deserializeScheduleTodo } from "@/lib/repository/mappers/scheduleTodoMapper";

const SCHEDULE_EVENTS_STORAGE_KEY = "pf_schedule_events_v1";
const SCHEDULE_TODOS_STORAGE_KEY = "pf_schedule_todos_v1";
const STORAGE_VERSION = 1;

interface ScheduleEventsStorageSchema {
  schemaVersion: number;
  events: ScheduleEvent[];
  updatedAt: string;
}

interface ScheduleTodosStorageSchema {
  schemaVersion: number;
  todos: ScheduleTodo[];
  updatedAt: string;
}

export interface ScheduleEventInput {
  date: string;
  startTime: string;
  endTime?: string;
  title: string;
  categoryName: string;
  colorKey: ScheduleColorKey;
  note?: string;
}

export interface ScheduleTodoInput {
  date: string;
  text: string;
  isDone?: boolean;
  sortOrder?: number;
}

function isClient(): boolean {
  return typeof window !== "undefined";
}

function emptyEventsSchema(): ScheduleEventsStorageSchema {
  return {
    schemaVersion: STORAGE_VERSION,
    events: [],
    updatedAt: new Date().toISOString(),
  };
}

function emptyTodosSchema(): ScheduleTodosStorageSchema {
  return {
    schemaVersion: STORAGE_VERSION,
    todos: [],
    updatedAt: new Date().toISOString(),
  };
}

function normalizeTime(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return /^\d{2}:\d{2}$/.test(normalized) ? normalized : undefined;
}

function normalizeColorKey(value: unknown): ScheduleColorKey {
  if (typeof value === "string") {
    const matched = SCHEDULE_COLOR_KEYS.find((item) => item === value);

    if (matched) {
      return matched;
    }
  }

  return "blue";
}

function sortEvents(events: ScheduleEvent[]): ScheduleEvent[] {
  return [...events].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byTime = a.startTime.localeCompare(b.startTime);

    if (byTime !== 0) {
      return byTime;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function sortTodos(todos: ScheduleTodo[]): ScheduleTodo[] {
  return [...todos].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

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

function readEventsSchema(): ScheduleEventsStorageSchema {
  if (!isClient()) {
    return emptyEventsSchema();
  }

  try {
    const raw = window.localStorage.getItem(SCHEDULE_EVENTS_STORAGE_KEY);

    if (!raw) {
      return emptyEventsSchema();
    }

    const parsed = JSON.parse(raw) as { schemaVersion?: number; events?: unknown[]; updatedAt?: string };

    if (parsed.schemaVersion !== STORAGE_VERSION || !Array.isArray(parsed.events)) {
      return emptyEventsSchema();
    }

    return {
      schemaVersion: STORAGE_VERSION,
      events: sortEvents(
        parsed.events
          .map((item, index) => deserializeScheduleEvent(item, index))
          .filter((item): item is ScheduleEvent => Boolean(item)),
      ),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyEventsSchema();
  }
}

function writeEventsSchema(schema: ScheduleEventsStorageSchema): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    SCHEDULE_EVENTS_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: STORAGE_VERSION,
      events: sortEvents(schema.events),
      updatedAt: new Date().toISOString(),
    }),
  );
}

function readTodosSchema(): ScheduleTodosStorageSchema {
  if (!isClient()) {
    return emptyTodosSchema();
  }

  try {
    const raw = window.localStorage.getItem(SCHEDULE_TODOS_STORAGE_KEY);

    if (!raw) {
      return emptyTodosSchema();
    }

    const parsed = JSON.parse(raw) as { schemaVersion?: number; todos?: unknown[]; updatedAt?: string };

    if (parsed.schemaVersion !== STORAGE_VERSION || !Array.isArray(parsed.todos)) {
      return emptyTodosSchema();
    }

    return {
      schemaVersion: STORAGE_VERSION,
      todos: sortTodos(
        parsed.todos
          .map((item, index) => deserializeScheduleTodo(item, index))
          .filter((item): item is ScheduleTodo => Boolean(item)),
      ),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyTodosSchema();
  }
}

function writeTodosSchema(schema: ScheduleTodosStorageSchema): void {
  if (!isClient()) {
    return;
  }

  window.localStorage.setItem(
    SCHEDULE_TODOS_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: STORAGE_VERSION,
      todos: sortTodos(schema.todos),
      updatedAt: new Date().toISOString(),
    }),
  );
}

export function listScheduleEvents(): ScheduleEvent[] {
  return readEventsSchema().events;
}

export function replaceScheduleEvents(events: ScheduleEvent[]): void {
  writeEventsSchema({
    ...readEventsSchema(),
    events: sortEvents(
      events.map((event) => ({
        ...event,
        startTime: normalizeTime(event.startTime) ?? "09:00",
        endTime: normalizeTime(event.endTime),
        colorKey: normalizeColorKey(event.colorKey),
        title: event.title.trim(),
        categoryName: event.categoryName.trim(),
        note: event.note?.trim() || undefined,
      })),
    ),
  });
}

export function listScheduleTodos(): ScheduleTodo[] {
  return readTodosSchema().todos;
}

export function replaceScheduleTodos(todos: ScheduleTodo[]): void {
  writeTodosSchema({
    ...readTodosSchema(),
    todos: sortTodos(
      todos.map((todo) => ({
        ...todo,
        text: todo.text.trim(),
        isDone: todo.isDone === true,
        sortOrder: Number.isFinite(todo.sortOrder) ? Math.max(Math.round(todo.sortOrder), 0) : 0,
      })),
    ),
  });
}
