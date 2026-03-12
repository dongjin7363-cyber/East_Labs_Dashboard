"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import MemoCalendarSection from "@/components/memo/MemoCalendarSection";
import { useMemos } from "@/lib/hooks/useMemos";
import { getDatesInMonthFromYm, getMonthRangeFromYm, toYm, todayKstYmd } from "@/lib/utils/date";
import { formatKST } from "@/lib/utils/time";

interface CalendarDayMeta {
  date: string;
  dow: number;
  isHoliday: boolean;
}

interface CalendarDaysApiResponse {
  days?: CalendarDayMeta[];
}

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

export default function MemoPage() {
  const { entries, loading, authLoading, isAuthenticated, create, update, remove } = useMemos();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buyTickersInput, setBuyTickersInput] = useState("");
  const [sellTickersInput, setSellTickersInput] = useState("");
  const [commentInput, setCommentInput] = useState("");
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const isAuthed = isAuthenticated;
  const today = useMemo(() => todayKstYmd(), []);

  const monthRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);
  const monthDates = useMemo(() => getDatesInMonthFromYm(selectedMonth), [selectedMonth]);
  const monthEntries = useMemo(
    () => entries.filter((entry) => entry.date >= monthRange.from && entry.date <= monthRange.to),
    [entries, monthRange.from, monthRange.to],
  );

  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, typeof monthEntries>();

    monthEntries.forEach((entry) => {
      const current = grouped.get(entry.date) ?? [];
      grouped.set(entry.date, [...current, entry]);
    });

    return grouped;
  }, [monthEntries]);

  const selectedDateEntries = useMemo(
    () =>
      [...(entriesByDate.get(selectedDate) ?? [])].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      ),
    [entriesByDate, selectedDate],
  );

  const selectedEntry = useMemo(
    () => selectedDateEntries.find((entry) => entry.id === editingId),
    [editingId, selectedDateEntries],
  );

  const leadingBlankCount = useMemo(() => {
    const firstDate = monthDates[0];

    if (!firstDate) {
      return 0;
    }

    return new Date(`${firstDate}T00:00:00`).getDay();
  }, [monthDates]);

  useEffect(() => {
    const range = getMonthRangeFromYm(selectedMonth);

    if (selectedDate < range.from || selectedDate > range.to) {
      setSelectedDate(range.from);
      setEditingId(null);
    }
  }, [selectedDate, selectedMonth]);

  useEffect(() => {
    let cancelled = false;

    const loadCalendarDays = async () => {
      try {
        const response = await fetch(
          `/api/calendar-days?from=${monthRange.from}&to=${monthRange.to}&country=KR`,
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error(`calendar-days API error: ${response.status}`);
        }

        const data = (await response.json()) as CalendarDaysApiResponse;
        const nextMap: Record<string, CalendarDayInfo> = {};

        (data.days ?? []).forEach((day) => {
          nextMap[day.date] = {
            dow: day.dow,
            isHoliday: day.isHoliday,
          };
        });

        if (!cancelled) {
          setCalendarMap(nextMap);
        }
      } catch {
        if (!cancelled) {
          setCalendarMap({});
        }
      }
    };

    void loadCalendarDays();

    return () => {
      cancelled = true;
    };
  }, [monthRange.from, monthRange.to]);

  useEffect(() => {
    if (!selectedEntry) {
      setBuyTickersInput("");
      setSellTickersInput("");
      setCommentInput("");
      return;
    }

    setBuyTickersInput(selectedEntry.buyTickers ?? "");
    setSellTickersInput(selectedEntry.sellTickers ?? "");
    setCommentInput(selectedEntry.comment ?? "");
  }, [selectedEntry]);

  const handleNew = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    setEditingId(null);
    setBuyTickersInput("");
    setSellTickersInput("");
    setCommentInput("");
  };

  const handleSave = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const payload = {
      date: selectedDate,
      buyTickers: buyTickersInput,
      sellTickers: sellTickersInput,
      comment: commentInput,
      imagePaths: selectedEntry?.imagePaths ?? [],
    };

    if (editingId && selectedEntry) {
      update(editingId, payload);
      return;
    }

    create(payload);
    setBuyTickersInput("");
    setSellTickersInput("");
    setCommentInput("");
  };

  const handleDelete = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!editingId || !selectedEntry) {
      return;
    }

    if (!window.confirm("이 메모를 삭제할까요?")) {
      return;
    }

    remove(editingId);
    setEditingId(null);
    setBuyTickersInput("");
    setSellTickersInput("");
    setCommentInput("");
  };

  return (
    <>
      <section className="memo-page-header">
        <h1>Memo</h1>
        <div className="filter-row memo-header-row memo-page-actions">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) =>
                setSelectedMonth(event.target.value || toYm(new Date()))
              }
            />
          </label>
          <div className="memo-selected-date">
            <span>선택 날짜</span>
            <strong>{selectedDate}</strong>
          </div>
        </div>
      </section>

      {!authLoading && !isAuthed ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      <section className="panel memo-layout">
        <MemoCalendarSection
          selectedMonth={selectedMonth}
          monthDates={monthDates}
          leadingBlankCount={leadingBlankCount}
          calendarMap={calendarMap}
          entriesCountByDate={new Map(
            Array.from(entriesByDate.entries()).map(([date, items]) => [date, items.length]),
          )}
          selectedDate={selectedDate}
          today={today}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setEditingId(null);
          }}
        />

        <section className="memo-right-panel">
          <section className="memo-form-wrap">
            <div className="panel-header-inline" style={{ marginBottom: 10 }}>
              <h3>{editingId ? "메모 수정" : "새 메모"}</h3>
              <button
                type="button"
                className="ghost-button"
                onClick={handleNew}
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
                  onChange={(event) => setBuyTickersInput(event.target.value)}
                  placeholder="AAPL, NVDA"
                  disabled={!isAuthed}
                />
              </label>
              <label className="full">
                매도 종목 (Sell Tickers)
                <input
                  value={sellTickersInput}
                  onChange={(event) => setSellTickersInput(event.target.value)}
                  placeholder="TSLA"
                  disabled={!isAuthed}
                />
              </label>
              <label className="full">
                코멘트 (Comment)
                <textarea
                  rows={6}
                  value={commentInput}
                  onChange={(event) => setCommentInput(event.target.value)}
                  placeholder="매매 회고/시장 대응 기록"
                  disabled={!isAuthed}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                type="button"
                className="primary-button"
                onClick={handleSave}
                disabled={!isAuthed}
              >
                Save
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={handleDelete}
                disabled={!isAuthed || !editingId}
              >
                Delete
              </button>
            </div>
          </section>

          <section className="memo-day-panel">
            <div className="panel-header-inline" style={{ marginBottom: 10 }}>
              <h3>{selectedDate} 메모</h3>
              <span className="panel-submetric">
                {selectedDateEntries.length}건
              </span>
            </div>

            <div className="memo-day-list">
              {loading ? (
                <div className="empty-state">로딩 중...</div>
              ) : selectedDateEntries.length === 0 ? (
                <div className="empty-state">해당 날짜 메모가 없습니다.</div>
              ) : (
                selectedDateEntries.map((entry) => (
                  <div
                    key={entry.id}
                    role="button"
                    tabIndex={0}
                    className={`memo-day-card${editingId === entry.id ? " is-selected" : ""}`}
                    onClick={() => setEditingId(entry.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditingId(entry.id);
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
                                  setZoomImageUrl(signed);
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
        </section>
      </section>

      <Modal
        open={Boolean(zoomImageUrl)}
        title="Memo Image"
        onClose={() => setZoomImageUrl(null)}
        cardClassName="market-zoom-modal-card"
      >
        {zoomImageUrl ? (
          <div className="market-zoom-image-wrap">
            <img className="market-zoom-image" src={zoomImageUrl} alt="memo zoom" />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
