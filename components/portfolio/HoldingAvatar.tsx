"use client";

import { Market } from "@/lib/models/types";

interface HoldingAvatarProps {
  market?: Market;
  logoUrl?: string | null;
  alt?: string;
  label?: string;
}

export function HoldingAvatar({
  market = "US",
  logoUrl,
  alt = "holding logo",
  label,
}: HoldingAvatarProps) {
  const src = typeof logoUrl === "string" ? logoUrl.trim() : "";

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <span className="holding-avatar">
        <img
          src={src}
          alt={label ? `${label} logo` : alt}
          className="holding-avatar-image"
        />
      </span>
    );
  }

  return (
    <span className="holding-avatar" aria-label={`${market} fallback`}>
      <span className="holding-avatar-fallback">
        {market === "KR" ? "🇰🇷" : "🇺🇸"}
      </span>
    </span>
  );
}

export default HoldingAvatar;
