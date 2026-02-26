import {
  CashTransaction,
  CashTransactionType,
  Currency,
  DateRange,
  TransactionSummary,
} from "@/lib/models/types";
import { financeRepository } from "@/lib/services/repository";
import { createId } from "@/lib/utils/id";
import { isDateInRange } from "@/lib/utils/date";

export interface TransactionInput {
  date: string;
  type: CashTransactionType;
  currency: Currency;
  amount: number;
  category: string;
  memo: string;
}

export interface TransactionFilter {
  dateRange?: DateRange;
  type?: CashTransactionType | "ALL";
  currency?: Currency | "ALL";
  search?: string;
}

function sortTransactions(transactions: CashTransaction[]): CashTransaction[] {
  return [...transactions].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function listTransactions(): CashTransaction[] {
  return sortTransactions(financeRepository.getCashTransactions());
}

export function addTransaction(input: TransactionInput): CashTransaction[] {
  const next: CashTransaction = {
    id: createId(),
    date: input.date,
    type: input.type,
    currency: input.currency,
    amount: input.amount,
    category: input.category.trim(),
    memo: input.memo.trim(),
    createdAt: new Date().toISOString(),
  };

  const updated = sortTransactions([next, ...listTransactions()]);
  financeRepository.saveCashTransactions(updated);

  return updated;
}

export function updateTransaction(
  id: string,
  input: TransactionInput,
): CashTransaction[] {
  const updated = sortTransactions(listTransactions().map((item) => {
    if (item.id !== id) {
      return item;
    }

    return {
      ...item,
      date: input.date,
      type: input.type,
      currency: input.currency,
      amount: input.amount,
      category: input.category.trim(),
      memo: input.memo.trim(),
    };
  }));

  financeRepository.saveCashTransactions(updated);
  return updated;
}

export function deleteTransaction(id: string): CashTransaction[] {
  const updated = sortTransactions(listTransactions().filter((item) => item.id !== id));
  financeRepository.saveCashTransactions(updated);

  return updated;
}

export function replaceTransactions(
  transactions: CashTransaction[],
): CashTransaction[] {
  financeRepository.saveCashTransactions(transactions);
  return listTransactions();
}

export function filterTransactions(
  transactions: CashTransaction[],
  filter: TransactionFilter,
): CashTransaction[] {
  const keyword = filter.search?.trim().toLowerCase() ?? "";

  return transactions.filter((transaction) => {
    if (filter.dateRange && !isDateInRange(transaction.date, filter.dateRange)) {
      return false;
    }

    if (filter.type && filter.type !== "ALL" && transaction.type !== filter.type) {
      return false;
    }

    if (
      filter.currency &&
      filter.currency !== "ALL" &&
      transaction.currency !== filter.currency
    ) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return (
      transaction.memo.toLowerCase().includes(keyword) ||
      transaction.category.toLowerCase().includes(keyword)
    );
  });
}

function emptySummary(): TransactionSummary {
  return {
    expense: {
      KRW: 0,
      USD: 0,
    },
    deposit: {
      KRW: 0,
      USD: 0,
    },
  };
}

export function summarizeTransactions(
  transactions: CashTransaction[],
): TransactionSummary {
  const summary = emptySummary();

  transactions.forEach((transaction) => {
    if (transaction.type === "EXPENSE") {
      summary.expense[transaction.currency] += transaction.amount;
      return;
    }

    summary.deposit[transaction.currency] += transaction.amount;
  });

  return summary;
}
