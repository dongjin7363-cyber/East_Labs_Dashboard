"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface NavItem {
  label: string;
  href: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Investment",
    items: [
      { label: "Portfolio", href: "/portfolio" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "Memo", href: "/memo" },
    ],
  },
  {
    label: "Asset Management",
    items: [
      { label: "Expenditure", href: "/expenditure" },
      { label: "Salary", href: "/asset-management" },
      { label: "Asset Trend", href: "/asset-trend" },
    ],
  },
  {
    label: "Market",
    items: [{ label: "Market", href: "/market" }],
  },
  {
    label: "Membership",
    items: [{ label: "Membership", href: "/membership" }],
  },
];

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavMenu() {
  const pathname = usePathname();
  const [mobileMode, setMobileMode] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const update = () => setMobileMode(media.matches);

    update();
    media.addEventListener("change", update);

    return () => {
      media.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!mobileMode) {
      setOpenGroup(null);
    }
  }, [mobileMode]);

  return (
    <nav className="top-nav-dropdown" aria-label="Main Navigation">
      {NAV_GROUPS.map((group) => {
        const groupActive = group.items.some((item) =>
          isPathActive(pathname, item.href),
        );
        const isOpen = openGroup === group.label;

        return (
          <div
            key={group.label}
            className={`nav-group ${isOpen ? "is-open" : ""}`}
            onMouseEnter={() => {
              if (!mobileMode) {
                setOpenGroup(group.label);
              }
            }}
            onMouseLeave={() => {
              if (!mobileMode) {
                setOpenGroup(null);
              }
            }}
          >
            <button
              type="button"
              className={`nav-group-trigger ${groupActive ? "is-active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => {
                if (!mobileMode) {
                  return;
                }

                setOpenGroup((prev) => (prev === group.label ? null : group.label));
              }}
            >
              {group.label}
            </button>
            <div className="nav-dropdown" role="menu">
              {group.items.map((item) => {
                const active = isPathActive(pathname, item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    role="menuitem"
                    className={`nav-dropdown-link ${active ? "is-active" : ""}`}
                    onClick={() => setOpenGroup(null)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
