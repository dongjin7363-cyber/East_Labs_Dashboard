"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { RealizedTrade } from "@/lib/models/types";
import {
  addRealizedTrade,
  deleteRealizedTrade,
  importRealizedTradesFromCsv,
  listRealizedTrades,
  RealizedTradeInput,
  updateRealizedTrade,
} from "@/lib/services/realizedTradeService";
import {
  FINANCE_DATA_EVENT,
  notifyFinanceDataChanged,
} from "@/lib/services/events";

export function useRealizedTrades() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setTrades([]);
      setLoading(false);
      return;
    }

    setTrades(listRealizedTrades());
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

  const create = useCallback((input: RealizedTradeInput) => {
    if (!isAuthenticated) {
      return;
    }

    const updated = addRealizedTrade(input);
    setTrades(updated);
    notifyFinanceDataChanged();
  }, [isAuthenticated]);

  const update = useCallback((id: string, input: RealizedTradeInput) => {
    if (!isAuthenticated) {
      return;
    }

    const updated = updateRealizedTrade(id, input);
    setTrades(updated);
    notifyFinanceDataChanged();
  }, [isAuthenticated]);

  const remove = useCallback((id: string) => {
    if (!isAuthenticated) {
      return;
    }

    const updated = deleteRealizedTrade(id);
    setTrades(updated);
    notifyFinanceDataChanged();
  }, [isAuthenticated]);

  const importCsv = useCallback((csvText: string) => {
    if (!isAuthenticated) {
      return { trades: [], inserted: 0, skipped: 0, failed: 0, totalRows: 0 };
    }

    const result = importRealizedTradesFromCsv(csvText);
    setTrades(result.trades);
    notifyFinanceDataChanged();

    return result;
  }, [isAuthenticated]);

  return {
    trades,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    create,
    update,
    remove,
    importCsv,
  };
}
