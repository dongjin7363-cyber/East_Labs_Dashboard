"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Portfolio", href: "/portfolio" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Total Asset", href: "/total-asset" },
  { label: "Expenditure", href: "/expenditure" },
  { label: "Salary", href: "/salary" },
];

export function NavMenu() {
  const pathname = usePathname();

  return (
    <nav className="top-nav-dropdown" aria-label="Main navigation">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/" && pathname?.startsWith(`${item.href}/`));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-group-trigger${active ? " is-active" : ""}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default NavMenu;

