"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createId } from "@/lib/utils/id";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  createExpenseRepository,
  EXPENSE_ENTRIES_SYNCED_FLAG_KEY,
  LocalExpenseRepository,
  SupabaseExpenseRepository,
} from "@/lib/repository/expenseRepository";
import { ExpenseEntry } from "@/lib/models/types";
import { ExpenseEntryInput } from "@/lib/services/expenseService";
import {
  FINANCE_DATA_EVENT,
  notifyFinanceDataChanged,
} from "@/lib/services/events";

function errorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.trim() !== "") {
      return message;
    }
  }

  return "unknown error";
}

function sortEntries(entries: ExpenseEntry[]): ExpenseEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function buildEntryFromInput(
  input: ExpenseEntryInput,
  base: Pick<ExpenseEntry, "id" | "createdAt">,
): ExpenseEntry {
  return {
    id: base.id,
    date: input.date,
    bucket: input.bucket,
    subcategory: input.subcategory,
    amountInt: Math.max(Math.round(input.amountInt), 0),
    note: input.note.trim(),
    createdAt: base.createdAt,
  };
}

export function useExpenses() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const repository = useMemo(() => createExpenseRepository(userId), [userId]);
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);
  const syncAttemptedUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      syncAttemptedUserRef.current = null;
    }
  }, [isAuthenticated]);

  const maybeAutoSyncFromLocal = useCallback(
    async (cloudEntries: ExpenseEntry[]): Promise<boolean> => {
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
        window.localStorage.getItem(EXPENSE_ENTRIES_SYNCED_FLAG_KEY) === "true";

      if (alreadySynced) {
        return false;
      }

      try {
        const localRepository = new LocalExpenseRepository();
        const cloudRepository = new SupabaseExpenseRepository(userId);
        const localEntries = await localRepository.getEntries();

        if (localEntries.length === 0) {
          return false;
        }

        for (const entry of localEntries) {
          await cloudRepository.upsertEntry(entry);
        }

        window.localStorage.setItem(EXPENSE_ENTRIES_SYNCED_FLAG_KEY, "true");
        return true;
      } catch (error) {
        console.error("[expenses] auto sync failed", errorMessage(error));
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
      let next = await repository.getEntries();

      if (userId) {
        const synced = await maybeAutoSyncFromLocal(next);

        if (synced) {
          next = await repository.getEntries();
        }
      }

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      setEntries(sortEntries(next));
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[expenses] failed to load", error);
      }

      if (requestSeq === requestSeqRef.current) {
        setEntries([]);
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

  const create = useCallback(
    (input: ExpenseEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const nowIso = new Date().toISOString();
          const next = buildEntryFromInput(input, {
            id: createId(),
            createdAt: nowIso,
          });

          await repository.upsertEntry(next, { isCreate: true });
          setEntries(sortEntries(await repository.getEntries()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[expenses] failed to create", error);
          window.alert(`지출 항목 저장 실패: ${message}`);
        }
      })();
    },
    [isAuthenticated, repository],
  );

  const update = useCallback(
    (id: string, input: ExpenseEntryInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const current = await repository.getEntries();
          const target = current.find((item) => item.id === id);

          if (!target) {
            return;
          }

          const next = buildEntryFromInput(input, {
            id: target.id,
            createdAt: target.createdAt,
          });

          await repository.upsertEntry(next);
          setEntries(sortEntries(await repository.getEntries()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[expenses] failed to update", error);
          window.alert(`지출 항목 수정 실패: ${message}`);
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
          setEntries(sortEntries(await repository.getEntries()));
          notifyFinanceDataChanged();
        } catch (error) {
          const message = errorMessage(error);
          console.error("[expenses] failed to delete", error);
          window.alert(`지출 항목 삭제 실패: ${message}`);
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
