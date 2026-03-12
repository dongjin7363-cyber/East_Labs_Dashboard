import { ScheduleEvent, ScheduleTodo } from "@/lib/models/types";
import {
  deserializeScheduleEvent,
  serializeScheduleEventRow,
} from "@/lib/repository/mappers/scheduleEventMapper";
import {
  deserializeScheduleTodo,
  serializeScheduleTodoRow,
} from "@/lib/repository/mappers/scheduleTodoMapper";
import {
  listScheduleEvents,
  listScheduleTodos,
  replaceScheduleEvents,
  replaceScheduleTodos,
} from "@/lib/services/scheduleService";
import { supabase } from "@/lib/supabaseClient";

export const SCHEDULE_EVENTS_SYNCED_FLAG_KEY = "pf_synced_schedule_events_v1";
export const SCHEDULE_TODOS_SYNCED_FLAG_KEY = "pf_synced_schedule_todos_v1";

export interface ScheduleEventRepository {
  getEvents(): Promise<ScheduleEvent[]>;
  upsertEvent(event: ScheduleEvent, options?: { isCreate?: boolean }): Promise<void>;
  deleteEvent(id: string): Promise<void>;
}

export interface ScheduleTodoRepository {
  getTodos(): Promise<ScheduleTodo[]>;
  upsertTodo(todo: ScheduleTodo, options?: { isCreate?: boolean }): Promise<void>;
  deleteTodo(id: string): Promise<void>;
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

export class LocalScheduleEventRepository implements ScheduleEventRepository {
  async getEvents(): Promise<ScheduleEvent[]> {
    return sortEvents(listScheduleEvents());
  }

  async upsertEvent(event: ScheduleEvent): Promise<void> {
    const next = [...listScheduleEvents().filter((item) => item.id !== event.id), event];
    replaceScheduleEvents(sortEvents(next));
  }

  async deleteEvent(id: string): Promise<void> {
    replaceScheduleEvents(sortEvents(listScheduleEvents().filter((item) => item.id !== id)));
  }
}

export class LocalScheduleTodoRepository implements ScheduleTodoRepository {
  async getTodos(): Promise<ScheduleTodo[]> {
    return sortTodos(listScheduleTodos());
  }

  async upsertTodo(todo: ScheduleTodo): Promise<void> {
    const next = [...listScheduleTodos().filter((item) => item.id !== todo.id), todo];
    replaceScheduleTodos(sortTodos(next));
  }

  async deleteTodo(id: string): Promise<void> {
    replaceScheduleTodos(sortTodos(listScheduleTodos().filter((item) => item.id !== id)));
  }
}

export class SupabaseScheduleEventRepository implements ScheduleEventRepository {
  constructor(private readonly userId: string) {}

  async getEvents(): Promise<ScheduleEvent[]> {
    const { data, error } = await supabase
      .from("schedule_events")
      .select("id,date,start_time,end_time,title,category_name,color_key,note,created_at,updated_at")
      .eq("user_id", this.userId);

    if (error) {
      console.error("[schedule-events] failed to load", error);
      return [];
    }

    return sortEvents(
      (data ?? [])
        .map((row, index) => deserializeScheduleEvent(row, index))
        .filter((item): item is ScheduleEvent => Boolean(item)),
    );
  }

  async upsertEvent(event: ScheduleEvent, options?: { isCreate?: boolean }): Promise<void> {
    const row = serializeScheduleEventRow(event, this.userId, options);
    const { error } = await supabase.from("schedule_events").upsert([row], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteEvent(id: string): Promise<void> {
    const { error } = await supabase
      .from("schedule_events")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export class SupabaseScheduleTodoRepository implements ScheduleTodoRepository {
  constructor(private readonly userId: string) {}

  async getTodos(): Promise<ScheduleTodo[]> {
    const { data, error } = await supabase
      .from("schedule_todos")
      .select("id,date,text,is_done,sort_order,created_at,updated_at")
      .eq("user_id", this.userId);

    if (error) {
      console.error("[schedule-todos] failed to load", error);
      return [];
    }

    return sortTodos(
      (data ?? [])
        .map((row, index) => deserializeScheduleTodo(row, index))
        .filter((item): item is ScheduleTodo => Boolean(item)),
    );
  }

  async upsertTodo(todo: ScheduleTodo, options?: { isCreate?: boolean }): Promise<void> {
    const row = serializeScheduleTodoRow(todo, this.userId, options);
    const { error } = await supabase.from("schedule_todos").upsert([row], { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteTodo(id: string): Promise<void> {
    const { error } = await supabase
      .from("schedule_todos")
      .delete()
      .eq("id", id)
      .eq("user_id", this.userId);

    if (error) {
      throw error;
    }
  }
}

export function createScheduleEventRepository(userId?: string | null): ScheduleEventRepository {
  if (userId) {
    return new SupabaseScheduleEventRepository(userId);
  }

  return new LocalScheduleEventRepository();
}

export function createScheduleTodoRepository(userId?: string | null): ScheduleTodoRepository {
  if (userId) {
    return new SupabaseScheduleTodoRepository(userId);
  }

  return new LocalScheduleTodoRepository();
}
