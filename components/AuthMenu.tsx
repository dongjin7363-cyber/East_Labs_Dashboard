"use client";

import { FormEvent, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/lib/hooks/useAuth";

type AuthMode = "login" | "signup";

export function AuthMenu() {
  const { isAuthenticated, loading, email, signIn, signOut, signUp } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");

  const modalTitle = useMemo(
    () => (mode === "signup" ? "Sign up" : "Log in"),
    [mode],
  );

  const openModal = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage("");
    setInfoMessage("");
    setOpen(true);
  };

  const closeModal = () => {
    if (submitting) {
      return;
    }

    setOpen(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const emailInput = formEmail.trim();
    const passwordInput = formPassword;

    if (!emailInput || !passwordInput) {
      setErrorMessage("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setInfoMessage("");

    try {
      if (mode === "signup") {
        const result = await signUp(emailInput, passwordInput);

        if (!result.ok) {
          setErrorMessage(result.message ?? "회원가입에 실패했습니다.");
          return;
        }

        setInfoMessage("회원가입이 완료되었습니다. 바로 로그인할 수 있습니다.");
        return;
      }

      const result = await signIn(emailInput, passwordInput);

      if (!result.ok) {
        setErrorMessage(result.message ?? "로그인에 실패했습니다.");
        return;
      }

      setOpen(false);
      setFormPassword("");
      setErrorMessage("");
      setInfoMessage("");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    const result = await signOut();

    if (!result.ok) {
      window.alert(result.message ?? "로그아웃에 실패했습니다.");
    }
  };

  if (loading) {
    return <div className="auth-wrap">...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-wrap">
        <div className="auth-menu-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => openModal("signup")}
          >
            Sign up
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => openModal("login")}
          >
            Log in
          </button>
        </div>
        <Modal
          open={open}
          title={modalTitle}
          onClose={closeModal}
          cardClassName="auth-modal-card"
        >
          <form className="auth-modal-form" onSubmit={handleSubmit}>
            <label>
              Email
              <input
                className="auth-modal-input"
                type="email"
                autoComplete="email"
                value={formEmail}
                onChange={(event) => setFormEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label>
              Password
              <input
                className="auth-modal-input"
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={formPassword}
                onChange={(event) => setFormPassword(event.target.value)}
                placeholder="Password"
                minLength={6}
                required
              />
            </label>
            {errorMessage ? (
              <p className="auth-message auth-message-error">{errorMessage}</p>
            ) : null}
            {infoMessage ? (
              <p className="auth-message auth-message-info">{infoMessage}</p>
            ) : null}
            <div className="form-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={closeModal}
                disabled={submitting}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? "처리 중..." : modalTitle}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <span className="auth-user">{email ?? ""}</span>
      <button
        type="button"
        className="secondary-button"
        onClick={handleLogout}
      >
        Logout
      </button>
    </div>
  );
}

export default AuthMenu;
