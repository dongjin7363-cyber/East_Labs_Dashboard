"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

export function AuthButton() {
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();

      if (mounted) {
        setSession(data.session ?? null);
      }
    };

    void loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setMessage("");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const handleSendLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setMessage("이메일을 입력하세요.");
      return;
    }

    setIsSending(true);
    setMessage("");

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        setMessage(`전송 실패: ${error.message}`);
        return;
      }

      setMessage("매직링크를 전송했습니다. 이메일을 확인하세요.");
    } finally {
      setIsSending(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (session) {
    return (
      <div className="auth-wrap">
        <span className="auth-user">{session.user.email ?? "Logged in"}</span>
        <button type="button" className="top-nav-backup-button" onClick={handleLogout}>
          Logout
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSendLink}>
      <input
        type="email"
        className="auth-email-input"
        value={email}
        placeholder="Email"
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit" className="top-nav-backup-button" disabled={isSending}>
        {isSending ? "Sending..." : "Send link"}
      </button>
      {message ? <span className="auth-message">{message}</span> : null}
    </form>
  );
}
