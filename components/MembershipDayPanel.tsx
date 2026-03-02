"use client";

import { MembershipPost } from "@/lib/models/types";

interface MembershipDayPanelProps {
  selectedDate: string;
  posts: MembershipPost[];
  selectedPostId: string | null;
  disabled: boolean;
  onNew: () => void;
  onSelectPost: (post: MembershipPost) => void;
}

function previewText(text: string): string {
  if (text.length <= 120) {
    return text;
  }

  return `${text.slice(0, 120)}...`;
}

function visibilityIcon(visibility: MembershipPost["visibility"]): string {
  return visibility === "Public" ? "🌐" : "🔒";
}

export function MembershipDayPanel({
  selectedDate,
  posts,
  selectedPostId,
  disabled,
  onNew,
  onSelectPost,
}: MembershipDayPanelProps) {
  return (
    <section className="memo-day-panel">
      <div className="panel-header-inline">
        <h3>{selectedDate}</h3>
        <button
          type="button"
          className="secondary-button"
          onClick={onNew}
          disabled={disabled}
        >
          New
        </button>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">해당 날짜 글이 없습니다.</div>
      ) : (
        <div className="memo-day-list">
          {posts.map((post) => (
            <button
              key={post.id}
              type="button"
              className={`memo-day-card ${selectedPostId === post.id ? "is-selected" : ""}`}
              onClick={() => onSelectPost(post)}
            >
              <div className="membership-card-header">
                <strong>{post.title}</strong>
                <span
                  className={`membership-visibility-chip ${
                    post.visibility === "Public" ? "is-public" : "is-private"
                  }`}
                >
                  <span aria-hidden>{visibilityIcon(post.visibility)}</span>
                  {post.visibility}
                </span>
              </div>
              <div className="membership-card-meta">{post.category}</div>
              <div className="memo-day-card-comment">{previewText(post.body || "-")}</div>
              <div className="memo-day-card-time">
                {post.updatedAt.slice(0, 16).replace("T", " ")}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

