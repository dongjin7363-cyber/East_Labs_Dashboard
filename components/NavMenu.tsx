"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavLinkItem {
  type: "link";
  label: string;
  href: string;
}

interface NavSubgroupItem {
  type: "subgroup";
  label: string;
  items: NavLinkItem[];
}

type NavDropdownItem = NavLinkItem | NavSubgroupItem;

interface NavGroup {
  label: string;
  items: NavDropdownItem[];
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
      { type: "link", label: "Total Asset", href: "/total-asset" },
      { type: "link", label: "Expenditure", href: "/expenditure" },
      { type: "link", label: "Salary", href: "/salary" },
    ],
  },
  {
    label: "Market",
    items: [
      { type: "link", label: "News", href: "/market/news" },
      {
        type: "subgroup",
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
        type: "subgroup",
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

export function NavMenu() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubgroupKey, setOpenSubgroupKey] = useState<string | null>(null);

  useEffect(() => {
    setOpenGroup(null);
    setOpenSubgroupKey(null);
  }, [pathname]);

  const isActivePath = useMemo(
    () => (href: string) =>
      pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`)),
    [pathname],
  );

  return (
    <nav className="top-nav-dropdown" aria-label="Main navigation">
      {NAV_GROUPS.map((group) => {
        const groupIsActive = group.items.some((item) => {
          if (item.type === "link") {
            return isActivePath(item.href);
          }

          return item.items.some((subItem) => isActivePath(subItem.href));
        });
        const groupIsOpen = openGroup === group.label;

        return (
          <div
            key={group.label}
            className={`nav-group${groupIsOpen ? " is-open" : ""}`}
            onMouseLeave={() => {
              setOpenGroup((current) => (current === group.label ? null : current));
              setOpenSubgroupKey(null);
            }}
          >
            <button
              type="button"
              className={`nav-group-trigger${groupIsActive ? " is-active" : ""}`}
              onClick={() => {
                setOpenGroup((current) =>
                  current === group.label ? null : group.label,
                );
                setOpenSubgroupKey(null);
              }}
            >
              {group.label}
            </button>
            <div className="nav-dropdown">
              {group.items.map((item) => {
                if (item.type === "link") {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`nav-dropdown-link${isActivePath(item.href) ? " is-active" : ""}`}
                      onClick={() => {
                        setOpenGroup(null);
                        setOpenSubgroupKey(null);
                      }}
                    >
                      {item.label}
                    </Link>
                  );
                }

                const subgroupKey = `${group.label}-${item.label}`;
                const subgroupIsActive = item.items.some((subItem) =>
                  isActivePath(subItem.href),
                );
                const subgroupIsOpen = openSubgroupKey === subgroupKey;

                return (
                  <div
                    key={subgroupKey}
                    className={`nav-subgroup${subgroupIsOpen ? " is-open" : ""}`}
                  >
                    <button
                      type="button"
                      className={`nav-subgroup-trigger${subgroupIsActive ? " is-active" : ""}`}
                      onClick={() => {
                        setOpenSubgroupKey((current) =>
                          current === subgroupKey ? null : subgroupKey,
                        );
                      }}
                    >
                      <span>{item.label}</span>
                      <span className="nav-subgroup-arrow">{">"}</span>
                    </button>
                    <div className="nav-submenu">
                      {item.items.map((subItem) => (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={`nav-dropdown-link${isActivePath(subItem.href) ? " is-active" : ""}`}
                          onClick={() => {
                            setOpenGroup(null);
                            setOpenSubgroupKey(null);
                          }}
                        >
                          {subItem.label}
                        </Link>
                      ))}
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

export default NavMenu;
