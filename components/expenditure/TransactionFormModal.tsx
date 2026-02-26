"use client";

import { FormEvent, useEffect, useState } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Modal } from "@/components/Modal";
import {
  CashTransaction,
  CashTransactionType,
  Currency,
} from "@/lib/models/types";
import { TransactionInput } from "@/lib/services/transactionService";
import { amountPlaceholder } from "@/lib/utils/money";
import { todayYmd } from "@/lib/utils/date";
import { parseCommaInt } from "@/lib/utils/numberFormat";

interface TransactionFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  transaction?: CashTransaction;
  onClose: () => void;
  onSubmit: (input: TransactionInput) => void;
}

interface TransactionFormState extends Omit<TransactionInput, "amount"> {
  amount: string;
}

const DEFAULT_INPUT: TransactionFormState = {
  date: todayYmd(),
  type: "EXPENSE",
  currency: "KRW",
  amount: "",
  category: "",
  memo: "",
};

export function TransactionFormModal({
  open,
  mode,
  transaction,
  onClose,
  onSubmit,
}: TransactionFormModalProps) {
  const [form, setForm] = useState<TransactionFormState>(DEFAULT_INPUT);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (transaction) {
      setForm({
        date: transaction.date,
        type: transaction.type,
        currency: transaction.currency,
        amount: `${transaction.amount}`,
        category: transaction.category,
        memo: transaction.memo,
      });
      return;
    }

    setForm(DEFAULT_INPUT);
  }, [open, transaction]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.date) {
      window.alert("날짜를 입력하세요.");
      return;
    }

    const parsedAmount = parseCommaInt(form.amount);

    if (parsedAmount === null || parsedAmount < 0) {
      window.alert("금액은 0 이상의 정수로 입력하세요.");
      return;
    }

    if (!form.category.trim()) {
      window.alert("카테고리를 입력하세요.");
      return;
    }

    onSubmit({
      ...form,
      amount: parsedAmount,
      memo: form.memo.trim(),
      category: form.category.trim(),
    });

    onClose();
  };

  return (
    <Modal
      open={open}
      title={mode === "create" ? "거래 추가" : "거래 수정"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, date: event.target.value }))
              }
            />
          </label>

          <label>
            Type
            <select
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  type: event.target.value as CashTransactionType,
                }))
              }
            >
              <option value="EXPENSE">EXPENSE</option>
              <option value="DEPOSIT">DEPOSIT</option>
            </select>
          </label>

          <label>
            Currency
            <select
              value={form.currency}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  currency: event.target.value as Currency,
                }))
              }
            >
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
            </select>
          </label>

          <label>
            Amount (정수)
            <FormattedNumberInput
              value={form.amount}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, amount: rawValue }))
              }
              placeholder={amountPlaceholder(form.currency)}
            />
          </label>

          <label>
            Category
            <input
              value={form.category}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, category: event.target.value }))
              }
              placeholder="식비 / 교통 / 주거 / 투자 / 기타"
            />
          </label>

          <label className="full">
            Memo
            <textarea
              value={form.memo}
              rows={3}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, memo: event.target.value }))
              }
              placeholder="메모"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button">
            저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
