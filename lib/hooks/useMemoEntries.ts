"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { MemoEntry } from "@/lib/models/types";
import {
  createMemoRepository,
  LocalMemoRepository,
  MemoRepository,
} from "@/lib/repository/memoRepository";
import { createId } from "@/lib/utils/id";

interface MemoEntryInput {
  date: string;
  title?: string;
  body: string;
  tags: string[];
}

function sortEntries(entries: MemoEntry[]): MemoEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);

    if (byDate !== 0) {
      return byDate;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
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

  useEffect(() => {
    fallbackRepositoryRef.current = null;
  }, [userId]);

  const activeRepository = useCallback((): MemoRepository => {
    return fallbackRepositoryRef.current ?? primaryRepository;
  }, [primaryRepository]);

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
      const next = await activeRepository().getEntries();

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
  }, [activeRepository, authLoading, isAuthenticated]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  const upsert = useCallback(
    (input: MemoEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const nowIso = new Date().toISOString();
          const current = await repo.getEntries();
          const existing = current.find((item) => item.date === input.date);

          const next: MemoEntry = {
            id: existing?.id ?? createId(),
            date: input.date,
            title: input.title?.trim() ? input.title.trim() : undefined,
            body: input.body,
            tags: input.tags,
            createdAt: existing?.createdAt ?? nowIso,
            updatedAt: nowIso,
          };

          await repo.upsertEntry(next, { isCreate: !existing });
          setEntries(sortEntries(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to save", error);
          window.alert(`메모 저장 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  const removeByDate = useCallback(
    (date: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const current = await repo.getEntries();
          const target = current.find((item) => item.date === date);

          if (!target) {
            return;
          }

          await repo.deleteEntry(target.id);
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
    upsert,
    removeByDate,
  };
}
