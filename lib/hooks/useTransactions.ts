"use client";

import { useCallback, useEffect, useState } from "react";
import { CashTransaction } from "@/lib/models/types";
import {
  addTransaction,
  deleteTransaction,
  listTransactions,
  TransactionInput,
  updateTransaction,
} from "@/lib/services/transactionService";
import {
  FINANCE_DATA_EVENT,
  notifyFinanceDataChanged,
} from "@/lib/services/events";

export function useTransactions() {
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setTransactions(listTransactions());
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

  const create = useCallback((input: TransactionInput) => {
    const updated = addTransaction(input);
    setTransactions(updated);
    notifyFinanceDataChanged();
  }, []);

  const update = useCallback((id: string, input: TransactionInput) => {
    const updated = updateTransaction(id, input);
    setTransactions(updated);
    notifyFinanceDataChanged();
  }, []);

  const remove = useCallback((id: string) => {
    const updated = deleteTransaction(id);
    setTransactions(updated);
    notifyFinanceDataChanged();
  }, []);

  return {
    transactions,
    loading,
    refresh,
    create,
    update,
    remove,
  };
}
