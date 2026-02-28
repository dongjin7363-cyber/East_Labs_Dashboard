"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import { MarketPost } from "@/lib/models/types";
import {
  createMarketRepository,
  LocalMarketRepository,
  MarketRepository,
} from "@/lib/repository/marketRepository";
import { createId } from "@/lib/utils/id";

interface MarketPostInput {
  date: string;
  macroText: string;
  indicesText: string;
  notesText: string;
}

function sortPosts(posts: MarketPost[]): MarketPost[] {
  return [...posts].sort((a, b) => {
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

export function useMarketPosts() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const primaryRepository = useMemo(() => createMarketRepository(userId), [userId]);
  const fallbackRepositoryRef = useRef<MarketRepository | null>(null);
  const [posts, setPosts] = useState<MarketPost[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    fallbackRepositoryRef.current = null;
  }, [userId]);

  const activeRepository = useCallback((): MarketRepository => {
    return fallbackRepositoryRef.current ?? primaryRepository;
  }, [primaryRepository]);

  const refresh = useCallback(async () => {
    if (authLoading) {
      return;
    }

    if (!isAuthenticated) {
      setPosts([]);
      setLoading(false);
      return;
    }

    const requestSeq = ++requestSeqRef.current;
    setLoading(true);

    try {
      const next = await activeRepository().getPosts();

      if (requestSeq !== requestSeqRef.current) {
        return;
      }

      setPosts(sortPosts(next));
    } catch {
      try {
        fallbackRepositoryRef.current = new LocalMarketRepository();
        const next = await fallbackRepositoryRef.current.getPosts();

        if (requestSeq !== requestSeqRef.current) {
          return;
        }

        setPosts(sortPosts(next));
      } catch (error) {
        if (requestSeq === requestSeqRef.current) {
          setPosts([]);
        }

        if (process.env.NODE_ENV === "development") {
          console.error("[market] failed to load", errorMessage(error));
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
    (input: MarketPostInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const nowIso = new Date().toISOString();
          const current = await repo.getPosts();
          const existing = current.find((item) => item.date === input.date);

          const next: MarketPost = {
            id: existing?.id ?? createId(),
            date: input.date,
            macroText: input.macroText,
            indicesText: input.indicesText,
            notesText: input.notesText,
            createdAt: existing?.createdAt ?? nowIso,
            updatedAt: nowIso,
          };

          await repo.upsertPost(next, { isCreate: !existing });
          setPosts(sortPosts(await repo.getPosts()));
        } catch (error) {
          console.error("[market] failed to save", error);
          window.alert(`Market 저장 실패: ${errorMessage(error)}`);
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
          const current = await repo.getPosts();
          const target = current.find((item) => item.date === date);

          if (!target) {
            return;
          }

          await repo.deletePost(target.id);
          setPosts(sortPosts(await repo.getPosts()));
        } catch (error) {
          console.error("[market] failed to delete", error);
          window.alert(`Market 삭제 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  return {
    posts,
    loading,
    authLoading,
    isAuthenticated,
    refresh,
    upsert,
    removeByDate,
  };
}
