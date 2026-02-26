"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
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
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setEntries([]);
      setLoading(false);
      return;
    }

    setEntries(listExpenseEntries());
    setLoading(false);
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    refresh();
    const onChanged = () => refresh();
    window.addEventListener(FINANCE_DATA_EVENT, onChanged);

    return () => {
      window.removeEventListener(FINANCE_DATA_EVENT, onChanged);
    };
  }, [authLoading, refresh]);

  const create = useCallback((input: ExpenseEntryInput) => {
    if (!isAuthenticated) {
      return;
    }

    const updated = addExpenseEntry(input);
    setEntries(updated);
    notifyFinanceDataChanged();
  }, [isAuthenticated]);

  const update = useCallback((id: string, input: ExpenseEntryInput) => {
    if (!isAuthenticated) {
      return;
    }

    const updated = updateExpenseEntry(id, input);
    setEntries(updated);
    notifyFinanceDataChanged();
  }, [isAuthenticated]);

  const remove = useCallback((id: string) => {
    if (!isAuthenticated) {
      return;
    }

    const updated = deleteExpenseEntry(id);
    setEntries(updated);
    notifyFinanceDataChanged();
  }, [isAuthenticated]);

  return {
    entries,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    create,
    update,
    remove,
  };
}
