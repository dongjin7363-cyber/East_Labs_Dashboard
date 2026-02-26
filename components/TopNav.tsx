"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthMenu } from "@/components/AuthMenu";

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

  return (
    <header className="top-nav-wrap">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <Link href="/portfolio" className="brand brand-east">
            EAST
          </Link>
        </div>
        <div className="top-nav-center">
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
        </div>
        <div className="top-nav-right">
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
