"use client";

import { MEMO_SENTIMENTS, MEMO_TYPES, MemoSentiment, MemoType } from "@/lib/models/types";

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
  sentimentInput: MemoSentiment | "";
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onMemoTypeChange: (value: MemoType) => void;
  onSentimentChange: (value: MemoSentiment | "") => void;
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
  sentimentInput,
  onTitleChange,
  onContentChange,
  onMemoTypeChange,
  onSentimentChange,
  onNew,
  onSave,
  onDelete,
  isAuthed,
  canDelete,
}: MemoEntryFormProps) {
  return (
    <section className="memo-form-wrap">
      <div className="panel-header-inline" style={{ marginBottom: 10 }}>
        <h3>{isEditing ? "저널 수정" : "새 저널"}</h3>
        <button
          type="button"
          className="ghost-button"
          onClick={onNew}
          disabled={!isAuthed}
        >
          New
        </button>
      </div>
      <div className="form-grid memo-form-grid">
        <label className="full">
          Title *
          <input
            value={titleInput}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="CPI 우려 지속"
            disabled={!isAuthed}
            required
          />
        </label>
        <label>
          Type *
          <select
            value={memoTypeInput}
            onChange={(event) => onMemoTypeChange(event.target.value as MemoType)}
            disabled={!isAuthed}
            required
          >
            {MEMO_TYPES.map((type) => (
              <option key={type} value={type}>
                {TYPE_OPTION_PREFIX[type]} {type}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sentiment
          <select
            value={sentimentInput}
            onChange={(event) => onSentimentChange(event.target.value as MemoSentiment | "")}
            disabled={!isAuthed}
          >
            <option value="">미선택</option>
            {MEMO_SENTIMENTS.map((sentiment) => (
              <option key={sentiment} value={sentiment}>
                {sentiment}
              </option>
            ))}
          </select>
        </label>
        <label className="full memo-form-comment-label">
          Content *
          <textarea
            className="memo-form-comment-textarea"
            rows={6}
            value={contentInput}
            onChange={(event) => onContentChange(event.target.value)}
            placeholder="시장 판단, 아이디어, 매매 회고를 기록"
            disabled={!isAuthed}
            required
          />
        </label>
      </div>
      <div className="form-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onSave}
          disabled={!isAuthed}
        >
          Save
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={onDelete}
          disabled={!isAuthed || !canDelete}
        >
          Delete
        </button>
      </div>
    </section>
  );
}

export default MemoEntryForm;
