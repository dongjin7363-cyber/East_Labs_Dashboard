"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_GROUPS } from "@/lib/config/navigation";

export function NavMenu() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [openSubgroupKey, setOpenSubgroupKey] = useState<string | null>(null);
  const [canHover, setCanHover] = useState(false);
  const closeGroupTimerRef = useRef<number | null>(null);
  const closeSubgroupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setOpenGroup(null);
    setOpenSubgroupKey(null);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setCanHover(mediaQuery.matches);

    sync();
    mediaQuery.addEventListener("change", sync);

    return () => {
      mediaQuery.removeEventListener("change", sync);
    };
  }, []);

  useEffect(
    () => () => {
      if (closeGroupTimerRef.current !== null) {
        window.clearTimeout(closeGroupTimerRef.current);
      }

      if (closeSubgroupTimerRef.current !== null) {
        window.clearTimeout(closeSubgroupTimerRef.current);
      }
    },
    [],
  );

  const isActivePath = useMemo(
    () => (href: string) =>
      pathname === href || (href !== "/" && pathname?.startsWith(`${href}/`)),
    [pathname],
  );

  const clearGroupCloseTimer = () => {
    if (closeGroupTimerRef.current !== null) {
      window.clearTimeout(closeGroupTimerRef.current);
      closeGroupTimerRef.current = null;
    }
  };

  const clearSubgroupCloseTimer = () => {
    if (closeSubgroupTimerRef.current !== null) {
      window.clearTimeout(closeSubgroupTimerRef.current);
      closeSubgroupTimerRef.current = null;
    }
  };

  const openGroupByHover = (groupLabel: string) => {
    if (!canHover) {
      return;
    }

    clearGroupCloseTimer();
    setOpenGroup(groupLabel);
  };

  const scheduleGroupClose = (groupLabel: string) => {
    if (!canHover) {
      return;
    }

    clearGroupCloseTimer();
    closeGroupTimerRef.current = window.setTimeout(() => {
      setOpenGroup((current) => (current === groupLabel ? null : current));
      setOpenSubgroupKey(null);
      closeGroupTimerRef.current = null;
    }, 120);
  };

  const openSubgroupByHover = (subgroupKey: string) => {
    if (!canHover) {
      return;
    }

    clearSubgroupCloseTimer();
    setOpenSubgroupKey(subgroupKey);
  };

  const scheduleSubgroupClose = (subgroupKey: string) => {
    if (!canHover) {
      return;
    }

    clearSubgroupCloseTimer();
    closeSubgroupTimerRef.current = window.setTimeout(() => {
      setOpenSubgroupKey((current) => (current === subgroupKey ? null : current));
      closeSubgroupTimerRef.current = null;
    }, 120);
  };

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
            onMouseEnter={() => openGroupByHover(group.label)}
            onMouseLeave={() => scheduleGroupClose(group.label)}
          >
            <button
              type="button"
              className={`nav-group-trigger${groupIsActive ? " is-active" : ""}`}
              onClick={() => {
                clearGroupCloseTimer();
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
                      prefetch={item.href === "/asset-trend" ? false : undefined}
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
                    onMouseEnter={() => openSubgroupByHover(subgroupKey)}
                    onMouseLeave={() => scheduleSubgroupClose(subgroupKey)}
                  >
                    <button
                      type="button"
                      className={`nav-subgroup-trigger${subgroupIsActive ? " is-active" : ""}`}
                      onClick={() => {
                        clearSubgroupCloseTimer();
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
                          prefetch={subItem.href === "/asset-trend" ? false : undefined}
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
