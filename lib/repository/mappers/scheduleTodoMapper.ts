import { ScheduleTodo } from "@/lib/models/types";
import {
  normalizeIsoString,
  normalizeOptionalText,
  normalizeYmd,
  toNonNegativeInt,
} from "@/lib/repository/mappers/common";

export interface ScheduleTodoRow {
  id?: string;
  user_id: string;
  date: string;
  text: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function deserializeScheduleTodo(raw: unknown, index: number): ScheduleTodo | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeYmd(input.date);
  const text = normalizeOptionalText(input.text);

  if (!date || !text) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `schedule-todo-${index}`,
    date,
    text,
    isDone: input.isDone === true || input.is_done === true,
    sortOrder: toNonNegativeInt(input.sortOrder ?? input.sort_order),
    createdAt: normalizeIsoString(input.createdAt ?? input.created_at),
    updatedAt: normalizeIsoString(input.updatedAt ?? input.updated_at),
  };
}

export function serializeScheduleTodoRow(
  todo: ScheduleTodo,
  userId: string,
  options?: { isCreate?: boolean },
): ScheduleTodoRow {
  const row: ScheduleTodoRow = {
    user_id: userId,
    date: todo.date,
    text: normalizeOptionalText(todo.text) ?? "",
    is_done: todo.isDone === true,
    sort_order: toNonNegativeInt(todo.sortOrder),
    created_at: normalizeIsoString(todo.createdAt),
    updated_at: normalizeIsoString(todo.updatedAt),
  };

  if (!options?.isCreate && todo.id.trim()) {
    row.id = todo.id.trim();
  }

  return row;
}
