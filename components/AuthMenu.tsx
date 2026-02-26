"use client";

import { FormEvent, useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/lib/hooks/useAuth";
import { supabase } from "@/lib/supabaseClient";

type AuthMode = "login" | "signup";

export function AuthMenu() {
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const openModal = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setInfoMessage("");
    setOpen(true);
  };

  const closeModal = () => {
    setOpen(false);
    setErrorMessage("");
    setInfoMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const normalizedPassword = password.trim();

    if (!normalizedEmail) {
      setErrorMessage("이메일을 입력하세요.");
      return;
    }

    if (!normalizedPassword) {
      setErrorMessage("비밀번호를 입력하세요.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: normalizedPassword,
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        if (data.session) {
          setEmail("");
          setPassword("");
          closeModal();
          return;
        }

        setInfoMessage("회원가입 요청이 완료되었습니다. 이메일 확인 후 로그인하세요.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: normalizedPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      setEmail("");
      setPassword("");
      closeModal();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="auth-menu-actions">
        <button type="button" className="top-nav-backup-button" disabled>
          Auth...
        </button>
      </div>
    );
  }

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

  const submitLabel = mode === "signup" ? "Sign up" : "Log in";
  const title = mode === "signup" ? "Sign up" : "Log in";

  return (
    <>
      <div className="auth-menu-actions">
        <button
          type="button"
          className="top-nav-backup-button"
          onClick={() => openModal("signup")}
        >
          Sign up
        </button>
        <button
          type="button"
          className="top-nav-backup-button"
          onClick={() => openModal("login")}
        >
          Log in
        </button>
      </div>
      <Modal open={open} title={title} onClose={closeModal}>
        <form className="auth-modal-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="full">
              Email
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </label>
            <label className="full">
              Password
              <input
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
            </label>
          </div>
          {errorMessage ? <p className="auth-message auth-message-error">{errorMessage}</p> : null}
          {infoMessage ? <p className="auth-message auth-message-info">{infoMessage}</p> : null}
          <div className="form-actions">
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {isSubmitting ? `${submitLabel}...` : submitLabel}
            </button>
            <button type="button" className="ghost-button" onClick={closeModal}>
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
