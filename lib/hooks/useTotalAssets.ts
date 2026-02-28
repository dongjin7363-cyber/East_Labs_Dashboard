"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@/lib/utils/id";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  createTotalAssetRepository,
  LocalTotalAssetRepository,
  SupabaseTotalAssetRepository,
  TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY,
} from "@/lib/repository/totalAssetRepository";
import { TotalAssetSnapshot } from "@/lib/models/types";
import { FINANCE_DATA_EVENT, notifyFinanceDataChanged } from "@/lib/services/events";
import { TotalAssetSnapshotInput } from "@/lib/services/totalAssetService";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
}

function sortSnapshots(snapshots: TotalAssetSnapshot[]): TotalAssetSnapshot[] {
  return [...snapshots].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function buildSnapshotFromInput(
  input: TotalAssetSnapshotInput,
  base: Pick<TotalAssetSnapshot, "id" | "createdAt">,
): TotalAssetSnapshot {
  const normalizedFxRate = Number(input.fxRate);

  return {
    id: base.id,
    date: input.date,
    totalAssetKrwInt: Math.max(Math.round(input.totalAssetKrwInt), 0),
    fxRate:
      Number.isFinite(normalizedFxRate) && normalizedFxRate > 0
        ? normalizedFxRate
        : 1350,
    notes: input.notes?.trim() ? input.notes.trim() : undefined,
    createdAt: base.createdAt,
  };
}

export function useTotalAssets() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createTotalAssetRepository(userId), [userId]);
  const [snapshots, setSnapshots] = useState<TotalAssetSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  const maybeAutoSyncFromLocal = useCallback(
    async (cloudSnapshots: TotalAssetSnapshot[]): Promise<boolean> => {
      if (!userId || cloudSnapshots.length > 0) {
        return false;
      }

      if (syncAttemptedUserRef.current === userId) {
        return false;
      }
      syncAttemptedUserRef.current = userId;

      if (typeof window === "undefined") {
        return false;
      }

      const alreadySynced =
        window.localStorage.getItem(TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY) === "true";

      if (alreadySynced) {
        return false;
      }

      try {
        const localRepository = new LocalTotalAssetRepository();
        const cloudRepository = new SupabaseTotalAssetRepository(userId);
        const localSnapshots = await localRepository.getSnapshots();

        if (localSnapshots.length === 0) {
          return false;
        }

        for (const snapshot of localSnapshots) {
          await cloudRepository.upsertSnapshot(snapshot);
        }

        window.localStorage.setItem(TOTAL_ASSET_SNAPSHOTS_SYNCED_FLAG_KEY, "true");
        return true;
      } catch (error) {
        console.error("[total-assets] auto sync failed", errorMessage(error));
        return false;
      }
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setSnapshots([]);
      setLoading(false);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      let next = await repository.getSnapshots();

      if (userId) {
        const synced = await maybeAutoSyncFromLocal(next);

        if (synced) {
          next = await repository.getSnapshots();
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      setSnapshots(sortSnapshots(next));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[total-assets] failed to load", error);
      }

      if (requestSeq === requestSeqRef.current) {
        setSnapshots([]);
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, isAuthenticated, maybeAutoSyncFromLocal, repository, userId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    const onChanged = () => {
      void refresh();
    };
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

      void (async () => {
        try {
          const current = await repository.getSnapshots();
          const existing = current.find((snapshot) => snapshot.date === input.date);
          const next = existing
            ? buildSnapshotFromInput(input, {
                id: existing.id,
                createdAt: existing.createdAt,
              })
            : buildSnapshotFromInput(input, {
                id: createId(),
                createdAt: new Date().toISOString(),
              });

          await repository.upsertSnapshot(next, { isCreate: !existing });
          setSnapshots(sortSnapshots(await repository.getSnapshots()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[total-assets] failed to upsert", error);
          window.alert(`총자산 스냅샷 저장 실패: ${message}`);
        }
      })();

      return snapshots;
    },
    [isAuthenticated, repository, snapshots],
  );

  const saveNotes = useCallback(
    (date: string, notes: string): TotalAssetSnapshot[] => {
      if (!isAuthenticated) {
        return snapshots;
      }

      void (async () => {
        try {
          const current = await repository.getSnapshots();
          const existing = current.find((snapshot) => snapshot.date === date);

          if (!existing) {
            return;
          }

          const next: TotalAssetSnapshot = {
            ...existing,
            notes: notes.trim() ? notes.trim() : undefined,
          };

          await repository.upsertSnapshot(next);
          setSnapshots(sortSnapshots(await repository.getSnapshots()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[total-assets] failed to save notes", error);
          window.alert(`총자산 메모 저장 실패: ${message}`);
        }
      })();

      return snapshots;
    },
    [isAuthenticated, repository, snapshots],
  );

  const removeSnapshot = useCallback(
    (date: string): TotalAssetSnapshot[] => {
      if (!isAuthenticated) {
        return snapshots;
      }

      void (async () => {
        try {
          await repository.deleteSnapshotByDate(date);
          setSnapshots(sortSnapshots(await repository.getSnapshots()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[total-assets] failed to delete", error);
          window.alert(`총자산 스냅샷 삭제 실패: ${message}`);
        }
      })();

      return snapshots;
    },
    [isAuthenticated, repository, snapshots],
  );

  const readSnapshotByDate = useCallback(
    (date: string): TotalAssetSnapshot | undefined => {
      if (!isAuthenticated) {
        return undefined;
      }

      return snapshots.find((snapshot) => snapshot.date === date);
    },
    [isAuthenticated, snapshots],
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
