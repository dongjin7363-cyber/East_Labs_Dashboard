"use client";

import { useEffect, useMemo } from "react";

interface MemoEntryFormValue {
  buyTickers: string;
  sellTickers: string;
  comment: string;
}

interface MemoImageItem {
  path: string;
  url: string | null;
}

interface MemoEntryFormProps {
  value: MemoEntryFormValue;
  disabled: boolean;
  isEditing: boolean;
  existingImages: MemoImageItem[];
  pendingFiles: File[];
  onNew: () => void;
  onChange: (next: MemoEntryFormValue) => void;
  onPendingFilesChange: (next: File[]) => void;
  onSave: () => void;
  onDelete: () => void;
}

export function MemoEntryForm({
  value,
  disabled,
  isEditing,
  existingImages,
  pendingFiles,
  onNew,
  onChange,
  onPendingFilesChange,
  onSave,
  onDelete,
}: MemoEntryFormProps) {
  const pendingPreviews = useMemo(
    () =>
      pendingFiles.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [pendingFiles],
  );

  useEffect(() => {
    return () => {
      pendingPreviews.forEach((preview) => {
        URL.revokeObjectURL(preview.url);
      });
    };
  }, [pendingPreviews]);

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

        <label className="full">
          첨부 이미지
          <input
            type="file"
            multiple
            accept="image/*"
            disabled={disabled}
            onChange={(event) => {
              const files = event.target.files
                ? Array.from(event.target.files)
                : [];
              onPendingFilesChange(files);
            }}
          />
        </label>
      </div>

      {existingImages.length > 0 ? (
        <div className="memo-image-section">
          <div className="memo-image-section-title">기존 이미지 {existingImages.length}건</div>
          <div className="memo-image-grid">
            {existingImages.map((image) => (
              <div key={image.path} className="memo-image-thumb-wrap">
                {image.url ? (
                  <img src={image.url} alt="memo attachment" className="memo-image-thumb" />
                ) : (
                  <div className="memo-image-thumb-fallback">이미지 로드 실패</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {pendingPreviews.length > 0 ? (
        <div className="memo-image-section">
          <div className="memo-image-section-title">저장 예정 이미지 {pendingPreviews.length}건</div>
          <div className="memo-image-grid">
            {pendingPreviews.map((preview) => (
              <div key={preview.url} className="memo-image-thumb-wrap">
                <img src={preview.url} alt={preview.name} className="memo-image-thumb" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="form-actions">
        <button type="button" className="secondary-button" onClick={onNew} disabled={disabled}>
          New
        </button>
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
