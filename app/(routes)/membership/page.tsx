"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useMembershipPosts } from "@/lib/hooks/useMembershipPosts";
import { MembershipCategory, MEMBERSHIP_CATEGORIES } from "@/lib/models/types";

interface FormState {
  title: string;
  category: MembershipCategory;
  body: string;
  isPublic: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  category: "시장",
  body: "",
  isPublic: false,
};

export default function MembershipPage() {
  const {
    posts,
    loading,
    authLoading,
    isAuthenticated,
    createPost,
    updatePost,
    removePost,
  } = useMembershipPosts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedId),
    [posts, selectedId],
  );

  useEffect(() => {
    if (selectedPost) {
      setForm({
        title: selectedPost.title,
        category: selectedPost.category,
        body: selectedPost.body,
        isPublic: selectedPost.isPublic,
      });
      return;
    }

    setForm(EMPTY_FORM);
  }, [selectedPost]);

  const handleNew = () => {
    setSelectedId(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (!isAuthenticated) {
      window.alert("로그인 후 사용 가능합니다.");
      return;
    }

    if (!form.title.trim()) {
      window.alert("제목을 입력하세요.");
      return;
    }

    if (selectedPost) {
      updatePost(selectedPost.id, {
        title: form.title,
        category: form.category,
        body: form.body,
        isPublic: form.isPublic,
      });
      return;
    }

    createPost({
      title: form.title,
      category: form.category,
      body: form.body,
      isPublic: form.isPublic,
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

    if (!window.confirm(`'${selectedPost.title}' 글을 삭제할까요?`)) {
      return;
    }

    removePost(selectedPost.id);
    handleNew();
  };

  return (
    <>
      <PageHeader
        title="Membership"
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={handleNew}
            disabled={!isAuthenticated}
          >
            새 글 작성
          </button>
        }
      />

      {!authLoading && !isAuthenticated ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>제목</th>
                <th>카테고리</th>
                <th>공개</th>
                <th>작성일</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>로딩 중...</td>
                </tr>
              ) : posts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty-state">글이 없습니다.</td>
                </tr>
              ) : (
                posts.map((post) => (
                  <tr key={post.id} className="clickable-row" onClick={() => setSelectedId(post.id)}>
                    <td>{post.title}</td>
                    <td>{post.category}</td>
                    <td>{post.isPublic ? "Public" : "Private"}</td>
                    <td>{post.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="form-grid">
          <label className="full">
            제목
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="제목"
              disabled={!isAuthenticated}
            />
          </label>

          <label>
            카테고리
            <select
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  category: event.target.value as MembershipCategory,
                }))
              }
              disabled={!isAuthenticated}
            >
              {MEMBERSHIP_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>

          <label>
            공개 여부
            <select
              value={form.isPublic ? "true" : "false"}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, isPublic: event.target.value === "true" }))
              }
              disabled={!isAuthenticated}
            >
              <option value="false">Private</option>
              <option value="true">Public</option>
            </select>
          </label>

          <label className="full">
            본문
            <textarea
              rows={14}
              value={form.body}
              onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))}
              placeholder="내용"
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
    </>
  );
}
