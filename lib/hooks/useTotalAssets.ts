"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { TotalAssetSnapshot } from "@/lib/models/types";
import {
  createTotalAssetRepository,
  LocalTotalAssetRepository,
  SupabaseTotalAssetRepository,
  TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY,
  writeSnapshotsToLocalStorage,
} from "@/lib/repository/totalAssetRepository";
import { TotalAssetSnapshotInput } from "@/lib/services/totalAssetService";
import { FINANCE_DATA_EVENT, notifyFinanceDataChanged } from "@/lib/services/events";
import { createId } from "@/lib/utils/id";

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
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createTotalAssetRepository(userId), [userId]);
  const [snapshots, setSnapshots] = useState<TotalAssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncAttemptedUserId, setSyncAttemptedUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setSyncAttemptedUserId(null);
    }
  }, [isAuthenticated]);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setSnapshots([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      let next = await repository.getSnapshots();

      if (userId && next.length === 0) {
        const alreadySynced =
          typeof window !== "undefined" &&
          window.localStorage.getItem(TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY) === "true";

        if (!alreadySynced && syncAttemptedUserId !== userId) {
          setSyncAttemptedUserId(userId);

          const localRepository = new LocalTotalAssetRepository();
          const localSnapshots = await localRepository.getSnapshots();

          if (localSnapshots.length > 0) {
            const cloudRepository = new SupabaseTotalAssetRepository(userId);

            for (const snapshot of localSnapshots) {
              await cloudRepository.upsertSnapshot(snapshot);
            }

            window.localStorage.setItem(
              TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY,
              "true",
            );
            next = await cloudRepository.getSnapshots();
          }
        }
      }

      setSnapshots(sortSnapshots(next));
      writeSnapshotsToLocalStorage(next);
    } catch (error) {
      console.error("total_asset_snapshots load error", error);

      const localRepository = new LocalTotalAssetRepository();
      const fallback = await localRepository.getSnapshots();
      setSnapshots(sortSnapshots(fallback));
    } finally {
      setLoading(false);
    }
  }, [
    authLoading,
    isAuthenticated,
    repository,
    syncAttemptedUserId,
    userId,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChanged = () => {
      void refresh();
    };
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

      void (async () => {
        try {
          const existing = snapshots.find((snapshot) => snapshot.date === input.date);
          const nextSnapshot: TotalAssetSnapshot = {
            id: existing?.id ?? createId(),
            date: input.date,
            totalAssetKrwInt: Math.max(Math.round(input.totalAssetKrwInt), 0),
            fxRate: Number.isFinite(input.fxRate) && input.fxRate > 0 ? input.fxRate : 1350,
            memo: input.memo?.trim() ? input.memo.trim() : undefined,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
          };

          await repository.upsertSnapshot(nextSnapshot);
          const next = sortSnapshots(await repository.getSnapshots());
          setSnapshots(next);
          writeSnapshotsToLocalStorage(next);
          notifyFinanceDataChanged();
        } catch (error) {
          const message =
            error && typeof error === "object" && "message" in error
              ? String((error as { message: unknown }).message)
              : "unknown error";

          console.error("[total-assets] upsert failed", error);
          window.alert(`총자산 저장 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository, snapshots],
  );

  const saveMemo = useCallback(
    (date: string, memo?: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const current = await repository.getSnapshots();
          const target = current.find((snapshot) => snapshot.date === date);

          if (!target) {
            return;
          }

          await repository.upsertSnapshot({
            ...target,
            memo: memo?.trim() ? memo.trim() : undefined,
          });

          const next = sortSnapshots(await repository.getSnapshots());
          setSnapshots(next);
          writeSnapshotsToLocalStorage(next);
          notifyFinanceDataChanged();
        } catch (error) {
          console.error("[total-assets] memo save failed", error);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const removeSnapshot = useCallback(
    (date: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          await repository.deleteSnapshot(date);
          const next = sortSnapshots(await repository.getSnapshots());
          setSnapshots(next);
          writeSnapshotsToLocalStorage(next);
          notifyFinanceDataChanged();
        } catch (error) {
          const message =
            error && typeof error === "object" && "message" in error
              ? String((error as { message: unknown }).message)
              : "unknown error";

          console.error("[total-assets] delete failed", error);
          window.alert(`총자산 삭제 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const replaceSnapshots = useCallback(
    (nextSnapshots: TotalAssetSnapshot[]) => {
      const next = sortSnapshots(nextSnapshots);
      writeSnapshotsToLocalStorage(next);
      setSnapshots(next);
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
