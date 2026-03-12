import { ScheduleColorKey, ScheduleEvent, SCHEDULE_COLOR_KEYS } from "@/lib/models/types";
import {
  normalizeIsoString,
  normalizeOptionalText,
  normalizeYmd,
} from "@/lib/repository/mappers/common";

export interface ScheduleEventRow {
  id?: string;
  user_id: string;
  date: string;
  start_time: string;
  end_time: string | null;
  title: string;
  category_name: string;
  color_key: string;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeTime(value: unknown): string | undefined {
  const normalized = normalizeOptionalText(value);

  if (!normalized || !/^\d{2}:\d{2}$/.test(normalized)) {
    return undefined;
  }

  return normalized;
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

export function deserializeScheduleEvent(raw: unknown, index: number): ScheduleEvent | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const date = normalizeYmd(input.date);
  const startTime = normalizeTime(input.startTime ?? input.start_time);
  const title = normalizeOptionalText(input.title);
  const categoryName = normalizeOptionalText(input.categoryName ?? input.category_name);

  if (!date || !startTime || !title || !categoryName) {
    return null;
  }

  return {
    id: normalizeOptionalText(input.id) ?? `schedule-event-${index}`,
    date,
    startTime,
    endTime: normalizeTime(input.endTime ?? input.end_time),
    title,
    categoryName,
    colorKey: normalizeColorKey(input.colorKey ?? input.color_key),
    note: normalizeOptionalText(input.note),
    createdAt: normalizeIsoString(input.createdAt ?? input.created_at),
    updatedAt: normalizeIsoString(input.updatedAt ?? input.updated_at),
  };
}

export function serializeScheduleEventRow(
  event: ScheduleEvent,
  userId: string,
  options?: { isCreate?: boolean },
): ScheduleEventRow {
  const row: ScheduleEventRow = {
    user_id: userId,
    date: event.date,
    start_time: event.startTime,
    end_time: normalizeTime(event.endTime) ?? null,
    title: normalizeOptionalText(event.title) ?? "",
    category_name: normalizeOptionalText(event.categoryName) ?? "",
    color_key: normalizeColorKey(event.colorKey),
    note: normalizeOptionalText(event.note) ?? null,
    created_at: normalizeIsoString(event.createdAt),
    updated_at: normalizeIsoString(event.updatedAt),
  };

  if (!options?.isCreate && event.id.trim()) {
    row.id = event.id.trim();
  }

  return row;
}
