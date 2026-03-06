"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { TotalAssetSnapshot } from "@/lib/models/types";
import {
  listTotalAssetSnapshots,
  replaceTotalAssetSnapshots,
  TotalAssetSnapshotInput,
  upsertTotalAssetSnapshot,
  updateTotalAssetSnapshotMemo,
  deleteTotalAssetSnapshotByDate,
} from "@/lib/services/totalAssetService";
import { FINANCE_DATA_EVENT, notifyFinanceDataChanged } from "@/lib/services/events";

function sortSnapshots(snapshots: TotalAssetSnapshot[]): TotalAssetSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function useTotalAssets() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [snapshots, setSnapshots] = useState<TotalAssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (!isAuthenticated) {
      setSnapshots([]);
      setLoading(false);
      return;
    }

    setSnapshots(sortSnapshots(listTotalAssetSnapshots()));
    setLoading(false);
  }, [isAuthenticated]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => refresh();
    window.addEventListener(FINANCE_DATA_EVENT, onChanged);

    return () => {
      window.removeEventListener(FINANCE_DATA_EVENT, onChanged);
    };
  }, [refresh]);

  const getSnapshotByDate = useCallback(
    (date: string) => snapshots.find((snapshot) => snapshot.date === date),
    [snapshots],
  );

  const upsertSnapshot = useCallback(
    (input: TotalAssetSnapshotInput) => {
      if (!isAuthenticated) {
        return;
      }

      const next = upsertTotalAssetSnapshot(input);
      setSnapshots(sortSnapshots(next));
      notifyFinanceDataChanged();
    },
    [isAuthenticated],
  );

  const saveMemo = useCallback(
    (date: string, memo?: string) => {
      if (!isAuthenticated) {
        return;
      }

      const next = updateTotalAssetSnapshotMemo(date, memo ?? "");
      setSnapshots(sortSnapshots(next));
      notifyFinanceDataChanged();
    },
    [isAuthenticated],
  );

  const removeSnapshot = useCallback(
    (date: string) => {
      if (!isAuthenticated) {
        return;
      }

      const next = deleteTotalAssetSnapshotByDate(date);
      setSnapshots(sortSnapshots(next));
      notifyFinanceDataChanged();
    },
    [isAuthenticated],
  );

  const replaceSnapshots = useCallback(
    (nextSnapshots: TotalAssetSnapshot[]) => {
      const next = replaceTotalAssetSnapshots(nextSnapshots);
      setSnapshots(sortSnapshots(next));
      notifyFinanceDataChanged();
    },
    [],
  );

  return {
    snapshots,
    loading: loading || authLoading,
    isAuthenticated,
    refresh,
    getSnapshotByDate,
    upsertSnapshot,
    saveMemo,
    removeSnapshot,
    replaceSnapshots,
  };
}
