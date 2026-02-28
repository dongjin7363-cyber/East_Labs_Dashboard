"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useMemoEntries } from "@/lib/hooks/useMemoEntries";
import { toYmd } from "@/lib/utils/date";

function parseTags(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .slice(0, 20);
}

export default function MemoPage() {
  const { entries, loading, authLoading, isAuthenticated, upsert, removeByDate } =
    useMemoEntries();
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()));
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tagsInput, setTagsInput] = useState("");

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.date === selectedDate),
    [entries, selectedDate],
  );

  const recentEntries = useMemo(() => entries.slice(0, 30), [entries]);

  useEffect(() => {
    if (selectedEntry) {
      setTitle(selectedEntry.title ?? "");
      setBody(selectedEntry.body);
      setTagsInput(selectedEntry.tags.join(" "));
      return;
    }

    setTitle("");
    setBody("");
    setTagsInput("");
  }, [selectedEntry]);

  const handleSave = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    upsert({
      date: selectedDate,
      title,
      body,
      tags: parseTags(tagsInput),
    });
  };

  const handleDelete = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!selectedEntry) {
      return;
    }

    if (!window.confirm(`${selectedDate} 메모를 삭제할까요?`)) {
      return;
    }

    removeByDate(selectedDate);
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
        <div className="filter-row">
          <label>
            날짜
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || toYmd(new Date()))}
              disabled={!isAuthenticated}
            />
          </label>
        </div>

        <div className="form-grid">
          <label className="full">
            제목 (옵션)
            <input
              placeholder="예: 오전 시황 대응 메모"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!isAuthenticated}
            />
          </label>
          <label className="full">
            Tags (옵션)
            <input
              placeholder="#시장 #종목 #실수"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              disabled={!isAuthenticated}
            />
          </label>
          <label className="full">
            내용
            <textarea
              rows={14}
              placeholder="하루 시장 대응 / 회고 / 개선점"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              disabled={!isAuthenticated}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="primary-button"
            onClick={handleSave}
            disabled={!isAuthenticated}
          >
            Save
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={handleDelete}
            disabled={!isAuthenticated || !selectedEntry}
          >
            Delete
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>최근 30일</h3>
          {loading ? <div className="panel-submetric">로딩 중...</div> : null}
        </div>
        {recentEntries.length === 0 ? (
          <div className="empty-state">기록이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Title</th>
                  <th>Tags</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {recentEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="clickable-row"
                    onClick={() => setSelectedDate(entry.date)}
                  >
                    <td>{entry.date}</td>
                    <td>{entry.title || "-"}</td>
                    <td>{entry.tags.join(" ") || "-"}</td>
                    <td>{entry.updatedAt.slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
