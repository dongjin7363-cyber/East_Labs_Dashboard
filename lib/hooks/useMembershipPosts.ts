"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  createMembershipRepository,
  LocalMembershipRepository,
  MembershipRepository,
} from "@/lib/repository/membershipRepository";
import { MembershipCategory, MembershipPost } from "@/lib/models/types";
import { createId } from "@/lib/utils/id";

interface MembershipPostInput {
  title: string;
  category: MembershipCategory;
  body: string;
  isPublic: boolean;
}

function sortPosts(posts: MembershipPost[]): MembershipPost[] {
  return [...posts].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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

export function useMembershipPosts() {
  const { userId, isAuthenticated, loading: authLoading } = useAuth();
  const primaryRepository = useMemo(
    () => createMembershipRepository(userId),
    [userId],
  );
  const fallbackRepositoryRef = useRef<MembershipRepository | null>(null);
  const [posts, setPosts] = useState<MembershipPost[]>([]);
  const [loading, setLoading] = useState(true);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    fallbackRepositoryRef.current = null;
  }, [userId]);

  const activeRepository = useCallback((): MembershipRepository => {
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
        fallbackRepositoryRef.current = new LocalMembershipRepository();
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
          console.error("[membership] failed to load", errorMessage(error));
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

  const createPost = useCallback(
    (input: MembershipPostInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const nowIso = new Date().toISOString();
          const next: MembershipPost = {
            id: createId(),
            title: input.title.trim(),
            category: input.category,
            body: input.body,
            isPublic: input.isPublic,
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          const repo = activeRepository();
          await repo.upsertPost(next, { isCreate: true });
          setPosts(sortPosts(await repo.getPosts()));
        } catch (error) {
          console.error("[membership] failed to create", error);
          window.alert(`Membership 저장 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  const updatePost = useCallback(
    (id: string, input: MembershipPostInput) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          const current = await repo.getPosts();
          const target = current.find((item) => item.id === id);

          if (!target) {
            return;
          }

          const next: MembershipPost = {
            ...target,
            title: input.title.trim(),
            category: input.category,
            body: input.body,
            isPublic: input.isPublic,
            updatedAt: new Date().toISOString(),
          };

          await repo.upsertPost(next);
          setPosts(sortPosts(await repo.getPosts()));
        } catch (error) {
          console.error("[membership] failed to update", error);
          window.alert(`Membership 수정 실패: ${errorMessage(error)}`);
        }
      })();
    },
    [activeRepository, isAuthenticated],
  );

  const removePost = useCallback(
    (id: string) => {
      if (!isAuthenticated) {
        return;
      }

      void (async () => {
        try {
          const repo = activeRepository();
          await repo.deletePost(id);
          setPosts(sortPosts(await repo.getPosts()));
        } catch (error) {
          console.error("[membership] failed to delete", error);
          window.alert(`Membership 삭제 실패: ${errorMessage(error)}`);
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
    createPost,
    updatePost,
    removePost,
  };
}
