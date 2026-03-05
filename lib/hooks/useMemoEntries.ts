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
import { supabase } from "@/lib/supabaseClient";
import { createId } from "@/lib/utils/id";

const MEMO_IMAGE_BUCKET = "memo-images";

export interface MemoEntryInput {
  date: string;
  buyTickers: string;
  sellTickers: string;
  comment: string;
}

export interface MemoMutationOptions {
  attachmentFiles?: File[];
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

function sanitizeFileName(fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");

  if (!sanitized) {
    return "image";
  }

  return sanitized;
}

function normalizeImagePaths(paths: string[] | undefined): string[] {
  if (!Array.isArray(paths)) {
    return [];
  }

  return Array.from(
    new Set(
      paths
        .map((path) => path.trim())
        .filter(Boolean),
    ),
  );
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

  const hydrateSignedUrls = useCallback(
    async (sourceEntries: MemoEntry[]): Promise<MemoEntry[]> => {
      const normalized = sortEntries(sourceEntries).map((entry) => ({
        ...entry,
        imagePaths: normalizeImagePaths(entry.imagePaths),
      }));

      if (normalized.length === 0 || !userId) {
        return normalized.map((entry) => ({
          ...entry,
          imageSignedUrls: {},
        }));
      }

      const uniquePaths = Array.from(
        new Set(
          normalized
            .flatMap((entry) => entry.imagePaths)
            .map((path) => path.trim())
            .filter(Boolean),
        ),
      );

      if (uniquePaths.length === 0) {
        return normalized.map((entry) => ({
          ...entry,
          imageSignedUrls: {},
        }));
      }

      const signedPairs = await Promise.all(
        uniquePaths.map(async (path) => {
          const { data, error } = await supabase
            .storage
            .from(MEMO_IMAGE_BUCKET)
            .createSignedUrl(path, 60 * 60 * 6);

          if (error) {
            if (process.env.NODE_ENV === "development") {
              console.warn("[memo] signed url failed", path, error.message);
            }

            return [path, null] as const;
          }

          return [path, data?.signedUrl ?? null] as const;
        }),
      );

      const signedUrlMap = Object.fromEntries(signedPairs);

      return normalized.map((entry) => {
        const imageSignedUrls: Record<string, string | null> = {};

        entry.imagePaths.forEach((path) => {
          imageSignedUrls[path] = signedUrlMap[path] ?? null;
        });

        return {
          ...entry,
          imageSignedUrls,
        };
      });
    },
    [userId],
  );

  const uploadMemoImages = useCallback(
    async (date: string, files?: File[]): Promise<string[]> => {
      if (!userId || !files || files.length === 0) {
        return [];
      }

      const uploadedPaths: string[] = [];

      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          continue;
        }

        const filePath = `${userId}/${date}/${createId()}-${sanitizeFileName(file.name)}`;
        const { error } = await supabase
          .storage
          .from(MEMO_IMAGE_BUCKET)
          .upload(filePath, file, {
            upsert: false,
            cacheControl: "3600",
          });

        if (error) {
          throw error;
        }

        uploadedPaths.push(filePath);
      }

      return uploadedPaths;
    },
    [userId],
  );

  const removeMemoImages = useCallback(async (paths: string[]) => {
    const normalizedPaths = normalizeImagePaths(paths);

    if (normalizedPaths.length === 0) {
      return;
    }

    const { error } = await supabase.storage.from(MEMO_IMAGE_BUCKET).remove(normalizedPaths);

    if (error && process.env.NODE_ENV === "development") {
      console.warn("[memo] image remove failed", error.message);
    }
  }, []);

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

      setEntries(await hydrateSignedUrls(next));
    } catch {
      try {
        fallbackRepositoryRef.current = new LocalMemoRepository();
        const next = await fallbackRepositoryRef.current.getEntries();

        if (requestSeq !== requestSeqRef.current) {
          return;
        }

        setEntries(await hydrateSignedUrls(next));
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
  }, [
    activeRepository,
    authLoading,
    hydrateSignedUrls,
    isAuthenticated,
    maybeAutoSyncFromLocal,
    userId,
  ]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    void refresh();
  }, [authLoading, refresh]);

  const createEntry = useCallback(
    (input: MemoEntryInput, options?: MemoMutationOptions) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const nowIso = new Date().toISOString();
          const uploadedPaths = await uploadMemoImages(input.date, options?.attachmentFiles);
          const next: MemoEntry = {
            id: createId(),
            date: input.date,
            buyTickers: normalizeTickerCsv(input.buyTickers),
            sellTickers: normalizeTickerCsv(input.sellTickers),
            comment: input.comment,
            imagePaths: uploadedPaths,
            createdAt: nowIso,
            updatedAt: nowIso,
          };

          await repo.upsertEntry(next, { isCreate: true });
          setEntries(await hydrateSignedUrls(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to create", error);
          window.alert(`메모 저장 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, hydrateSignedUrls, isAuthenticated, uploadMemoImages],
  );

  const updateEntry = useCallback(
    (id: string, input: MemoEntryInput, options?: MemoMutationOptions) => {
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

          const uploadedPaths = await uploadMemoImages(input.date, options?.attachmentFiles);
          const next: MemoEntry = {
            ...target,
            date: input.date,
            buyTickers: normalizeTickerCsv(input.buyTickers),
            sellTickers: normalizeTickerCsv(input.sellTickers),
            comment: input.comment,
            imagePaths: normalizeImagePaths([...target.imagePaths, ...uploadedPaths]),
            updatedAt: new Date().toISOString(),
          };

          await repo.upsertEntry(next);
          setEntries(await hydrateSignedUrls(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to update", error);
          window.alert(`메모 수정 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, hydrateSignedUrls, isAuthenticated, uploadMemoImages],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const current = await repo.getEntries();
          const target = current.find((item) => item.id === id);

          await repo.deleteEntry(id);

          if (target?.imagePaths.length) {
            await removeMemoImages(target.imagePaths);
          }

          setEntries(await hydrateSignedUrls(await repo.getEntries()));
        } catch (error) {
          console.error("[memo] failed to delete", error);
          window.alert(`메모 삭제 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, hydrateSignedUrls, isAuthenticated, removeMemoImages],
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
