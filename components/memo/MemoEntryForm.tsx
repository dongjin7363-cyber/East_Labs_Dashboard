"use client";

import { useEffect, useRef, useState } from "react";
import { MEMO_TYPES, MemoType } from "@/lib/models/types";

const TYPE_OPTION_PREFIX: Record<MemoType, string> = {
  "Market Note": "🔴",
  "Investment Idea": "🟢",
  Macro: "🟠",
  "Trading Diary": "🔵",
};

interface MemoEntryFormProps {
  isEditing: boolean;
  titleInput: string;
  contentInput: string;
  memoTypeInput: MemoType;
  selectedDate: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onMemoTypeChange: (value: MemoType) => void;
  onDateChange: (value: string) => void;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
  isAuthed: boolean;
  canDelete: boolean;
}

export function MemoEntryForm({
  isEditing,
  titleInput,
  contentInput,
  memoTypeInput,
  selectedDate,
  onTitleChange,
  onContentChange,
  onMemoTypeChange,
  onDateChange,
  onNew,
  onSave,
  onDelete,
  isAuthed,
  canDelete,
}: MemoEntryFormProps) {
  const [titleOpen, setTitleOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const showTitle = titleOpen || Boolean(titleInput);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight + 2}px`;
  }, [contentInput]);

  useEffect(() => {
    setTitleOpen(false);
  }, [isEditing]);

  return (
    <section className="memo-form-wrap" aria-label={isEditing ? "메모 편집" : "메모 작성"}>
      <div className="memo-composer-top">
        {showTitle ? (
          <input
            aria-label="제목 (선택)"
            className="memo-title-input"
            value={titleInput}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="제목 (선택)"
            disabled={!isAuthed}
          />
        ) : (
          <button type="button" className="memo-title-toggle" onClick={() => setTitleOpen(true)} disabled={!isAuthed}>
            + 제목
          </button>
        )}
        <select
          aria-label="메모 유형"
          value={memoTypeInput}
          onChange={(event) => onMemoTypeChange(event.target.value as MemoType)}
          disabled={!isAuthed}
        >
          {MEMO_TYPES.map((type) => (
            <option key={type} value={type}>{TYPE_OPTION_PREFIX[type]} {type}</option>
          ))}
        </select>
      </div>
      <textarea
        ref={textareaRef}
        aria-label="메모 본문"
        className="memo-composer-content"
        rows={2}
        value={contentInput}
        onChange={(event) => onContentChange(event.target.value)}
        placeholder="오늘의 시장 판단을 기록하세요."
        disabled={!isAuthed}
        required
      />
      <div className="memo-composer-footer">
        <input
          type="date"
          aria-label="메모 날짜"
          value={selectedDate}
          onChange={(event) => { if (event.target.value) onDateChange(event.target.value); }}
          disabled={!isAuthed}
          required
        />
        <button type="button" className="primary-button" onClick={onSave} disabled={!isAuthed || !contentInput.trim()}>
          {isEditing ? "수정 저장" : "저장"}
        </button>
      </div>
      {isEditing ? (
        <div className="memo-edit-actions">
        <button
          type="button"
          className="ghost-button"
          onClick={onNew}
          disabled={!isAuthed}
        >
          편집 취소
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={onDelete}
          disabled={!isAuthed || !canDelete}
        >
          삭제
        </button>
        </div>
      ) : null}
    </section>
  );
}

export default MemoEntryForm;
