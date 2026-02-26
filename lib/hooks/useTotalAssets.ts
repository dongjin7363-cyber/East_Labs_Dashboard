"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { TotalAssetSnapshot } from "@/lib/models/types";
import { FINANCE_DATA_EVENT, notifyFinanceDataChanged } from "@/lib/services/events";
import {
  deleteTotalAssetSnapshotByDate,
  getTotalAssetSnapshotByDate,
  listTotalAssetSnapshots,
  TotalAssetSnapshotInput,
  updateTotalAssetSnapshotNotes,
  upsertTotalAssetSnapshot,
} from "@/lib/services/totalAssetService";

export function useTotalAssets() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [snapshots, setSnapshots] = useState<TotalAssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setSnapshots([]);
      setLoading(false);
      return;
    }

    setSnapshots(listTotalAssetSnapshots());
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

  const getSnapshotByDate = useCallback(
    (date: string): TotalAssetSnapshot | undefined =>
      snapshots.find((snapshot) => snapshot.date === date),
    [snapshots],
  );

  const upsertSnapshot = useCallback(
    (input: TotalAssetSnapshotInput): TotalAssetSnapshot[] => {
      if (!isAuthenticated) {
        return snapshots;
      }

      const updated = upsertTotalAssetSnapshot(input);
      setSnapshots(updated);
      notifyFinanceDataChanged();

      return updated;
    },
    [isAuthenticated, snapshots],
  );

  const saveNotes = useCallback(
    (date: string, notes: string): TotalAssetSnapshot[] => {
      if (!isAuthenticated) {
        return snapshots;
      }

      const updated = updateTotalAssetSnapshotNotes(date, notes);
      setSnapshots(updated);
      notifyFinanceDataChanged();

      return updated;
    },
    [isAuthenticated, snapshots],
  );

  const removeSnapshot = useCallback(
    (date: string): TotalAssetSnapshot[] => {
      if (!isAuthenticated) {
        return snapshots;
      }

      const updated = deleteTotalAssetSnapshotByDate(date);
      setSnapshots(updated);
      notifyFinanceDataChanged();

      return updated;
    },
    [isAuthenticated, snapshots],
  );

  const readSnapshotByDate = useCallback(
    (date: string): TotalAssetSnapshot | undefined => {
      if (!isAuthenticated) {
        return undefined;
      }

      return getTotalAssetSnapshotByDate(date);
    },
    [isAuthenticated],
  );

  return {
    snapshots,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    getSnapshotByDate,
    readSnapshotByDate,
    upsertSnapshot,
    saveNotes,
    removeSnapshot,
  };
}
