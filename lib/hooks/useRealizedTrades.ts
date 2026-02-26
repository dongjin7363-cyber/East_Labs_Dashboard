"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [trades, setTrades] = useState<RealizedTrade[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setTrades(listRealizedTrades());
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

  const create = useCallback((input: RealizedTradeInput) => {
    const updated = addRealizedTrade(input);
    setTrades(updated);
    notifyFinanceDataChanged();
  }, []);

  const update = useCallback((id: string, input: RealizedTradeInput) => {
    const updated = updateRealizedTrade(id, input);
    setTrades(updated);
    notifyFinanceDataChanged();
  }, []);

  const remove = useCallback((id: string) => {
    const updated = deleteRealizedTrade(id);
    setTrades(updated);
    notifyFinanceDataChanged();
  }, []);

  const importCsv = useCallback((csvText: string) => {
    const result = importRealizedTradesFromCsv(csvText);
    setTrades(result.trades);
    notifyFinanceDataChanged();

    return result;
  }, []);

  return {
    trades,
    loading,
    refresh,
    create,
    update,
    remove,
    importCsv,
  };
}
