"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface NavLinkItem {
  type: "link";
  label: string;
  href: string;
}

interface NavSubmenuItem {
  type: "submenu";
  label: string;
  items: NavLinkItem[];
}

type NavEntry = NavLinkItem | NavSubmenuItem;

interface NavGroup {
  label: string;
  items: NavEntry[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Investment",
    items: [
      { type: "link", label: "Portfolio", href: "/portfolio" },
      { type: "link", label: "Leaderboard", href: "/leaderboard" },
      { type: "link", label: "Memo", href: "/memo" },
    ],
  },
  {
    label: "Asset Management",
    items: [
      { type: "link", label: "Expenditure", href: "/expenditure" },
      { type: "link", label: "Salary", href: "/asset-management" },
      { type: "link", label: "Asset Trend", href: "/asset-trend" },
    ],
  },
  {
    label: "Market",
    items: [
      { type: "link", label: "News", href: "/market/news" },
      {
        type: "submenu",
        label: "KR",
        items: [
          { type: "link", label: "Daily Market", href: "/market/kr/daily-market" },
          {
            type: "link",
            label: "Sector ETF Trend",
            href: "/market/kr/sector-etf-trend",
          },
          {
            type: "link",
            label: "Sector ETF Momentum",
            href: "/market/kr/sector-etf-momentum",
          },
        ],
      },
      {
        type: "submenu",
        label: "US",
        items: [
          { type: "link", label: "Daily Market", href: "/market/us/daily-market" },
          {
            type: "link",
            label: "Sector ETF Trend",
            href: "/market/us/sector-etf-trend",
          },
          {
            type: "link",
            label: "Sector ETF Momentum",
            href: "/market/us/sector-etf-momentum",
          },
        ],
      },
      { type: "link", label: "Crypto", href: "/market/crypto" },
    ],
  },
  {
    label: "Membership",
    items: [{ type: "link", label: "Membership", href: "/membership" }],
  },
];

function isPathActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isEntryActive(pathname: string, entry: NavEntry): boolean {
  if (entry.type === "link") {
    return isPathActive(pathname, entry.href);
  }

  return entry.items.some((item) => isPathActive(pathname, item.href));
}

function firstSubmenuKey(entries: NavEntry[], groupLabel: string): string | null {
  const first = entries.find((entry) => entry.type === "submenu");

  if (!first || first.type !== "submenu") {
    return null;
  }

  return `${groupLabel}:${first.label}`;
}

export function NavMenu() {
  const pathname = usePathname();
  const [mobileMode, setMobileMode] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

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
      setOpenSubmenu(null);
    }
  }, [mobileMode]);

  const closeAll = () => {
    setOpenGroup(null);
    setOpenSubmenu(null);
  };

  return (
    <nav className="top-nav-dropdown" aria-label="Main Navigation">
      {NAV_GROUPS.map((group) => {
        const groupActive = group.items.some((item) => isEntryActive(pathname, item));
        const isGroupOpen = openGroup === group.label;

        return (
          <div
            key={group.label}
            className={`nav-group ${isGroupOpen ? "is-open" : ""}`}
            onMouseEnter={() => {
              if (mobileMode) {
                return;
              }

              setOpenGroup(group.label);
              setOpenSubmenu(firstSubmenuKey(group.items, group.label));
            }}
            onMouseLeave={() => {
              if (!mobileMode) {
                closeAll();
              }
            }}
          >
            <button
              type="button"
              className={`nav-group-trigger ${groupActive ? "is-active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={isGroupOpen}
              onClick={() => {
                if (!mobileMode) {
                  return;
                }

                if (isGroupOpen) {
                  closeAll();
                  return;
                }

                setOpenGroup(group.label);
                setOpenSubmenu(firstSubmenuKey(group.items, group.label));
              }}
            >
              {group.label}
            </button>

            <div className="nav-dropdown" role="menu">
              {group.items.map((entry) => {
                if (entry.type === "link") {
                  const active = isPathActive(pathname, entry.href);

                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      role="menuitem"
                      className={`nav-dropdown-link ${active ? "is-active" : ""}`}
                      onClick={closeAll}
                    >
                      {entry.label}
                    </Link>
                  );
                }

                const submenuKey = `${group.label}:${entry.label}`;
                const submenuOpen = openSubmenu === submenuKey;
                const submenuActive = entry.items.some((item) =>
                  isPathActive(pathname, item.href),
                );

                return (
                  <div
                    key={submenuKey}
                    className={`nav-subgroup ${submenuOpen ? "is-open" : ""}`}
                    onMouseEnter={() => {
                      if (!mobileMode) {
                        setOpenSubmenu(submenuKey);
                      }
                    }}
                  >
                    <button
                      type="button"
                      className={`nav-subgroup-trigger ${submenuActive ? "is-active" : ""}`}
                      aria-haspopup="menu"
                      aria-expanded={submenuOpen}
                      onClick={() => {
                        if (!mobileMode) {
                          return;
                        }

                        setOpenSubmenu((prev) =>
                          prev === submenuKey ? null : submenuKey,
                        );
                      }}
                    >
                      <span>{entry.label}</span>
                      <span className="nav-subgroup-arrow">▸</span>
                    </button>

                    <div className="nav-submenu" role="menu">
                      {entry.items.map((item) => {
                        const active = isPathActive(pathname, item.href);

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            className={`nav-dropdown-link ${active ? "is-active" : ""}`}
                            onClick={closeAll}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
