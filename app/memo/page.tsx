"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import MemoCalendarSection from "@/components/memo/MemoCalendarSection";
import MemoEntriesList, { type MemoTypeFilter } from "@/components/memo/MemoEntriesList";
import MemoEntryForm from "@/components/memo/MemoEntryForm";
import { useMemos } from "@/lib/hooks/useMemos";
import {
  DEFAULT_MEMO_TYPE,
  MEMO_TYPES,
  MemoEntry,
  MemoSentiment,
  MemoType,
} from "@/lib/models/types";
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
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [viewMode, setViewMode] = useState<MemoViewMode>("calendar");
  const [feedTypeFilter, setFeedTypeFilter] = useState<MemoTypeFilter>("All");
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [contentInput, setContentInput] = useState("");
  const [memoTypeInput, setMemoTypeInput] = useState<MemoType>(DEFAULT_MEMO_TYPE);
  const [sentimentInput, setSentimentInput] = useState<MemoSentiment | "">("");
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
      All: entries.length,
      "Market Note": 0,
      "Investment Idea": 0,
      Macro: 0,
      "Trading Diary": 0,
    };

    entries.forEach((entry) => {
      counts[entry.memoType] += 1;
    });

    return counts;
  }, [entries]);

  const feedEntries = useMemo(() => {
    const filteredEntries =
      feedTypeFilter === "All"
        ? entries
        : entries.filter((entry) => entry.memoType === feedTypeFilter);

    return sortEntriesLatestFirst(filteredEntries);
  }, [entries, feedTypeFilter]);

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
      setSentimentInput("");
      return;
    }

    setTitleInput(selectedEntry.title ?? "");
    setContentInput(selectedEntry.content || selectedEntry.comment || "");
    setMemoTypeInput(selectedEntry.memoType ?? DEFAULT_MEMO_TYPE);
    setSentimentInput(selectedEntry.sentiment ?? "");
  }, [selectedEntry]);

  const resetForm = () => {
    setEditingId(null);
    setTitleInput("");
    setContentInput("");
    setMemoTypeInput(DEFAULT_MEMO_TYPE);
    setSentimentInput("");
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

    if (!title) {
      window.alert("Title을 입력해주세요.");
      return;
    }

    if (!content) {
      window.alert("Content를 입력해주세요.");
      return;
    }

    const payload = {
      date: selectedDate,
      title,
      content,
      memoType: memoTypeInput || DEFAULT_MEMO_TYPE,
      sentiment: sentimentInput,
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
    setViewMode("calendar");
  };

  return (
    <>
      <section className="memo-page-header">
        <h1>Investment Journal</h1>
        <div className="filter-row memo-header-row memo-page-actions">
          <div className="memo-view-toggle" aria-label="Memo view mode">
            <button
              type="button"
              className={viewMode === "calendar" ? "is-active" : ""}
              onClick={() => setViewMode("calendar")}
            >
              Calendar
            </button>
            <button
              type="button"
              className={viewMode === "feed" ? "is-active" : ""}
              onClick={() => setViewMode("feed")}
            >
              Feed
            </button>
          </div>
          {viewMode === "calendar" ? (
            <>
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
            </>
          ) : null}
        </div>
      </section>

      {!authLoading && !isAuthed ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      {viewMode === "calendar" ? (
        <>
          <section className="memo-layout">
            <MemoCalendarSection
              selectedMonth={selectedMonth}
              monthDates={monthDates}
              leadingBlankCount={leadingBlankCount}
              calendarMap={calendarMap}
              entriesByDate={entriesByDate}
              selectedDate={selectedDate}
              today={today}
              onSelectDate={(date) => {
                setSelectedDate(date);
                setEditingId(null);
              }}
            />

            <MemoEntryForm
              isEditing={Boolean(editingId)}
              titleInput={titleInput}
              contentInput={contentInput}
              memoTypeInput={memoTypeInput}
              sentimentInput={sentimentInput}
              onTitleChange={setTitleInput}
              onContentChange={setContentInput}
              onMemoTypeChange={setMemoTypeInput}
              onSentimentChange={setSentimentInput}
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
        </>
      ) : (
        <MemoEntriesList
          loading={loading}
          title="Feed"
          emptyTitle="메모가 없습니다."
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
    </>
  );
}
