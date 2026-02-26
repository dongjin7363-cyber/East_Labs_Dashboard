"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthButton } from "@/components/AuthButton";
import { exportPfBackup } from "@/lib/utils/backup";

const NAV_ITEMS = [
  { label: "Portfolio", href: "/portfolio" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Total Asset", href: "/total-asset" },
  { label: "|", kind: "divider" as const },
  { label: "Expenditure", href: "/expenditure" },
  { label: "Asset Management", href: "/salary" },
];

export function TopNav() {
  const pathname = usePathname();
  const handleBackupClick = () => {
    const result = exportPfBackup();

    if (!result.ok) {
      window.alert("백업할 데이터가 없습니다");
    }
  };

  return (
    <header className="top-nav-wrap">
      <div className="top-nav-inner">
        <div className="brand">Personal Finance Dashboard</div>
        <div className="top-nav-actions">
          <nav className="top-nav">
            {NAV_ITEMS.map((item, index) => {
              if ("kind" in item && item.kind === "divider") {
                return (
                  <span key={`divider-${index}`} className="top-nav-divider" aria-hidden="true">
                    {item.label}
                  </span>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`top-nav-link ${
                    pathname === item.href || pathname.startsWith(`${item.href}/`)
                      ? "is-active"
                      : ""
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <AuthButton />
          <button type="button" className="top-nav-backup-button" onClick={handleBackupClick}>
            Backup
          </button>
        </div>
      </div>
    </header>
  );
}
