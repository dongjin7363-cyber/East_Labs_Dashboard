"use client";

import { setLocalAuthEnabled, useAuth } from "@/lib/hooks/useAuth";

export function AuthMenu() {
  const { isAuthenticated, loading, email } = useAuth();

  if (loading) {
    return <div className="auth-wrap">...</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="auth-wrap">
        <button
          type="button"
          className="primary-button"
          onClick={() => setLocalAuthEnabled(true)}
        >
          Log in
        </button>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <span className="auth-user">{email ?? "local@east"}</span>
      <button
        type="button"
        className="secondary-button"
        onClick={() => setLocalAuthEnabled(false)}
      >
        Logout
      </button>
    </div>
  );
}

export default AuthMenu;

