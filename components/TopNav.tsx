"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthMenu } from "@/components/AuthMenu";
import { NavMenu } from "@/components/NavMenu";

export function TopNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="top-nav-wrap">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <Link
            href="/portfolio"
            className="brand brand-east"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            EAST
          </Link>
        </div>
        <div className="top-nav-center top-nav-desktop">
          <NavMenu />
        </div>
        <div className="top-nav-right top-nav-desktop">
          <AuthMenu />
        </div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-controls="mobile-nav-panel"
          aria-expanded={isMobileMenuOpen}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
        >
          <span className="mobile-menu-icon" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>Menu</span>
        </button>
      </div>
      {isMobileMenuOpen ? (
        <div id="mobile-nav-panel" className="mobile-nav-panel">
          <NavMenu onNavigate={() => setIsMobileMenuOpen(false)} />
          <div className="mobile-auth-panel">
            <AuthMenu />
          </div>
        </div>
      ) : null}
    </header>
  );
}
