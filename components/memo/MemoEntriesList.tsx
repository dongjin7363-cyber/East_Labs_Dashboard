"use client";

import { MemoEntry } from "@/lib/models/types";
import { formatKST } from "@/lib/utils/time";

interface MemoEntriesListProps {
  loading: boolean;
  selectedDate: string;
  entries: MemoEntry[];
  editingId: string | null;
  onSelectEntry: (id: string) => void;
  onZoomImage: (url: string) => void;
}

export function MemoEntriesList({
  loading,
  selectedDate,
  entries,
  editingId,
  onSelectEntry,
  onZoomImage,
}: MemoEntriesListProps) {
  return (
    <section className="memo-day-panel">
      <div className="panel-header-inline" style={{ marginBottom: 10 }}>
        <h3>{selectedDate} 메모</h3>
        <span className="panel-submetric">{entries.length}건</span>
      </div>

      <div className="memo-day-list">
        {loading ? (
          <div className="empty-state">로딩 중...</div>
        ) : entries.length === 0 ? (
          <div className="empty-state">해당 날짜 메모가 없습니다.</div>
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className={`memo-day-card${editingId === entry.id ? " is-selected" : ""}`}
              onClick={() => onSelectEntry(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectEntry(entry.id);
                }
              }}
            >
              <div className="memo-day-card-line">
                <strong>Buy</strong>
                <span>{entry.buyTickers || "-"}</span>
              </div>
              <div className="memo-day-card-line">
                <strong>Sell</strong>
                <span>{entry.sellTickers || "-"}</span>
              </div>
              <div className="memo-day-card-comment">{entry.comment || "-"}</div>
              {entry.imagePaths.length > 0 ? (
                <div className="memo-day-thumb-strip">
                  {entry.imagePaths.map((path) => {
                    const signed = entry.imageSignedUrls?.[path] ?? null;

                    return (
                      <button
                        key={`${entry.id}-${path}`}
                        type="button"
                        className="memo-day-thumb"
                        onClick={(event) => {
                          event.stopPropagation();

                          if (signed) {
                            onZoomImage(signed);
                          }
                        }}
                      >
                        {signed ? (
                          <img src={signed} alt="memo attachment" />
                        ) : (
                          <span className="memo-day-thumb-fallback">이미지</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <div className="memo-day-card-time">
                Updated {formatKST(entry.updatedAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default MemoEntriesList;
