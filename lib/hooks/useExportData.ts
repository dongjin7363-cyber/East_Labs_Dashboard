"use client";

import { useEffect, useMemo, useState } from "react";
import { ExportItem, ExportDataPoint } from "@/lib/models/types";
import {
  fetchExportItems,
  fetchExportData,
} from "@/lib/repository/exportRepository";

export function useExportItems() {
  const [items, setItems] = useState<ExportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchExportItems()
      .then((result) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[export] fetchExportItems ->", result.length, "items", result);
        }
        setItems(result);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[export] fetchExportItems failed:", err);
        setError(msg);
        setItems([]);
      })
      .finally(() => setLoading(false));
  }, []);

  const bySector = useMemo(() => {
    const map = new Map<string, ExportItem[]>();
    for (const item of items) {
      if (!map.has(item.sector)) map.set(item.sector, []);
      map.get(item.sector)!.push(item);
    }
    return map;
  }, [items]);

  return { items, bySector, loading, error };
}

export function useExportItemData(itemId: string | null) {
  const [data, setData] = useState<ExportDataPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!itemId) {
      setData([]);
      return;
    }

    setLoading(true);
    fetchExportData(itemId)
      .then((result) => {
        if (process.env.NODE_ENV === "development") {
          console.log("[export] fetchExportData ->", result.length, "rows", result);
        }
        setData(result);
      })
      .catch((err: unknown) => {
        console.error("[export] fetchExportData failed:", err);
        setData([]);
      })
      .finally(() => setLoading(false));
  }, [itemId]);

  return { data, loading };
}
