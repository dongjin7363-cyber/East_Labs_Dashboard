"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import MemoCalendarSection from "@/components/memo/MemoCalendarSection";
import MemoEntriesList, { type MemoTypeFilter } from "@/components/memo/MemoEntriesList";
import MemoEntryForm from "@/components/memo/MemoEntryForm";
import { useMemos } from "@/lib/hooks/useMemos";
import {
  DEFAULT_MEMO_TYPE,
  MEMO_TYPES,
  MemoEntry,
  MemoType,
} from "@/lib/models/types";
import { getDatesInMonthFromYm, getMonthRangeFromYm, todayKstYmd } from "@/lib/utils/date";

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

type MemoViewMode = "calendar" | "feed";

function sortEntriesLatestFirst(entries: MemoEntry[]): MemoEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
  });
}

export default function MemoPage() {
  const { entries, loading, authLoading, isAuthenticated, create, update, remove } = useMemos();
  const [selectedMonth, setSelectedMonth] = useState(() => todayKstYmd().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [viewMode, setViewMode] = useState<MemoViewMode>("feed");
  const [feedTypeFilter, setFeedTypeFilter] = useState<MemoTypeFilter>("All");
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [memoTypeInput, setMemoTypeInput] = useState<MemoType>(DEFAULT_MEMO_TYPE);
  const composerRef = useRef<HTMLDivElement>(null);
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
    const grouped = new Map<string, MemoEntry[]>();

    monthEntries.forEach((entry) => {
      const current = grouped.get(entry.date) ?? [];
      grouped.set(entry.date, [...current, entry]);
    });

    return grouped;
  }, [monthEntries]);

  const selectedDateEntries = useMemo(
    () => sortEntriesLatestFirst(entriesByDate.get(selectedDate) ?? []),
    [entriesByDate, selectedDate],
  );

  const feedTypeCounts = useMemo(() => {
    const counts: Record<MemoTypeFilter, number> = {
      All: monthEntries.length,
      "Market Note": 0,
      "Investment Idea": 0,
      Macro: 0,
      "Trading Diary": 0,
    };

    monthEntries.forEach((entry) => {
      counts[entry.memoType] += 1;
    });

    return counts;
  }, [monthEntries]);

  const feedEntries = useMemo(() => {
    const filteredEntries =
      feedTypeFilter === "All"
        ? monthEntries
        : monthEntries.filter((entry) => entry.memoType === feedTypeFilter);

    return sortEntriesLatestFirst(filteredEntries);
  }, [monthEntries, feedTypeFilter]);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === editingId),
    [editingId, entries],
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
      setTitleInput("");
      setContentInput("");
      setMemoTypeInput(DEFAULT_MEMO_TYPE);
      return;
    }

    setTitleInput(selectedEntry.title ?? "");
    setContentInput(selectedEntry.content || selectedEntry.comment || "");
    setMemoTypeInput(selectedEntry.memoType ?? DEFAULT_MEMO_TYPE);
  }, [selectedEntry]);

  const resetForm = () => {
    setEditingId(null);
    setTitleInput("");
    setContentInput("");
    setMemoTypeInput(DEFAULT_MEMO_TYPE);
  };

  const handleNew = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    resetForm();
  };

  const handleSave = () => {
    if (!isAuthed) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const title = titleInput.trim();
    const content = contentInput.trim();

    if (!content) {
      window.alert("메모 본문을 입력해주세요.");
      return;
    }

    const payload = {
      date: selectedDate,
      title,
      content,
      memoType: memoTypeInput || DEFAULT_MEMO_TYPE,
      sentiment: selectedEntry?.sentiment ?? "",
      comment: content,
      imagePaths: selectedEntry?.imagePaths ?? [],
    };

    if (editingId && selectedEntry) {
      update(editingId, payload);
      return;
    }

    create(payload);
    resetForm();
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
    resetForm();
  };

  const handleSelectEntry = (id: string) => {
    const entry = entries.find((item) => item.id === id);

    if (!entry) {
      return;
    }

    setSelectedDate(entry.date);
    setSelectedMonth(entry.date.slice(0, 7));
    setEditingId(id);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="memo-page east-page">
      <section className="memo-page-header east-page-header">
        <h1>Investment Journal</h1>
        <div className="memo-page-actions">
          <div className="memo-view-toggle" role="group" aria-label="메모 보기 방식">
            <button type="button" className={viewMode === "feed" ? "is-active" : ""} aria-pressed={viewMode === "feed"} onClick={() => setViewMode("feed")}>피드</button>
            <button type="button" className={viewMode === "calendar" ? "is-active" : ""} aria-pressed={viewMode === "calendar"} onClick={() => setViewMode("calendar")}>캘린더</button>
          </div>
          <input type="month" aria-label="조회 월" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value || today.slice(0, 7))} />
        </div>
      </section>

      {!authLoading && !isAuthed ? (
        <section className="panel"><p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p></section>
      ) : null}

      <div ref={composerRef} className="memo-composer-anchor">
        <MemoEntryForm
          isEditing={Boolean(editingId)}
          titleInput={titleInput}
          contentInput={contentInput}
          memoTypeInput={memoTypeInput}
          selectedDate={selectedDate}
          onTitleChange={setTitleInput}
          onContentChange={setContentInput}
          onMemoTypeChange={setMemoTypeInput}
          onDateChange={(date) => { setSelectedDate(date); setSelectedMonth(date.slice(0, 7)); }}
          onNew={handleNew}
          onSave={handleSave}
          onDelete={handleDelete}
          isAuthed={isAuthed}
          canDelete={Boolean(editingId)}
        />
      </div>

      {viewMode === "calendar" ? (
        <section className="memo-calendar-board">
          <MemoCalendarSection
            selectedMonth={selectedMonth}
            monthDates={monthDates}
            leadingBlankCount={leadingBlankCount}
            calendarMap={calendarMap}
            entriesByDate={entriesByDate}
            selectedDate={selectedDate}
            today={today}
            onSelectDate={(date) => { setSelectedDate(date); setEditingId(null); }}
            onMonthChange={setSelectedMonth}
          />
          <MemoEntriesList
            loading={loading}
            selectedDate={selectedDate}
            entries={selectedDateEntries}
            editingId={editingId}
            onSelectEntry={handleSelectEntry}
            onZoomImage={setZoomImageUrl}
          />
        </section>
      ) : (
        <MemoEntriesList
          loading={loading}
          title="기록"
          emptyTitle="이 달에 작성한 메모가 없습니다."
          entries={feedEntries}
          editingId={editingId}
          onSelectEntry={handleSelectEntry}
          onZoomImage={setZoomImageUrl}
          showDate
          typeFilterOptions={["All", ...MEMO_TYPES]}
          activeTypeFilter={feedTypeFilter}
          typeFilterCounts={feedTypeCounts}
          onTypeFilterChange={setFeedTypeFilter}
        />
      )}
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
    </div>
  );
}
