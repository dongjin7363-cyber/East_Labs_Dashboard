import type { Market } from "@/lib/models/types";

export const US_LOGO_MAP: Record<string, string> = {
  RKLB: "/logos/us/rklb.png",
};

export const KR_LOGO_MAP: Record<string, string> = {};

export function getMappedLogoUrl(market: Market, ticker: string): string | undefined {
  const normalizedTicker = ticker.trim().toUpperCase();

  if (!normalizedTicker) {
    return undefined;
  }

  if (market === "US") {
    return US_LOGO_MAP[normalizedTicker];
  }

  return KR_LOGO_MAP[normalizedTicker];
}
