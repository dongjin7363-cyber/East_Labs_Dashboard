"use client";

import { useEffect, useMemo, useState } from "react";
import { Market } from "@/lib/models/types";
import { getMappedLogoUrl } from "@/lib/portfolio/logoMap";

interface HoldingAvatarProps {
  market?: Market;
  ticker?: string;
  logoUrl?: string | null;
  alt?: string;
  label?: string;
}

export function HoldingAvatar({
  market = "US",
  ticker = "",
  logoUrl,
  alt = "holding logo",
  label,
}: HoldingAvatarProps) {
  const directLogoUrl = typeof logoUrl === "string" ? logoUrl.trim() : "";
  const mappedLogoUrl = useMemo(
    () => getMappedLogoUrl(market, ticker),
    [market, ticker],
  );
  const src = directLogoUrl || mappedLogoUrl || "";
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [src]);

  if (src && !imageLoadFailed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <span className="holding-avatar">
        <img
          src={src}
          alt={label ? `${label} logo` : alt}
          className="holding-avatar-image"
          onError={() => setImageLoadFailed(true)}
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
