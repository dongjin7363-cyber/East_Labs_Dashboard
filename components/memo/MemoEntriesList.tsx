"use client";

import { useMemo } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { MemoEntry, MemoType } from "@/lib/models/types";

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

function memoTypeClass(type: MemoType): string {
  return type.toLowerCase().replace(/\s+/g, "-");
}

function dateLabel(date: string): string {
  const value = new Date(`${date}T00:00:00`);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][value.getDay()];
  return `${value.getMonth() + 1}월 ${value.getDate()}일 · ${weekday}요일`;
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
      if (lastGroup?.date === entry.date) lastGroup.entries.push(entry);
      else groups.push({ date: entry.date, entries: [entry] });
    });
    return groups;
  }, [entries]);

  const renderEntryCard = (entry: MemoEntry) => {
    const content = entry.content || entry.comment || "";
    const entryTitle = entry.title || content.split("\n")[0] || "메모";
    return (
      <details key={entry.id} className={`memo-day-card is-${memoTypeClass(entry.memoType)}${editingId === entry.id ? " is-selected" : ""}`}>
        <summary aria-label={`${entryTitle} 전체 내용 보기`}>
          <div className="memo-day-card-meta">
            <span className="memo-type-chip"><span aria-hidden="true">{TYPE_ICON[entry.memoType]}</span>{entry.memoType}</span>
            <span className="memo-entry-chevron" aria-hidden="true">›</span>
          </div>
          <strong className="memo-day-card-title">{entryTitle}</strong>
          <div className="memo-entry-preview">{content || "-"}</div>
          {entry.imagePaths.length > 0 ? <span className="memo-attachment-count">첨부 {entry.imagePaths.length}개</span> : null}
        </summary>
        <div className="memo-entry-detail">
          <div className="memo-entry-body">{content || "-"}</div>
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
                  <button key={path} type="button" className="memo-day-thumb" aria-label="첨부 이미지 확대" disabled={!signed} onClick={() => { if (signed) onZoomImage(signed); }}>
                    {signed ? <img src={signed} alt="메모 첨부 이미지" /> : <span className="memo-day-thumb-fallback">이미지</span>}
                  </button>
                );
              })}
            </div>
          ) : null}
          <button type="button" className="ghost-button memo-entry-edit" onClick={() => onSelectEntry(entry.id)}>편집</button>
        </div>
      </details>
    );
  };

  return (
    <section className="memo-day-panel">
      <div className="memo-list-heading">
        <h3>{title ?? (selectedDate ? dateLabel(selectedDate) : "기록")}</h3>
        <span className="panel-submetric">{entries.length}건</span>
      </div>
      {typeFilterOptions && activeTypeFilter && typeFilterCounts && onTypeFilterChange ? (
        <div className="memo-type-filter-row" role="group" aria-label="메모 유형 필터">
          {typeFilterOptions.map((type) => (
            <button key={type} type="button" className={`memo-type-filter-chip is-${type === "All" ? "all" : memoTypeClass(type)}${activeTypeFilter === type ? " is-active" : ""}`} aria-pressed={activeTypeFilter === type} title={`${type === "All" ? "전체" : type} ${typeFilterCounts[type]}건`} onClick={() => onTypeFilterChange(type)}>
              {type !== "All" ? <span aria-hidden="true">{TYPE_ICON[type]}</span> : null}
              <span>{type === "All" ? "전체" : type}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className="memo-day-list">
        {loading ? <EmptyState title="로딩 중..." compact /> : entries.length === 0 ? (
          <EmptyState title={emptyTitle ?? "해당 날짜 메모가 없습니다."} compact />
        ) : showDate ? (
          <div className="memo-feed-groups">
            {feedGroups.map((group) => (
              <section key={group.date} className="memo-feed-date-group">
                <div className="memo-feed-date-meta"><span>{dateLabel(group.date)}</span><span>{group.entries.length}건</span></div>
                <div className="memo-feed-date-cards">{group.entries.map(renderEntryCard)}</div>
              </section>
            ))}
          </div>
        ) : entries.map(renderEntryCard)}
      </div>
    </section>
  );
}

export default MemoEntriesList;
