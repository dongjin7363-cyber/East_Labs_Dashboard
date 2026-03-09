"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthState {
  loading: boolean;
  session: Session | null;
}

interface AuthActionResult {
  ok: boolean;
  message?: string;
}

const INITIAL_STATE: AuthState = {
  loading: true,
  session: null,
};

let authState: AuthState = INITIAL_STATE;
let initialized = false;
const listeners = new Set<(state: AuthState) => void>();

function publish(nextState: AuthState): void {
  authState = nextState;
  listeners.forEach((listener) => listener(nextState));
}

function ensureAuthInitialized(): void {
  if (initialized) {
    return;
  }

  initialized = true;

  void (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      publish({
        loading: false,
        session: data.session ?? null,
      });
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("[auth] failed to restore session", error);
      }

      publish({
        loading: false,
        session: null,
      });
    }
  })();

  supabase.auth.onAuthStateChange((_event, session) => {
    publish({
      loading: false,
      session: session ?? null,
    });
  });
}

export function useAuth() {
  const [state, setState] = useState<AuthState>(authState);

  useEffect(() => {
    ensureAuthInitialized();
    setState(authState);
    listeners.add(setState);

    return () => {
      listeners.delete(setState);
    };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        return {
          ok: false,
          message: error.message,
        };
      }

      return {
        ok: true,
      };
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        return {
          ok: false,
          message: error.message,
        };
      }

      return {
        ok: true,
      };
    },
    [],
  );

  const signInWithKakao = useCallback(async (): Promise<AuthActionResult> => {
    const redirectTo =
      typeof window !== "undefined" ? window.location.origin : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: redirectTo
        ? {
            redirectTo,
          }
        : undefined,
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    return {
      ok: true,
    };
  }, []);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    return {
      ok: true,
    };
  }, []);

  const session = state.session;

  return {
    loading: state.loading,
    session,
    isAuthenticated: Boolean(session?.user),
    userId: session?.user?.id ?? null,
    email: session?.user?.email ?? null,
    signUp,
    signIn,
    signInWithKakao,
    signOut,
  };
}
