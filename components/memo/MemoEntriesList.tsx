"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { MemoEntry, MemoSentiment, MemoType } from "@/lib/models/types";
import { formatKST } from "@/lib/utils/time";

export type MemoTypeFilter = "All" | MemoType;

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
  typeFilterOptions?: MemoTypeFilter[];
  activeTypeFilter?: MemoTypeFilter;
  typeFilterCounts?: Record<MemoTypeFilter, number>;
  onTypeFilterChange?: (type: MemoTypeFilter) => void;
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

function memoTypeFilterClass(type: MemoTypeFilter): string {
  return type === "All" ? "all" : memoTypeClass(type);
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
  typeFilterOptions,
  activeTypeFilter,
  typeFilterCounts,
  onTypeFilterChange,
}: MemoEntriesListProps) {
  const feedGroups = useMemo(() => {
    const groups: { date: string; entries: MemoEntry[] }[] = [];

    entries.forEach((entry) => {
      const lastGroup = groups[groups.length - 1];

      if (lastGroup?.date === entry.date) {
        lastGroup.entries.push(entry);
        return;
      }

      groups.push({ date: entry.date, entries: [entry] });
    });

    return groups;
  }, [entries]);

  const renderEntryCard = (entry: MemoEntry) => (
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
  );

  return (
    <section className="memo-day-panel">
      <div className="panel-header-inline" style={{ marginBottom: 10 }}>
        <h3>{title ?? `${selectedDate} 메모`}</h3>
        <span className="panel-submetric">{entries.length}건</span>
      </div>

      {typeFilterOptions && activeTypeFilter && typeFilterCounts && onTypeFilterChange ? (
        <div className="memo-type-filter-row" aria-label="Memo type filter">
          {typeFilterOptions.map((type) => (
            <button
              key={type}
              type="button"
              className={`memo-type-filter-chip is-${memoTypeFilterClass(type)}${activeTypeFilter === type ? " is-active" : ""}`}
              aria-pressed={activeTypeFilter === type}
              onClick={() => onTypeFilterChange(type)}
            >
              <span>{type}</span>
              <strong>{typeFilterCounts[type]}</strong>
            </button>
          ))}
        </div>
      ) : null}

      <div className={`memo-day-list${showDate ? " memo-feed-list" : ""}`}>
        {loading ? (
          <EmptyState title="로딩 중..." compact />
        ) : entries.length === 0 ? (
          <EmptyState title={emptyTitle ?? "해당 날짜 메모가 없습니다."} compact />
        ) : showDate ? (
          <div className="memo-feed-groups">
            {feedGroups.map((group) => (
              <section key={group.date} className="memo-feed-date-group">
                <div className="memo-feed-date-divider">
                  <div className="memo-feed-date-meta">
                    <span>{group.date}</span>
                    <strong>{group.entries.length} Entries</strong>
                  </div>
                  <div className="memo-feed-date-line" />
                </div>
                <div className="memo-feed-date-cards">{group.entries.map(renderEntryCard)}</div>
              </section>
            ))}
          </div>
        ) : (
          entries.map(renderEntryCard)
        )}
      </div>
    </section>
  );
}

export default MemoEntriesList;
