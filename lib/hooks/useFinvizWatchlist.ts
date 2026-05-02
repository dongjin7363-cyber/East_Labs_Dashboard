"use client";

import { useEffect, useMemo, useState } from "react";
import { FinvizWatchlistItem } from "@/lib/models/types";
import { fetchFinvizWatchlist } from "@/lib/repository/finvizWatchlistRepository";

export function useFinvizWatchlist() {
  const [items, setItems] = useState<FinvizWatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchFinvizWatchlist()
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const sectors = useMemo(() => {
    const orderedSectors: string[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.sector)) continue;
      seen.add(item.sector);
      orderedSectors.push(item.sector);
    }
    return orderedSectors;
  }, [items]);

  return { items, sectors, loading, error };
}
