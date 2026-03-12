"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { ScheduleEvent, ScheduleTodo } from "@/lib/models/types";
import {
  createScheduleEventRepository,
  createScheduleTodoRepository,
  LocalScheduleEventRepository,
  LocalScheduleTodoRepository,
  SCHEDULE_EVENTS_SYNCED_FLAG_KEY,
  SCHEDULE_TODOS_SYNCED_FLAG_KEY,
  SupabaseScheduleEventRepository,
  SupabaseScheduleTodoRepository,
} from "@/lib/repository/scheduleRepository";
import {
  replaceScheduleEvents,
  replaceScheduleTodos,
  ScheduleEventInput,
  ScheduleTodoInput,
} from "@/lib/services/scheduleService";
import { createId } from "@/lib/utils/id";

function toErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
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

function buildEvent(input: ScheduleEventInput, base: Pick<ScheduleEvent, "id" | "createdAt">): ScheduleEvent {
  const nowIso = new Date().toISOString();

  return {
    id: base.id,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime?.trim() || undefined,
    title: input.title.trim(),
    categoryName: input.categoryName.trim(),
    colorKey: input.colorKey,
    note: input.note?.trim() || undefined,
    createdAt: base.createdAt,
    updatedAt: nowIso,
  };
}

function buildTodo(input: ScheduleTodoInput, base: Pick<ScheduleTodo, "id" | "createdAt">): ScheduleTodo {
  const nowIso = new Date().toISOString();

  return {
    id: base.id,
    date: input.date,
    text: input.text.trim(),
    isDone: input.isDone === true,
    sortOrder: Number.isFinite(input.sortOrder) ? Math.max(Math.round(input.sortOrder as number), 0) : 0,
    createdAt: base.createdAt,
    updatedAt: nowIso,
  };
}

export function useSchedule() {
  const { userId, loading: authLoading, isAuthenticated } = useAuth();
  const eventRepository = useMemo(() => createScheduleEventRepository(userId), [userId]);
  const todoRepository = useMemo(() => createScheduleTodoRepository(userId), [userId]);
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [todos, setTodos] = useState<ScheduleTodo[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const eventSyncAttemptedUserRef = useRef<string | null>(null);
  const todoSyncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      eventSyncAttemptedUserRef.current = null;
      todoSyncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      let nextEvents = await eventRepository.getEvents();
      let nextTodos = await todoRepository.getTodos();

      if (userId) {
        const alreadySyncedEvents =
          typeof window !== "undefined" &&
          window.localStorage.getItem(SCHEDULE_EVENTS_SYNCED_FLAG_KEY) === "true";
        const alreadySyncedTodos =
          typeof window !== "undefined" &&
          window.localStorage.getItem(SCHEDULE_TODOS_SYNCED_FLAG_KEY) === "true";

        if (!alreadySyncedEvents && nextEvents.length === 0 && eventSyncAttemptedUserRef.current !== userId) {
          eventSyncAttemptedUserRef.current = userId;
          const localEvents = await new LocalScheduleEventRepository().getEvents();

          if (localEvents.length > 0) {
            const cloudEventRepo = new SupabaseScheduleEventRepository(userId);

            for (const event of localEvents) {
              await cloudEventRepo.upsertEvent(event);
            }

            window.localStorage.setItem(SCHEDULE_EVENTS_SYNCED_FLAG_KEY, "true");
            nextEvents = await cloudEventRepo.getEvents();
          }
        }

        if (!alreadySyncedTodos && nextTodos.length === 0 && todoSyncAttemptedUserRef.current !== userId) {
          todoSyncAttemptedUserRef.current = userId;
          const localTodos = await new LocalScheduleTodoRepository().getTodos();

          if (localTodos.length > 0) {
            const cloudTodoRepo = new SupabaseScheduleTodoRepository(userId);

            for (const todo of localTodos) {
              await cloudTodoRepo.upsertTodo(todo);
            }

            window.localStorage.setItem(SCHEDULE_TODOS_SYNCED_FLAG_KEY, "true");
            nextTodos = await cloudTodoRepo.getTodos();
          }
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      const sortedEvents = sortEvents(nextEvents);
      const sortedTodos = sortTodos(nextTodos);
      setEvents(sortedEvents);
      setTodos(sortedTodos);
      replaceScheduleEvents(sortedEvents);
      replaceScheduleTodos(sortedTodos);
    } catch (error) {
      console.error("[schedule] failed to load", error);

      if (requestSeq === requestSeqRef.current) {
        const fallbackEvents = await new LocalScheduleEventRepository().getEvents();
        const fallbackTodos = await new LocalScheduleTodoRepository().getTodos();
        setEvents(sortEvents(fallbackEvents));
        setTodos(sortTodos(fallbackTodos));
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, eventRepository, todoRepository, userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createEvent = useCallback(
    async (input: ScheduleEventInput) => {
      const next = buildEvent(input, { id: createId(), createdAt: new Date().toISOString() });
      await eventRepository.upsertEvent(next, { isCreate: true });
      const updated = sortEvents(await eventRepository.getEvents());
      setEvents(updated);
      replaceScheduleEvents(updated);
    },
    [eventRepository],
  );

  const updateEvent = useCallback(
    async (id: string, input: ScheduleEventInput) => {
      const current = await eventRepository.getEvents();
      const target = current.find((item) => item.id === id);

      if (!target) {
        return;
      }

      await eventRepository.upsertEvent(buildEvent(input, { id: target.id, createdAt: target.createdAt }));
      const updated = sortEvents(await eventRepository.getEvents());
      setEvents(updated);
      replaceScheduleEvents(updated);
    },
    [eventRepository],
  );

  const removeEvent = useCallback(
    async (id: string) => {
      await eventRepository.deleteEvent(id);
      const updated = sortEvents(await eventRepository.getEvents());
      setEvents(updated);
      replaceScheduleEvents(updated);
    },
    [eventRepository],
  );

  const createTodo = useCallback(
    async (input: ScheduleTodoInput) => {
      const next = buildTodo(input, { id: createId(), createdAt: new Date().toISOString() });
      await todoRepository.upsertTodo(next, { isCreate: true });
      const updated = sortTodos(await todoRepository.getTodos());
      setTodos(updated);
      replaceScheduleTodos(updated);
    },
    [todoRepository],
  );

  const updateTodo = useCallback(
    async (id: string, input: ScheduleTodoInput) => {
      const current = await todoRepository.getTodos();
      const target = current.find((item) => item.id === id);

      if (!target) {
        return;
      }

      await todoRepository.upsertTodo(buildTodo(input, { id: target.id, createdAt: target.createdAt }));
      const updated = sortTodos(await todoRepository.getTodos());
      setTodos(updated);
      replaceScheduleTodos(updated);
    },
    [todoRepository],
  );

  const removeTodo = useCallback(
    async (id: string) => {
      await todoRepository.deleteTodo(id);
      const updated = sortTodos(await todoRepository.getTodos());
      setTodos(updated);
      replaceScheduleTodos(updated);
    },
    [todoRepository],
  );

  const toggleTodo = useCallback(
    async (id: string, isDone: boolean) => {
      const current = await todoRepository.getTodos();
      const target = current.find((item) => item.id === id);

      if (!target) {
        return;
      }

      await todoRepository.upsertTodo({ ...target, isDone, updatedAt: new Date().toISOString() });
      const updated = sortTodos(await todoRepository.getTodos());
      setTodos(updated);
      replaceScheduleTodos(updated);
    },
    [todoRepository],
  );

  return {
    events,
    todos,
    loading: loading || authLoading,
    isCloudMode: Boolean(userId),
    createEvent: async (input: ScheduleEventInput) => {
      try {
        await createEvent(input);
      } catch (error) {
        window.alert(`일정 저장 실패: ${toErrorMessage(error)}`);
      }
    },
    updateEvent: async (id: string, input: ScheduleEventInput) => {
      try {
        await updateEvent(id, input);
      } catch (error) {
        window.alert(`일정 수정 실패: ${toErrorMessage(error)}`);
      }
    },
    removeEvent: async (id: string) => {
      try {
        await removeEvent(id);
      } catch (error) {
        window.alert(`일정 삭제 실패: ${toErrorMessage(error)}`);
      }
    },
    createTodo: async (input: ScheduleTodoInput) => {
      try {
        await createTodo(input);
      } catch (error) {
        window.alert(`할 일 저장 실패: ${toErrorMessage(error)}`);
      }
    },
    updateTodo: async (id: string, input: ScheduleTodoInput) => {
      try {
        await updateTodo(id, input);
      } catch (error) {
        window.alert(`할 일 수정 실패: ${toErrorMessage(error)}`);
      }
    },
    removeTodo: async (id: string) => {
      try {
        await removeTodo(id);
      } catch (error) {
        window.alert(`할 일 삭제 실패: ${toErrorMessage(error)}`);
      }
    },
    toggleTodo: async (id: string, isDone: boolean) => {
      try {
        await toggleTodo(id, isDone);
      } catch (error) {
        window.alert(`할 일 상태 변경 실패: ${toErrorMessage(error)}`);
      }
    },
  };
}
