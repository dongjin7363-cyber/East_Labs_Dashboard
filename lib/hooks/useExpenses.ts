"use client";

import { useCallback, useEffect, useState } from "react";
import { ExpenseEntry } from "@/lib/models/types";
import {
  addExpenseEntry,
  deleteExpenseEntry,
  ExpenseEntryInput,
  listExpenseEntries,
  updateExpenseEntry,
} from "@/lib/services/expenseService";
import {
  FINANCE_DATA_EVENT,
  notifyFinanceDataChanged,
} from "@/lib/services/events";

export function useExpenses() {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setEntries(listExpenseEntries());
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();

    const onChanged = () => refresh();
    window.addEventListener(FINANCE_DATA_EVENT, onChanged);

    return () => {
      window.removeEventListener(FINANCE_DATA_EVENT, onChanged);
    };
  }, [refresh]);

  const create = useCallback((input: ExpenseEntryInput) => {
    const updated = addExpenseEntry(input);
    setEntries(updated);
    notifyFinanceDataChanged();
  }, []);

  const update = useCallback((id: string, input: ExpenseEntryInput) => {
    const updated = updateExpenseEntry(id, input);
    setEntries(updated);
    notifyFinanceDataChanged();
  }, []);

  const remove = useCallback((id: string) => {
    const updated = deleteExpenseEntry(id);
    setEntries(updated);
    notifyFinanceDataChanged();
  }, []);

  return {
    entries,
    loading,
    refresh,
    create,
    update,
    remove,
  };
}
