"use client";

import { useMemo, useState } from "react";
import { Market } from "@/lib/models/types";

interface HoldingAvatarProps {
  market: Market;
  logoUrl?: string;
  label: string;
}

export function HoldingAvatar({ market, logoUrl, label }: HoldingAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const normalizedLogoUrl = useMemo(
    () => (typeof logoUrl === "string" ? logoUrl.trim() : ""),
    [logoUrl],
  );
  const showImage = normalizedLogoUrl.length > 0 && !imageError;
  const fallback = market === "US" ? "🇺🇸" : "🇰🇷";

  return (
    <span className="holding-avatar" aria-hidden="true">
      {showImage ? (
        <img
          src={normalizedLogoUrl}
          alt={`${label} logo`}
          className="holding-avatar-image"
          onError={() => setImageError(true)}
        />
      ) : null}
      {!showImage ? (
        <span className="holding-avatar-fallback">{fallback}</span>
      ) : null}
    </span>
  );
}

