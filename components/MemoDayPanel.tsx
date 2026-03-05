"use client";

import { useState } from "react";
import { MemoEntry } from "@/lib/models/types";
import { formatKST } from "@/lib/utils/time";
import { Modal } from "@/components/Modal";

interface MemoDayPanelProps {
  selectedDate: string;
  entries: MemoEntry[];
  selectedEntryId: string | null;
  onSelectEntry: (entry: MemoEntry) => void;
}

interface LightboxState {
  url: string;
  label: string;
}

export function MemoDayPanel({
  selectedDate,
  entries,
  selectedEntryId,
  onSelectEntry,
}: MemoDayPanelProps) {
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [brokenMap, setBrokenMap] = useState<Record<string, boolean>>({});

  return (
    <section className="memo-day-panel">
      <div className="panel-header-inline">
        <h3>{selectedDate}</h3>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">해당 날짜 메모가 없습니다.</div>
      ) : (
        <div className="memo-day-list">
          {entries.map((entry) => (
            <div
              key={entry.id}
              role="button"
              tabIndex={0}
              className={`memo-day-card ${selectedEntryId === entry.id ? "is-selected" : ""}`}
              onClick={() => onSelectEntry(entry)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectEntry(entry);
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
                    const imageKey = `${entry.id}:${path}`;
                    const signedUrl = entry.imageSignedUrls?.[path] ?? null;
                    const broken = brokenMap[imageKey];

                    return (
                      <button
                        key={imageKey}
                        type="button"
                        className="memo-day-thumb"
                        onClick={(event) => {
                          event.stopPropagation();

                          if (signedUrl && !broken) {
                            setLightbox({
                              url: signedUrl,
                              label: entry.date,
                            });
                          }
                        }}
                      >
                        {signedUrl && !broken ? (
                          <img
                            src={signedUrl}
                            alt="memo attachment"
                            onError={() => {
                              setBrokenMap((prev) => ({
                                ...prev,
                                [imageKey]: true,
                              }));
                            }}
                          />
                        ) : (
                          <span className="memo-day-thumb-fallback">이미지 없음</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="memo-day-card-time">{formatKST(entry.updatedAt)}</div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(lightbox)}
        title="Memo Image"
        onClose={() => setLightbox(null)}
        cardClassName="market-zoom-modal-card"
      >
        <div className="market-zoom-image-wrap">
          {lightbox ? (
            <img src={lightbox.url} alt={lightbox.label} className="market-zoom-image" />
          ) : null}
        </div>
      </Modal>
    </section>
  );
}
