"use client";

interface MemoEntryFormValue {
  buyTickers: string;
  sellTickers: string;
  comment: string;
}

interface MemoEntryFormProps {
  value: MemoEntryFormValue;
  disabled: boolean;
  isEditing: boolean;
  onChange: (next: MemoEntryFormValue) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function MemoEntryForm({
  value,
  disabled,
  isEditing,
  onChange,
  onSave,
  onDelete,
}: MemoEntryFormProps) {
  return (
    <section className="memo-form-wrap">
      <div className="form-grid">
        <label className="full">
          매수 종목 (Buy Tickers)
          <input
            placeholder="예: PLTR, AAPL"
            value={value.buyTickers}
            onChange={(event) =>
              onChange({
                ...value,
                buyTickers: event.target.value,
              })
            }
            disabled={disabled}
          />
        </label>

        <label className="full">
          매도 종목 (Sell Tickers)
          <input
            placeholder="예: TSLA"
            value={value.sellTickers}
            onChange={(event) =>
              onChange({
                ...value,
                sellTickers: event.target.value,
              })
            }
            disabled={disabled}
          />
        </label>

        <label className="full">
          코멘트 (Comment)
          <textarea
            rows={8}
            placeholder="오늘의 대응/복기"
            value={value.comment}
            onChange={(event) =>
              onChange({
                ...value,
                comment: event.target.value,
              })
            }
            disabled={disabled}
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="primary-button" onClick={onSave} disabled={disabled}>
          Save
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={onDelete}
          disabled={disabled || !isEditing}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
