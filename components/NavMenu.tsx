"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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
      { label: "Total Asset", href: "/total-asset" },
      { label: "Expenditure", href: "/expenditure" },
      { label: "Salary", href: "/salary" },
    ],
  },
  {
    label: "Market",
    items: [{ label: "News", href: "/market/news" }],
  },
  {
    label: "Membership",
    items: [{ label: "Membership", href: "/membership" }],
  },
];

export function NavMenu() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  const isActivePath = useMemo(
    () => (href: string) =>
      pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`)),
    [pathname],
  );

  return (
    <nav className="top-nav-dropdown" aria-label="Main navigation">
      {NAV_GROUPS.map((group) => {
        const isOpen = openGroup === group.label;
        const groupActive = group.items.some((item) => isActivePath(item.href));

        return (
          <div
            key={group.label}
            className={`nav-group${isOpen ? " is-open" : ""}`}
            onMouseLeave={() => {
              setOpenGroup((current) => (current === group.label ? null : current));
            }}
          >
            <button
              type="button"
              className={`nav-group-trigger${groupActive ? " is-active" : ""}`}
              onClick={() => {
                setOpenGroup((current) =>
                  current === group.label ? null : group.label,
                );
              }}
            >
              {group.label}
            </button>
            <div className="nav-dropdown">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-dropdown-link${isActivePath(item.href) ? " is-active" : ""}`}
                  onClick={() => setOpenGroup(null)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export default NavMenu;
