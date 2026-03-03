"use client";

import { MemoEntry } from "@/lib/models/types";
import { formatKST } from "@/lib/utils/time";

interface MemoDayPanelProps {
  selectedDate: string;
  entries: MemoEntry[];
  selectedEntryId: string | null;
  disabled: boolean;
  onNew: () => void;
  onSelectEntry: (entry: MemoEntry) => void;
}

function previewText(text: string): string {
  if (text.length <= 120) {
    return text;
  }

  return `${text.slice(0, 120)}...`;
}

export function MemoDayPanel({
  selectedDate,
  entries,
  selectedEntryId,
  disabled,
  onNew,
  onSelectEntry,
}: MemoDayPanelProps) {
  return (
    <section className="memo-day-panel">
      <div className="panel-header-inline">
        <h3>{selectedDate}</h3>
        <button type="button" className="secondary-button" onClick={onNew} disabled={disabled}>
          New
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">해당 날짜 메모가 없습니다.</div>
      ) : (
        <div className="memo-day-list">
          {entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`memo-day-card ${selectedEntryId === entry.id ? "is-selected" : ""}`}
              onClick={() => onSelectEntry(entry)}
            >
              <div className="memo-day-card-line">
                <strong>Buy</strong>
                <span>{entry.buyTickers || "-"}</span>
              </div>
              <div className="memo-day-card-line">
                <strong>Sell</strong>
                <span>{entry.sellTickers || "-"}</span>
              </div>
              <div className="memo-day-card-comment">{previewText(entry.comment || "-")}</div>
              <div className="memo-day-card-time">
                {formatKST(entry.updatedAt)}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
