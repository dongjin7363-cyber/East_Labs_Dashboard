"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { ScheduleColorKey, ScheduleEvent, SCHEDULE_COLOR_KEYS } from "@/lib/models/types";
import { ScheduleEventInput } from "@/lib/services/scheduleService";

interface ScheduleEventFormProps {
  open: boolean;
  date: string;
  events: ScheduleEvent[];
  onClose: () => void;
  onCreate: (input: ScheduleEventInput) => void | Promise<void>;
  onUpdate: (id: string, input: ScheduleEventInput) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
}

const COLOR_LABELS: Record<ScheduleColorKey, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  blue: "Blue",
  purple: "Purple",
  black: "Black",
};

function emptyInput(date: string): ScheduleEventInput {
  return {
    date,
    startTime: "09:00",
    endTime: "",
    title: "",
    categoryName: "",
    colorKey: "blue",
    note: "",
  };
}

export function ScheduleEventForm({
  open,
  date,
  events,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: ScheduleEventFormProps) {
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.createdAt.localeCompare(b.createdAt)),
    [events],
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState<ScheduleEventInput>(() => emptyInput(date));

  const selectedEvent = useMemo(
    () => sortedEvents.find((event) => event.id === editingId),
    [editingId, sortedEvents],
  );

  useEffect(() => {
    setEditingId(null);
    setInput(emptyInput(date));
  }, [date, open]);

  useEffect(() => {
    if (!selectedEvent) {
      setInput(emptyInput(date));
      return;
    }

    setInput({
      date: selectedEvent.date,
      startTime: selectedEvent.startTime,
      endTime: selectedEvent.endTime ?? "",
      title: selectedEvent.title,
      categoryName: selectedEvent.categoryName,
      colorKey: selectedEvent.colorKey,
      note: selectedEvent.note ?? "",
    });
  }, [date, selectedEvent]);

  const handleSave = async () => {
    if (!input.title.trim() || !input.categoryName.trim() || !input.startTime.trim()) {
      window.alert("시작 시간, 제목, 카테고리를 입력하세요.");
      return;
    }

    if (editingId && selectedEvent) {
      await onUpdate(editingId, input);
      return;
    }

    await onCreate(input);
    setInput(emptyInput(date));
  };

  const handleDelete = async () => {
    if (!editingId || !selectedEvent) {
      return;
    }

    if (!window.confirm("이 일정을 삭제할까요?")) {
      return;
    }

    await onDelete(editingId);
    setEditingId(null);
    setInput(emptyInput(date));
  };

  return (
    <Modal open={open} title={`일정 입력 · ${date}`} onClose={onClose} cardClassName="schedule-event-modal">
      <div className="schedule-event-modal-body">
        <div className="schedule-event-list">
          <div className="schedule-event-list-header">
            <strong>일정 목록</strong>
            <button type="button" className="ghost-button" onClick={() => setEditingId(null)}>
              New
            </button>
          </div>
          {sortedEvents.length > 0 ? (
            <div className="schedule-event-list-items">
              {sortedEvents.map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className={`schedule-event-item${editingId === event.id ? " is-active" : ""}`}
                  onClick={() => setEditingId(event.id)}
                >
                  <span className={`schedule-event-dot schedule-chip-${event.colorKey}`} aria-hidden="true" />
                  <div className="schedule-event-item-copy">
                    <strong>{event.title}</strong>
                    <span>
                      {event.startTime}
                      {event.endTime ? ` - ${event.endTime}` : ""} · {event.categoryName}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <p className="schedule-empty-text">등록된 일정이 없습니다.</p>
          )}
        </div>

        <div className="schedule-event-form-shell">
          <div className="schedule-event-form-grid">
            <label>
              날짜
              <input
                type="date"
                value={input.date}
                onChange={(event) => setInput((current) => ({ ...current, date: event.target.value || date }))}
              />
            </label>
            <label>
              시작 시간
              <input
                type="time"
                value={input.startTime}
                onChange={(event) => setInput((current) => ({ ...current, startTime: event.target.value }))}
              />
            </label>
            <label>
              종료 시간
              <input
                type="time"
                value={input.endTime ?? ""}
                onChange={(event) => setInput((current) => ({ ...current, endTime: event.target.value }))}
              />
            </label>
            <label>
              일정 제목
              <input
                type="text"
                value={input.title}
                placeholder="예: 팀 미팅"
                onChange={(event) => setInput((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label>
              카테고리명
              <input
                type="text"
                value={input.categoryName}
                placeholder="예: 운동 / 병원 / 공부"
                onChange={(event) => setInput((current) => ({ ...current, categoryName: event.target.value }))}
              />
            </label>
            <label>
              색상
              <select
                value={input.colorKey}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    colorKey: event.target.value as ScheduleColorKey,
                  }))
                }
              >
                {SCHEDULE_COLOR_KEYS.map((colorKey) => (
                  <option key={colorKey} value={colorKey}>
                    {COLOR_LABELS[colorKey]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            메모
            <textarea
              rows={4}
              value={input.note ?? ""}
              placeholder="상세 메모"
              onChange={(event) => setInput((current) => ({ ...current, note: event.target.value }))}
            />
          </label>

          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={() => setInput(emptyInput(date))}>
              New
            </button>
            <button type="button" className="primary-button" onClick={() => void handleSave()}>
              Save
            </button>
            <button type="button" className="danger-button" onClick={() => void handleDelete()} disabled={!editingId}>
              Delete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ScheduleEventForm;
