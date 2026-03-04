"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MemoCalendar } from "@/components/MemoCalendar";
import { MemoDayPanel } from "@/components/MemoDayPanel";
import { MemoEntryForm } from "@/components/MemoEntryForm";
import { PageHeader } from "@/components/PageHeader";
import { MemoEntry } from "@/lib/models/types";
import { useMemoEntries } from "@/lib/hooks/useMemoEntries";
import {
  buildMemoCountByDate,
  isMemoMatched,
  listMemoEntriesByDate,
  listMemoEntriesByMonth,
} from "@/lib/services/memoService";
import { getMonthRangeFromYm, todayKstYmd, toYm } from "@/lib/utils/date";

interface CalendarDayMeta {
  date: string;
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface CalendarDaysApiResponse {
  days?: CalendarDayMeta[];
}

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface MemoFormValue {
  buyTickers: string;
  sellTickers: string;
  comment: string;
}

const EMPTY_FORM: MemoFormValue = {
  buyTickers: "",
  sellTickers: "",
  comment: "",
};

export default function MemoPage() {
  const {
    entries,
    loading,
    authLoading,
    isAuthenticated,
    createEntry,
    updateEntry,
    deleteEntry,
  } = useMemoEntries();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [search, setSearch] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [form, setForm] = useState<MemoFormValue>(EMPTY_FORM);
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const calendarMonthCacheRef = useRef<Record<string, Record<string, CalendarDayInfo>>>({});

  const monthRange = useMemo(() => getMonthRangeFromYm(selectedMonth), [selectedMonth]);
  const todayKst = useMemo(() => todayKstYmd(), []);

  useEffect(() => {
    if (selectedDate < monthRange.from || selectedDate > monthRange.to) {
      setSelectedDate(monthRange.from);
    }
  }, [monthRange.from, monthRange.to, selectedDate]);

  useEffect(() => {
    let cancelled = false;
    const cached = calendarMonthCacheRef.current[selectedMonth];

    if (cached) {
      setCalendarMap(cached);
      return () => {
        cancelled = true;
      };
    }

    setCalendarMap({});

    const loadCalendarDays = async () => {
      try {
        const response = await fetch(
          `/api/calendar-days?from=${monthRange.from}&to=${monthRange.to}&country=KR`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          throw new Error(`calendar-days API error: ${response.status}`);
        }

        const data = (await response.json()) as CalendarDaysApiResponse;
        const days = Array.isArray(data.days) ? data.days : [];
        const nextMap: Record<string, CalendarDayInfo> = {};

        days.forEach((day) => {
          nextMap[day.date] = {
            dow: day.dow,
            isHoliday: day.isHoliday,
            holidayName: day.holidayName,
          };
        });

        if (!cancelled) {
          calendarMonthCacheRef.current[selectedMonth] = nextMap;
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
  }, [monthRange.from, monthRange.to, selectedMonth]);

  const monthEntries = useMemo(
    () => listMemoEntriesByMonth(entries, selectedMonth),
    [entries, selectedMonth],
  );

  const countByDate = useMemo(() => buildMemoCountByDate(monthEntries), [monthEntries]);

  const searchedMonthEntries = useMemo(
    () => monthEntries.filter((entry) => isMemoMatched(entry, search)),
    [monthEntries, search],
  );

  const dayEntries = useMemo(
    () => listMemoEntriesByDate(searchedMonthEntries, selectedDate),
    [searchedMonthEntries, selectedDate],
  );

  const selectedEntry = useMemo(
    () => monthEntries.find((entry) => entry.id === selectedEntryId),
    [monthEntries, selectedEntryId],
  );

  useEffect(() => {
    if (selectedEntry && selectedEntry.date !== selectedDate) {
      setSelectedDate(selectedEntry.date);
      return;
    }

    if (selectedEntry) {
      setForm({
        buyTickers: selectedEntry.buyTickers,
        sellTickers: selectedEntry.sellTickers,
        comment: selectedEntry.comment,
      });
      return;
    }

    setForm(EMPTY_FORM);
  }, [selectedDate, selectedEntry]);

  useEffect(() => {
    if (!selectedEntryId) {
      return;
    }

    const exists = monthEntries.some((entry) => entry.id === selectedEntryId);

    if (!exists) {
      setSelectedEntryId(null);
      setForm(EMPTY_FORM);
    }
  }, [monthEntries, selectedEntryId]);

  useEffect(() => {
    if (!selectedEntryId) {
      return;
    }

    const visible = searchedMonthEntries.some((entry) => entry.id === selectedEntryId);

    if (!visible) {
      setSelectedEntryId(null);
      setForm(EMPTY_FORM);
    }
  }, [searchedMonthEntries, selectedEntryId]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedEntryId(null);
    setForm(EMPTY_FORM);
  };

  const handleSelectEntry = (entry: MemoEntry) => {
    setSelectedDate(entry.date);
    setSelectedEntryId(entry.id);
  };

  const handleNew = () => {
    setSelectedEntryId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    const payload = {
      date: selectedDate,
      buyTickers: form.buyTickers,
      sellTickers: form.sellTickers,
      comment: form.comment,
    };

    if (selectedEntryId) {
      updateEntry(selectedEntryId, payload);
      return;
    }

    createEntry(payload);
    setForm(EMPTY_FORM);
  };

  const handleDelete = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!selectedEntryId) {
      return;
    }

    if (!window.confirm("선택한 메모를 삭제할까요?")) {
      return;
    }

    deleteEntry(selectedEntryId);
    setSelectedEntryId(null);
    setForm(EMPTY_FORM);
  };

  return (
    <>
      <PageHeader title="Memo" />

      {!authLoading && !isAuthenticated ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="filter-row memo-header-row">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value || toYm(new Date()))}
            />
          </label>

          <div className="memo-selected-date">
            선택 날짜
            <strong>{selectedDate}</strong>
          </div>

          <label>
            검색
            <input
              placeholder="buy/sell/comment"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        <div className="memo-layout">
          <MemoCalendar
            month={selectedMonth}
            selectedDate={selectedDate}
            today={todayKst}
            countByDate={countByDate}
            calendarMap={calendarMap}
            onSelectDate={handleSelectDate}
          />

          <div className="memo-right-panel">
            <MemoEntryForm
              value={form}
              disabled={!isAuthenticated}
              isEditing={Boolean(selectedEntryId)}
              onNew={handleNew}
              onChange={setForm}
              onSave={handleSave}
              onDelete={handleDelete}
            />

            <MemoDayPanel
              selectedDate={selectedDate}
              entries={dayEntries}
              selectedEntryId={selectedEntryId}
              onSelectEntry={handleSelectEntry}
            />
          </div>
        </div>

        {loading ? <p className="ta-status-text">로딩 중...</p> : null}
      </section>
    </>
  );
}
