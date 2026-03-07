"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Modal } from "@/components/Modal";
import {
  ExpenseBucket,
  ExpenseEntry,
  ExpenseSubcategory,
} from "@/lib/models/types";
import {
  defaultSubcategoryForBucket,
  ExpenseEntryInput,
  subcategoryOptionsForBucket,
} from "@/lib/services/expenseService";
import { moneyFormat } from "@/lib/utils/money";

interface ExpenseCellModalProps {
  open: boolean;
  date: string;
  bucket: ExpenseBucket;
  subcategory?: ExpenseSubcategory;
  titleOverride?: string;
  entries: ExpenseEntry[];
  onClose: () => void;
  onCreate: (input: ExpenseEntryInput) => void;
  onUpdate: (id: string, input: ExpenseEntryInput) => void;
  onDelete: (id: string) => void;
}

function parseAmountInt(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, "");

  if (!digits) {
    return null;
  }

  const parsed = Number.parseInt(digits, 10);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function bucketLabel(bucket: ExpenseBucket): string {
  if (bucket === "INCOME") {
    return "Income";
  }

  if (bucket === "PLUS") {
    return "Plus";
  }

  if (bucket === "SUBSCRIPTION") {
    return "Subscription";
  }

  return "Spending";
}

export function ExpenseCellModal({
  open,
  date,
  bucket,
  subcategory,
  titleOverride,
  entries,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
}: ExpenseCellModalProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const subcategoryOptions = useMemo(
    () => subcategoryOptionsForBucket(bucket),
    [bucket],
  );
  const usesSubcategory = subcategoryOptions.length > 0;
  const showSubcategoryDropdown = !subcategory && subcategoryOptions.length > 1;
  const [subcategoryInput, setSubcategoryInput] = useState<ExpenseSubcategory | "">("");
  const defaultSubcategory =
    subcategory ??
    subcategoryOptions[0] ??
    defaultSubcategoryForBucket(bucket) ??
    "";

  const totalAmount = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.amountInt, 0),
    [entries],
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    setEditingId(null);
    setAmountInput("");
    setNoteInput("");
    setSubcategoryInput(defaultSubcategory);
  }, [bucket, date, defaultSubcategory, open]);

  const handleSelectEntry = (entry: ExpenseEntry) => {
    const selectedSubcategory =
      entry.subcategory && subcategoryOptions.includes(entry.subcategory)
        ? entry.subcategory
        : defaultSubcategory;

    setEditingId(entry.id);
    setAmountInput(`${entry.amountInt}`);
    setNoteInput(entry.note);
    setSubcategoryInput(selectedSubcategory);
  };

  const clearFormForNew = () => {
    setEditingId(null);
    setAmountInput("");
    setNoteInput("");
    setSubcategoryInput(defaultSubcategory);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const amountInt = parseAmountInt(amountInput);

    if (amountInt === null) {
      window.alert("금액은 0 이상의 정수(원)로 입력하세요.");
      return;
    }

    const payload: ExpenseEntryInput = {
      date,
      bucket,
      subcategory:
        usesSubcategory && defaultSubcategory
          ? subcategory ??
            subcategoryInput ??
            defaultSubcategory ??
            undefined
          : undefined,
      amountInt,
      note: noteInput,
    };

    if (editingId) {
      onUpdate(editingId, payload);
      return;
    }

    onCreate(payload);
    clearFormForNew();
  };

  const handleDelete = () => {
    if (!editingId) {
      return;
    }

    if (!window.confirm("선택한 항목을 삭제할까요?")) {
      return;
    }

    onDelete(editingId);
    clearFormForNew();
  };

  return (
    <Modal
      open={open}
      title={`${date} · ${titleOverride ?? bucketLabel(bucket)}`}
      onClose={onClose}
    >
      <div className="expense-modal-meta">
        <div>셀 합계: {moneyFormat("KRW", totalAmount)}</div>
        <div>항목 수: {entries.length}</div>
      </div>

      <div className="expense-modal-list">
        {entries.length === 0 ? (
          <div className="empty-state">등록된 항목이 없습니다.</div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`expense-entry-chip ${editingId === entry.id ? "is-active" : ""}`}
              onClick={() => handleSelectEntry(entry)}
            >
              <span>{moneyFormat("KRW", entry.amountInt)}</span>
              <span>
                {usesSubcategory && entry.subcategory ? `[${entry.subcategory}] ` : ""}
                {entry.note || "(메모 없음)"}
              </span>
            </button>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Amount (KRW)
            <FormattedNumberInput
              value={amountInput}
              onValueChange={setAmountInput}
              placeholder="예: 15000"
            />
          </label>

          <label>
            Note
            <input
              value={noteInput}
              onChange={(event) => setNoteInput(event.target.value)}
              placeholder="가맹점/메모"
            />
          </label>

          {usesSubcategory && showSubcategoryDropdown ? (
            <label>
              Subcategory
              <select
                value={subcategoryInput}
                onChange={(event) =>
                  setSubcategoryInput(event.target.value as ExpenseSubcategory)
                }
              >
                {subcategoryOptions.map((subcategory) => (
                  <option key={subcategory} value={subcategory}>
                    {subcategory}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            Save
          </button>
          <button
            type="button"
            className="danger-button"
            onClick={handleDelete}
            disabled={!editingId}
          >
            Delete
          </button>
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="secondary-button" onClick={clearFormForNew}>
            New
          </button>
        </div>
      </form>
    </Modal>
  );
}
