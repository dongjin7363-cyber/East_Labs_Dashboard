"use client";

import Link from "next/link";
import { AuthMenu } from "@/components/AuthMenu";
import { NavMenu } from "@/components/NavMenu";

export function TopNav() {
  return (
    <header className="top-nav-wrap">
      <div className="top-nav-inner">
        <div className="top-nav-left">
          <Link href="/portfolio" className="brand brand-east">
            EAST
          </Link>
        </div>
        <div className="top-nav-center">
          <NavMenu />
        </div>
        <div className="top-nav-right">
          <AuthMenu />
        </div>
      </div>
    </header>
  );
}
