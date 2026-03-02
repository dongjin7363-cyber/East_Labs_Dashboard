"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MembershipCalendar } from "@/components/MembershipCalendar";
import { MembershipDayPanel } from "@/components/MembershipDayPanel";
import {
  MembershipEntryForm,
  MembershipEntryFormValue,
} from "@/components/MembershipEntryForm";
import { PageHeader } from "@/components/PageHeader";
import { useMembershipPosts } from "@/lib/hooks/useMembershipPosts";
import { MembershipPost } from "@/lib/models/types";
import {
  buildMembershipCountByDate,
  isMembershipMatched,
  listMembershipPostsByDate,
  listMembershipPostsByMonth,
} from "@/lib/services/membershipService";
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

const EMPTY_FORM: MembershipEntryFormValue = {
  title: "",
  category: "Market",
  visibility: "Private",
  body: "",
};

export default function MembershipPage() {
  const {
    posts,
    loading,
    authLoading,
    isAuthenticated,
    userId,
    createPost,
    updatePost,
    removePost,
  } = useMembershipPosts();
  const [selectedMonth, setSelectedMonth] = useState(() => toYm(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [search, setSearch] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [form, setForm] = useState<MembershipEntryFormValue>(EMPTY_FORM);
  const [calendarMap, setCalendarMap] = useState<Record<string, CalendarDayInfo>>({});
  const calendarMonthCacheRef = useRef<
    Record<string, Record<string, CalendarDayInfo>>
  >({});

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

  const monthPosts = useMemo(
    () => listMembershipPostsByMonth(posts, selectedMonth),
    [posts, selectedMonth],
  );

  const countByDate = useMemo(
    () => buildMembershipCountByDate(monthPosts),
    [monthPosts],
  );

  const searchedMonthPosts = useMemo(
    () => monthPosts.filter((post) => isMembershipMatched(post, search)),
    [monthPosts, search],
  );

  const dayPosts = useMemo(
    () => listMembershipPostsByDate(searchedMonthPosts, selectedDate),
    [searchedMonthPosts, selectedDate],
  );

  const selectedPost = useMemo(
    () => monthPosts.find((post) => post.id === selectedPostId),
    [monthPosts, selectedPostId],
  );
  const isSelectedOwned = useMemo(
    () =>
      Boolean(
        selectedPost &&
          (!selectedPost.userId || (userId && selectedPost.userId === userId)),
      ),
    [selectedPost, userId],
  );
  const formDisabled = !isAuthenticated || (Boolean(selectedPostId) && !isSelectedOwned);

  useEffect(() => {
    if (selectedPost && selectedPost.date !== selectedDate) {
      setSelectedDate(selectedPost.date);
      return;
    }

    if (selectedPost) {
      setForm({
        title: selectedPost.title,
        category: selectedPost.category,
        visibility: selectedPost.visibility,
        body: selectedPost.body,
      });
      return;
    }

    setForm(EMPTY_FORM);
  }, [selectedDate, selectedPost]);

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    const exists = monthPosts.some((post) => post.id === selectedPostId);

    if (!exists) {
      setSelectedPostId(null);
      setForm(EMPTY_FORM);
    }
  }, [monthPosts, selectedPostId]);

  useEffect(() => {
    if (!selectedPostId) {
      return;
    }

    const visible = searchedMonthPosts.some((post) => post.id === selectedPostId);

    if (!visible) {
      setSelectedPostId(null);
      setForm(EMPTY_FORM);
    }
  }, [searchedMonthPosts, selectedPostId]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedPostId(null);
    setForm(EMPTY_FORM);
  };

  const handleSelectPost = (post: MembershipPost) => {
    setSelectedDate(post.date);
    setSelectedPostId(post.id);
  };

  const handleNew = () => {
    setSelectedPostId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (selectedPostId && !isSelectedOwned) {
      window.alert("작성자만 수정할 수 있습니다.");
      return;
    }

    if (!form.title.trim()) {
      window.alert("제목을 입력하세요.");
      return;
    }

    const payload = {
      date: selectedDate,
      title: form.title,
      category: form.category,
      visibility: form.visibility,
      body: form.body,
    };

    if (selectedPostId) {
      updatePost(selectedPostId, payload);
      return;
    }

    createPost(payload);
    setForm(EMPTY_FORM);
  };

  const handleDelete = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!isSelectedOwned) {
      window.alert("작성자만 삭제할 수 있습니다.");
      return;
    }

    if (!selectedPostId) {
      return;
    }

    if (!window.confirm("선택한 글을 삭제할까요?")) {
      return;
    }

    removePost(selectedPostId);
    setSelectedPostId(null);
    setForm(EMPTY_FORM);
  };

  return (
    <>
      <PageHeader title="Membership" />

      {!authLoading && !isAuthenticated ? (
        <section className="panel">
          <p className="auth-gate-message">
            Public 글만 표시됩니다. 로그인하면 Private 글 작성/수정이 가능합니다.
          </p>
        </section>
      ) : null}

      <section className="panel">
        <div className="filter-row memo-header-row">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(event.target.value)}
            />
          </label>

          <div className="memo-selected-date">
            선택 날짜
            <strong>{selectedDate}</strong>
          </div>

          <label>
            검색
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="제목/카테고리/본문"
            />
          </label>
        </div>

        <div className="memo-layout">
          <MembershipCalendar
            month={selectedMonth}
            selectedDate={selectedDate}
            today={todayKst}
            countByDate={countByDate}
            calendarMap={calendarMap}
            onSelectDate={handleSelectDate}
          />

          <div className="memo-right-panel">
            {loading ? (
              <section className="memo-day-panel">
                <div className="empty-state">로딩 중...</div>
              </section>
            ) : (
              <MembershipDayPanel
                selectedDate={selectedDate}
                posts={dayPosts}
                selectedPostId={selectedPostId}
                disabled={!isAuthenticated}
                onNew={handleNew}
                onSelectPost={handleSelectPost}
              />
            )}

            <MembershipEntryForm
              value={form}
              disabled={formDisabled}
              isEditing={Boolean(selectedPostId) && isSelectedOwned}
              onChange={setForm}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </section>
    </>
  );
}
