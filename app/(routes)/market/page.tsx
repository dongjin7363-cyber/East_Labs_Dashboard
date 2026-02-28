"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useMarketPosts } from "@/lib/hooks/useMarketPosts";
import { toYmd } from "@/lib/utils/date";

export default function MarketPage() {
  const { posts, loading, authLoading, isAuthenticated, upsert, removeByDate } =
    useMarketPosts();
  const [selectedDate, setSelectedDate] = useState(() => toYmd(new Date()));
  const [macroText, setMacroText] = useState("");
  const [indicesText, setIndicesText] = useState("");
  const [notesText, setNotesText] = useState("");

  const selectedPost = useMemo(
    () => posts.find((post) => post.date === selectedDate),
    [posts, selectedDate],
  );

  useEffect(() => {
    if (selectedPost) {
      setMacroText(selectedPost.macroText);
      setIndicesText(selectedPost.indicesText);
      setNotesText(selectedPost.notesText);
      return;
    }

    setMacroText("");
    setIndicesText("");
    setNotesText("");
  }, [selectedPost]);

  const handleSave = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    upsert({
      date: selectedDate,
      macroText,
      indicesText,
      notesText,
    });
  };

  const handleDelete = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!selectedPost) {
      return;
    }

    if (!window.confirm(`${selectedDate} market 기록을 삭제할까요?`)) {
      return;
    }

    removeByDate(selectedDate);
  };

  return (
    <>
      <PageHeader title="Market" />

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
            Macro
            <textarea
              rows={6}
              placeholder="금리/달러/유가 등"
              value={macroText}
              onChange={(event) => setMacroText(event.target.value)}
              disabled={!isAuthenticated}
            />
          </label>
          <label className="full">
            Indices
            <textarea
              rows={6}
              placeholder="지수/섹터"
              value={indicesText}
              onChange={(event) => setIndicesText(event.target.value)}
              disabled={!isAuthenticated}
            />
          </label>
          <label className="full">
            Notes
            <textarea
              rows={8}
              placeholder="오늘 이슈 링크/메모"
              value={notesText}
              onChange={(event) => setNotesText(event.target.value)}
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
            disabled={!isAuthenticated || !selectedPost}
          >
            Delete
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>최근 기록</h3>
          {loading ? <div className="panel-submetric">로딩 중...</div> : null}
        </div>
        {posts.length === 0 ? (
          <div className="empty-state">기록이 없습니다.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Macro</th>
                  <th>Indices</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {posts.slice(0, 30).map((post) => (
                  <tr key={post.id} className="clickable-row" onClick={() => setSelectedDate(post.date)}>
                    <td>{post.date}</td>
                    <td>{post.macroText.slice(0, 48) || "-"}</td>
                    <td>{post.indicesText.slice(0, 48) || "-"}</td>
                    <td>{post.updatedAt.slice(0, 16).replace("T", " ")}</td>
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
