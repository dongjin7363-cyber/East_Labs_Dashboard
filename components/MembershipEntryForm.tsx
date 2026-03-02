"use client";

import {
  MembershipCategory,
  MEMBERSHIP_CATEGORIES,
  MEMBERSHIP_VISIBILITIES,
  MembershipVisibility,
} from "@/lib/models/types";

export interface MembershipEntryFormValue {
  title: string;
  category: MembershipCategory;
  visibility: MembershipVisibility;
  body: string;
}

interface MembershipEntryFormProps {
  value: MembershipEntryFormValue;
  disabled: boolean;
  isEditing: boolean;
  onChange: (next: MembershipEntryFormValue) => void;
  onSave: () => void;
  onDelete: () => void;
}

function visibilityIcon(visibility: MembershipVisibility): string {
  return visibility === "Public" ? "🌐" : "🔒";
}

export function MembershipEntryForm({
  value,
  disabled,
  isEditing,
  onChange,
  onSave,
  onDelete,
}: MembershipEntryFormProps) {
  return (
    <section className="memo-form-wrap">
      <div className="form-grid">
        <label className="full">
          Title
          <input
            placeholder="제목"
            value={value.title}
            onChange={(event) =>
              onChange({
                ...value,
                title: event.target.value,
              })
            }
            disabled={disabled}
          />
        </label>

        <label>
          Category
          <select
            value={value.category}
            onChange={(event) =>
              onChange({
                ...value,
                category: event.target.value as MembershipCategory,
              })
            }
            disabled={disabled}
          >
            {MEMBERSHIP_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          Visibility
          <select
            value={value.visibility}
            onChange={(event) =>
              onChange({
                ...value,
                visibility: event.target.value as MembershipVisibility,
              })
            }
            disabled={disabled}
          >
            {MEMBERSHIP_VISIBILITIES.map((visibility) => (
              <option key={visibility} value={visibility}>
                {visibilityIcon(visibility)} {visibility}
              </option>
            ))}
          </select>
          <div style={{ marginTop: "6px" }}>
            <span
              className={`membership-visibility-chip ${
                value.visibility === "Public" ? "is-public" : "is-private"
              }`}
            >
              <span aria-hidden>{visibilityIcon(value.visibility)}</span>
              {value.visibility}
            </span>
          </div>
        </label>

        <label className="full">
          Body
          <textarea
            rows={10}
            placeholder="내용"
            value={value.body}
            onChange={(event) =>
              onChange({
                ...value,
                body: event.target.value,
              })
            }
            disabled={disabled}
          />
        </label>
      </div>

      <div className="form-actions">
        <button type="button" className="primary-button" onClick={onSave} disabled={disabled}>
          Save
        </button>
        <button
          type="button"
          className="danger-button"
          onClick={onDelete}
          disabled={disabled || !isEditing}
        >
          Delete
        </button>
      </div>
    </section>
  );
}
