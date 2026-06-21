"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useAuth } from "@/lib/hooks/useAuth";

type IconName =
  | "portfolio"
  | "performance"
  | "finance"
  | "screening"
  | "export"
  | "momentum"
  | "membership";

interface NavLink {
  type: "link";
  label: string;
  href: string;
  icon: IconName;
}

interface NavSeparator {
  type: "sep";
}

type NavItem = NavLink | NavSeparator;

const NAV_ITEMS: NavItem[] = [
  { type: "link", label: "Portfolio", href: "/portfolio", icon: "portfolio" },
  { type: "link", label: "Performance", href: "/performance", icon: "performance" },
  { type: "link", label: "Finance", href: "/finance", icon: "finance" },
  { type: "sep" },
  { type: "link", label: "Market Screening", href: "/market/screening", icon: "screening" },
  { type: "link", label: "수출입 데이터", href: "/market/export", icon: "export" },
  { type: "link", label: "Momentum", href: "/market/momentum", icon: "momentum" },
  { type: "sep" },
  { type: "link", label: "Membership", href: "/membership", icon: "membership" },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (name) {
    case "portfolio":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "performance":
      return (
        <svg {...common}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      );
    case "finance":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
        </svg>
      );
    case "screening":
      return (
        <svg {...common}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "export":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <polyline points="18 9 12 15 9 12 3 18" />
        </svg>
      );
    case "momentum":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case "membership":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
  }
}

function getInitials(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  if (!local) return email.slice(0, 2).toUpperCase();
  const parts = local.split(/[._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }

  return local.slice(0, 2).toUpperCase();
}

function getDisplayName(email: string | null | undefined): string {
  if (!email) return "Guest";
  const local = email.split("@")[0] ?? "";
  return local || "Guest";
}

export function Sidebar() {
  const pathname = usePathname();
  const { email, isAuthenticated, loading, signIn, signInWithKakao, signOut } =
    useAuth();
  const [authBusy, setAuthBusy] = useState(false);
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [emailError, setEmailError] = useState("");

  const isActive = useMemo(
    () => (href: string) =>
      pathname === href ||
      (href !== "/" && pathname?.startsWith(`${href}/`)) ||
      false,
    [pathname],
  );

  const displayEmail = isAuthenticated ? email ?? "" : "";
  const displayName = isAuthenticated ? getDisplayName(email) : "Guest";
  const initials = isAuthenticated ? getInitials(email) : "G";

  const handleKakaoLogin = async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      const result = await signInWithKakao();
      if (!result.ok) {
        window.alert(result.message ?? "카카오 로그인에 실패했습니다.");
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const openEmailModal = () => {
    setEmailInput("");
    setPasswordInput("");
    setEmailError("");
    setEmailModalOpen(true);
  };

  const closeEmailModal = () => {
    if (authBusy) return;
    setEmailModalOpen(false);
  };

  const handleEmailLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !passwordInput) {
      setEmailError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    setAuthBusy(true);
    setEmailError("");
    const result = await signIn(trimmedEmail, passwordInput);
    setAuthBusy(false);

    if (!result.ok) {
      setEmailError(result.message ?? "로그인에 실패했습니다.");
      return;
    }

    setEmailModalOpen(false);
    setPasswordInput("");
  };

  const handleLogout = async () => {
    if (!window.confirm("로그아웃 하시겠어요?")) {
      return;
    }
    const result = await signOut();
    if (!result.ok) {
      window.alert(result.message ?? "로그아웃에 실패했습니다.");
    }
  };

  return (
    <aside className="east-sidebar">
      <div className="east-logo-wrap">
        <Link href="/portfolio" className="east-logo">
          EAST
        </Link>
        <p className="east-logo-sub">리서치 대시보드</p>
      </div>
      <nav className="east-nav">
        {NAV_ITEMS.map((item, idx) => {
          if (item.type === "sep") {
            return <div className="east-nav-sep" key={`sep-${idx}`} />;
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`east-nav-link${isActive(item.href) ? " is-active" : ""}`}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="east-sidebar-footer">
        {loading ? (
          <div className="east-auth-loading">…</div>
        ) : isAuthenticated ? (
          <div className="east-user-block">
            <div className="east-user-row">
              <div className="east-avatar">{initials}</div>
              <div className="east-user-info">
                <p className="east-user-name">{displayName}</p>
                <p className="east-user-email">{displayEmail}</p>
              </div>
            </div>
            <button
              type="button"
              className="east-logout-btn"
              onClick={() => {
                void handleLogout();
              }}
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="east-auth-stack">
            <button
              type="button"
              className="east-kakao-btn"
              onClick={() => {
                void handleKakaoLogin();
              }}
              disabled={authBusy}
            >
              <span className="east-kakao-mark">
                <Image src="/icons/kakao-talk.svg" alt="" width={16} height={16} />
              </span>
              <span>카카오로 로그인</span>
            </button>
            <button
              type="button"
              className="east-email-btn"
              onClick={openEmailModal}
              disabled={authBusy}
            >
              이메일로 로그인
            </button>
          </div>
        )}
      </div>

      <Modal
        open={emailModalOpen}
        title="이메일로 로그인"
        onClose={closeEmailModal}
        cardClassName="east-email-modal"
      >
        <form className="east-email-form" onSubmit={handleEmailLogin}>
          <label className="east-email-field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={emailInput}
              onChange={(event) => setEmailInput(event.target.value)}
              placeholder="you@example.com"
              required
              disabled={authBusy}
            />
          </label>
          <label className="east-email-field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passwordInput}
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="Password"
              minLength={6}
              required
              disabled={authBusy}
            />
          </label>
          {emailError ? <p className="east-email-error">{emailError}</p> : null}
          <div className="east-email-actions">
            <button
              type="button"
              className="east-email-cancel"
              onClick={closeEmailModal}
              disabled={authBusy}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="east-email-submit"
              disabled={authBusy}
            >
              {authBusy ? "처리 중..." : "로그인"}
            </button>
          </div>
        </form>
      </Modal>
    </aside>
  );
}

export default Sidebar;
