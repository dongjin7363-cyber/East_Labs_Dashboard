"use client";

import { useCallback, useEffect, useState } from "react";
import { PortfolioHolding } from "@/lib/models/types";
import {
  addHolding,
  deleteHolding,
  HoldingQuoteUpdate,
  listHoldings,
  PortfolioInput,
  replaceHoldings,
  updateHolding,
} from "@/lib/services/portfolioService";
import {
  FINANCE_DATA_EVENT,
  notifyFinanceDataChanged,
} from "@/lib/services/events";

export function usePortfolio() {
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setHoldings(listHoldings());
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

  const create = useCallback((input: PortfolioInput) => {
    const updated = addHolding(input);
    setHoldings(updated);
    notifyFinanceDataChanged();
  }, []);

  const update = useCallback((id: string, input: PortfolioInput) => {
    const updated = updateHolding(id, input);
    setHoldings(updated);
    notifyFinanceDataChanged();
  }, []);

  const remove = useCallback((id: string) => {
    const updated = deleteHolding(id);
    setHoldings(updated);
    notifyFinanceDataChanged();
  }, []);

  const updateQuotes = useCallback((quoteUpdates: HoldingQuoteUpdate[]) => {
    if (quoteUpdates.length === 0) {
      return;
    }

    setHoldings((prev) => {
      const refreshedAt = new Date().toISOString();
      const updateMap = new Map(quoteUpdates.map((item) => [item.id, item]));
      const next = prev.map((holding) => {
        const quote = updateMap.get(holding.id);

        if (!quote) {
          return holding;
        }

        return {
          ...holding,
          currentPrice: quote.currentPrice,
          krCode:
            holding.market === "KR"
              ? quote.krCode ?? holding.krCode
              : undefined,
          priceUpdatedAt: quote.asOf ?? refreshedAt,
          updatedAt: refreshedAt,
        };
      });

      return replaceHoldings(next);
    });
    notifyFinanceDataChanged();
  }, []);

  return {
    holdings,
    loading,
    refresh,
    create,
    update,
    remove,
    updateQuotes,
  };
}
