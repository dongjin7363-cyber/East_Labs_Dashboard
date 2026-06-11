"use client";

import { EmptyState } from "@/components/common/EmptyState";
import { MemoEntry, MemoSentiment, MemoType } from "@/lib/models/types";
import { formatKST } from "@/lib/utils/time";

interface MemoEntriesListProps {
  loading: boolean;
  selectedDate?: string;
  entries: MemoEntry[];
  editingId: string | null;
  onSelectEntry: (id: string) => void;
  onZoomImage: (url: string) => void;
  title?: string;
  emptyTitle?: string;
  showDate?: boolean;
}

const TYPE_ICON: Record<MemoType, string> = {
  "Market Note": "🔴",
  "Investment Idea": "🟢",
  Macro: "🟠",
  "Trading Diary": "🔵",
};

const SENTIMENT_ICON: Record<MemoSentiment, string> = {
  Bear: "🐻",
  Neutral: "⚪",
  Bull: "🐂",
};

function memoTypeClass(type: MemoType): string {
  return type.toLowerCase().replace(/\s+/g, "-");
}

export function MemoEntriesList({
  loading,
  selectedDate,
  entries,
  editingId,
  onSelectEntry,
  onZoomImage,
  title,
  emptyTitle,
  showDate = false,
}: MemoEntriesListProps) {
  return (
    <section className="memo-day-panel">
      <div className="panel-header-inline" style={{ marginBottom: 10 }}>
        <h3>{title ?? `${selectedDate} 메모`}</h3>
        <span className="panel-submetric">{entries.length}건</span>
      </div>

      <div className={`memo-day-list${showDate ? " memo-feed-list" : ""}`}>
        {loading ? (
          <EmptyState title="로딩 중..." compact />
        ) : entries.length === 0 ? (
          <EmptyState title={emptyTitle ?? "해당 날짜 메모가 없습니다."} compact />
        ) : (
          entries.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className={`memo-day-card is-${memoTypeClass(entry.memoType)}${editingId === entry.id ? " is-selected" : ""}`}
              onClick={() => onSelectEntry(entry.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectEntry(entry.id);
                }
              }}
            >
              <div className="memo-day-card-meta">
                <span className="memo-type-chip">
                  <span aria-hidden="true">{TYPE_ICON[entry.memoType]}</span>
                  {entry.memoType}
                </span>
                {entry.sentiment ? (
                  <span className="memo-sentiment-chip">
                    <span aria-hidden="true">{SENTIMENT_ICON[entry.sentiment]}</span>
                    {entry.sentiment}
                  </span>
                ) : null}
              </div>
              <strong className="memo-day-card-title">{entry.title}</strong>
              <div className="memo-day-card-comment">{entry.content || entry.comment || "-"}</div>
              {entry.buyTickers || entry.sellTickers ? (
                <div className="memo-legacy-tickers">
                  {entry.buyTickers ? <span>Buy {entry.buyTickers}</span> : null}
                  {entry.sellTickers ? <span>Sell {entry.sellTickers}</span> : null}
                </div>
              ) : null}
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
                {showDate ? entry.date : `Updated ${formatKST(entry.updatedAt)}`}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

export default MemoEntriesList;
