"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import MemoCalendarSection from "@/components/memo/MemoCalendarSection";
import MemoEntriesList from "@/components/memo/MemoEntriesList";
import MemoEntryForm from "@/components/memo/MemoEntryForm";
import { useMemos } from "@/lib/hooks/useMemos";
import { getDatesInMonthFromYm, getMonthRangeFromYm, toYm, todayKstYmd } from "@/lib/utils/date";

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
        (a.updatedAt || a.createdAt || "").localeCompare(b.updatedAt || b.createdAt || ""),
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

      <section className="memo-layout">
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

        <MemoEntryForm
          isEditing={Boolean(editingId)}
          buyTickersInput={buyTickersInput}
          sellTickersInput={sellTickersInput}
          commentInput={commentInput}
          onBuyTickersChange={setBuyTickersInput}
          onSellTickersChange={setSellTickersInput}
          onCommentChange={setCommentInput}
          onNew={handleNew}
          onSave={handleSave}
          onDelete={handleDelete}
          isAuthed={isAuthed}
          canDelete={Boolean(editingId)}
        />
      </section>

      <MemoEntriesList
        loading={loading}
        selectedDate={selectedDate}
        entries={selectedDateEntries}
        editingId={editingId}
        onSelectEntry={setEditingId}
        onZoomImage={setZoomImageUrl}
      />

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
