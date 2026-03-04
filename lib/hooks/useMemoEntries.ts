"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { MemoEntry } from "@/lib/models/types";
import {
  createMemoRepository,
  LocalMemoRepository,
  MEMO_ENTRIES_SYNCED_FLAG_KEY,
  MemoRepository,
  SupabaseMemoRepository,
} from "@/lib/repository/memoRepository";
import { normalizeTickerCsv } from "@/lib/services/memoService";
import { createId } from "@/lib/utils/id";

export interface MemoEntryInput {
  date: string;
  buyTickers: string;
  sellTickers: string;
  comment: string;
}

function sortEntries(entries: MemoEntry[]): MemoEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byUpdatedAt = b.updatedAt.localeCompare(a.updatedAt);

    if (byUpdatedAt !== 0) {
      return byUpdatedAt;
    }

    return b.createdAt.localeCompare(a.createdAt);
  });
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
}

export function useMemoEntries() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const primaryRepository = useMemo(() => createMemoRepository(userId), [userId]);
  const fallbackRepositoryRef = useRef<MemoRepository | null>(null);
  const [entries, setEntries] = useState<MemoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    fallbackRepositoryRef.current = null;
  }, [userId]);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  const activeRepository = useCallback((): MemoRepository => {
    return fallbackRepositoryRef.current ?? primaryRepository;
  }, [primaryRepository]);

  const maybeAutoSyncFromLocal = useCallback(
    async (cloudEntries: MemoEntry[]): Promise<boolean> => {
      if (!userId || cloudEntries.length > 0) {
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
        window.localStorage.getItem(MEMO_ENTRIES_SYNCED_FLAG_KEY) === "true";

      if (alreadySynced) {
        return false;
      }

      try {
        const localRepository = new LocalMemoRepository();
        const cloudRepository = new SupabaseMemoRepository(userId);
        const localEntries = await localRepository.getEntries();

        if (localEntries.length === 0) {
          return false;
        }

        for (const entry of localEntries) {
          await cloudRepository.upsertEntry(entry);
        }

        window.localStorage.setItem(MEMO_ENTRIES_SYNCED_FLAG_KEY, "true");
        return true;
      } catch (error) {
        console.error("[memo] auto sync failed", errorMessage(error));
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
      setEntries([]);
      setLoading(false);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      let next = await activeRepository().getEntries();

      if (userId) {
        const synced = await maybeAutoSyncFromLocal(next);

        if (synced) {
          next = await activeRepository().getEntries();
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      setEntries(sortEntries(next));
    } catch {
      try {
        fallbackRepositoryRef.current = new LocalMemoRepository();
        const next = await fallbackRepositoryRef.current.getEntries();

        if (requestSeq !== requestSeqRef.current) {
          return;
        }

        setEntries(sortEntries(next));
      } catch (error) {
        if (requestSeq === requestSeqRef.current) {
          setEntries([]);
        }

        if (process.env.NODE_ENV === "development") {
          console.error("[memo] failed to load", errorMessage(error));
        }
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [activeRepository, authLoading, isAuthenticated, maybeAutoSyncFromLocal, userId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  const createEntry = useCallback(
    (input: MemoEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const nowIso = new Date().toISOString();
          const next: MemoEntry = {
            id: createId(),
            date: input.date,
            buyTickers: normalizeTickerCsv(input.buyTickers),
            sellTickers: normalizeTickerCsv(input.sellTickers),
            comment: input.comment,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          await repo.upsertEntry(next, { isCreate: true });
          setEntries(sortEntries(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to create", error);
          window.alert(`메모 저장 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  const updateEntry = useCallback(
    (id: string, input: MemoEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const current = await repo.getEntries();
          const target = current.find((item) => item.id === id);

          if (!target) {
            return;
          }

          const next: MemoEntry = {
            ...target,
            date: input.date,
            buyTickers: normalizeTickerCsv(input.buyTickers),
            sellTickers: normalizeTickerCsv(input.sellTickers),
            comment: input.comment,
            updatedAt: new Date().toISOString(),
          };

          await repo.upsertEntry(next);
          setEntries(sortEntries(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to update", error);
          window.alert(`메모 수정 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          await repo.deleteEntry(id);
          setEntries(sortEntries(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to delete", error);
          window.alert(`메모 삭제 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  return {
    entries,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
