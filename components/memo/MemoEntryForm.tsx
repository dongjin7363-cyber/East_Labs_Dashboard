"use client";

interface MemoEntryFormProps {
  isEditing: boolean;
  buyTickersInput: string;
  sellTickersInput: string;
  commentInput: string;
  onBuyTickersChange: (value: string) => void;
  onSellTickersChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onNew: () => void;
  onSave: () => void;
  onDelete: () => void;
  isAuthed: boolean;
  canDelete: boolean;
}

export function MemoEntryForm({
  isEditing,
  buyTickersInput,
  sellTickersInput,
  commentInput,
  onBuyTickersChange,
  onSellTickersChange,
  onCommentChange,
  onNew,
  onSave,
  onDelete,
  isAuthed,
  canDelete,
}: MemoEntryFormProps) {
  return (
    <section className="memo-form-wrap">
      <div className="panel-header-inline" style={{ marginBottom: 10 }}>
        <h3>{isEditing ? "메모 수정" : "새 메모"}</h3>
        <button
          type="button"
          className="ghost-button"
          onClick={onNew}
          disabled={!isAuthed}
        >
          New
        </button>
      </div>
      <div className="form-grid">
        <label className="full">
          매수 종목 (Buy Tickers)
          <input
            value={buyTickersInput}
            onChange={(event) => onBuyTickersChange(event.target.value)}
            placeholder="AAPL, NVDA"
            disabled={!isAuthed}
          />
        </label>
        <label className="full">
          매도 종목 (Sell Tickers)
          <input
            value={sellTickersInput}
            onChange={(event) => onSellTickersChange(event.target.value)}
            placeholder="TSLA"
            disabled={!isAuthed}
          />
        </label>
        <label className="full">
          코멘트 (Comment)
          <textarea
            rows={6}
            value={commentInput}
            onChange={(event) => onCommentChange(event.target.value)}
            placeholder="매매 회고/시장 대응 기록"
            disabled={!isAuthed}
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
