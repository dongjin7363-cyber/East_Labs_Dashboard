"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  DEFAULT_MEMO_TYPE,
  MEMO_SENTIMENTS,
  MEMO_TYPES,
  MemoEntry,
  MemoSentiment,
  MemoType,
} from "@/lib/models/types";
import {
  createMemoRepository,
  getLocalMemoEntries,
  MEMO_ENTRIES_SYNCED_FLAG_KEY,
  replaceLocalMemoEntries,
  SupabaseMemoRepository,
} from "@/lib/repository/memoRepository";
import { createId } from "@/lib/utils/id";

export interface MemoEntryInput {
  date: string;
  title: string;
  content: string;
  memoType?: MemoType;
  sentiment?: MemoSentiment | "";
  buyTickers?: string;
  sellTickers?: string;
  comment?: string;
  imagePaths?: string[];
}

interface NormalizedMemoEntryInput {
  date: string;
  title: string;
  content: string;
  memoType: MemoType;
  sentiment: MemoSentiment | "";
  buyTickers?: string;
  sellTickers?: string;
  comment: string;
  imagePaths?: string[];
}

function sortEntries(entries: MemoEntry[]): MemoEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function normalizeMemoType(value: MemoType | undefined): MemoType {
  return value && MEMO_TYPES.includes(value) ? value : DEFAULT_MEMO_TYPE;
}

function normalizeSentiment(value: MemoSentiment | "" | undefined): MemoSentiment | "" {
  return value && MEMO_SENTIMENTS.includes(value) ? value : "";
}

function normalizeInput(input: MemoEntryInput): NormalizedMemoEntryInput {
  const content = input.content.trim();

  return {
    date: input.date,
    title: input.title.trim(),
    content,
    memoType: normalizeMemoType(input.memoType),
    sentiment: normalizeSentiment(input.sentiment),
    buyTickers: input.buyTickers?.trim(),
    sellTickers: input.sellTickers?.trim(),
    comment: (input.comment ?? content).trim(),
    imagePaths: (input.imagePaths ?? []).filter((path) => path.trim() !== ""),
  };
}

function toErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
}

export function useMemos() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createMemoRepository(userId), [userId]);
  const [entries, setEntries] = useState<MemoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

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
      let next = await repository.getAllEntries();

      if (userId && next.length === 0) {
        const alreadySynced =
          typeof window !== "undefined" &&
          window.localStorage.getItem(MEMO_ENTRIES_SYNCED_FLAG_KEY) === "true";

        if (!alreadySynced && syncAttemptedUserRef.current !== userId) {
          syncAttemptedUserRef.current = userId;

          const localEntries = getLocalMemoEntries();

          if (localEntries.length > 0) {
            const cloudRepository = new SupabaseMemoRepository(userId);

            for (const localEntry of localEntries) {
              await cloudRepository.upsertEntry(localEntry);
            }

            window.localStorage.setItem(MEMO_ENTRIES_SYNCED_FLAG_KEY, "true");
            next = await cloudRepository.getAllEntries();
          }
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      const sorted = sortEntries(next);
      setEntries(sorted);
      replaceLocalMemoEntries(sorted);
    } catch (error) {
      console.error("[memos] failed to load", error);
      const local = getLocalMemoEntries();

      if (requestSeq === requestSeqRef.current) {
        setEntries(sortEntries(local));
      }
    } finally {
      if (requestSeq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [authLoading, isAuthenticated, repository, userId]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  const create = useCallback(
    (input: MemoEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const normalized = normalizeInput(input);
          const nowIso = new Date().toISOString();
          const next: MemoEntry = {
            id: createId(),
            date: normalized.date,
            title: normalized.title,
            content: normalized.content,
            memoType: normalized.memoType,
            sentiment: normalized.sentiment,
            buyTickers: normalized.buyTickers ?? "",
            sellTickers: normalized.sellTickers ?? "",
            comment: normalized.comment,
            imagePaths: normalized.imagePaths ?? [],
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          await repository.upsertEntry(next, { isCreate: true });
          const updated = sortEntries(await repository.getAllEntries());
          setEntries(updated);
          replaceLocalMemoEntries(updated);
        } catch (error) {
          window.alert(`메모 저장 실패: ${toErrorMessage(error)}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const update = useCallback(
    (id: string, input: MemoEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const current = await repository.getAllEntries();
          const target = current.find((entry) => entry.id === id);

          if (!target) {
            return;
          }

          const normalized = normalizeInput(input);
          const next: MemoEntry = {
            ...target,
            date: normalized.date,
            title: normalized.title,
            content: normalized.content,
            memoType: normalized.memoType,
            sentiment: normalized.sentiment,
            buyTickers: normalized.buyTickers ?? target.buyTickers,
            sellTickers: normalized.sellTickers ?? target.sellTickers,
            comment: normalized.comment,
            imagePaths: normalized.imagePaths ?? target.imagePaths,
            updatedAt: new Date().toISOString(),
          };

          await repository.upsertEntry(next);
          const updated = sortEntries(await repository.getAllEntries());
          setEntries(updated);
          replaceLocalMemoEntries(updated);
        } catch (error) {
          window.alert(`메모 수정 실패: ${toErrorMessage(error)}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const remove = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          await repository.deleteEntry(id);
          const updated = sortEntries(await repository.getAllEntries());
          setEntries(updated);
          replaceLocalMemoEntries(updated);
        } catch (error) {
          window.alert(`메모 삭제 실패: ${toErrorMessage(error)}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  return {
    entries,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    create,
    update,
    remove,
  };
}
