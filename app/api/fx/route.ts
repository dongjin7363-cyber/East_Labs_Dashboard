import { NextResponse } from "next/server";

const DEFAULT_FX_RATE = 1350;
const CACHE_SECONDS = 86400;

type FxPayload = {
  rate: number;
  asOf: string;
};

function isValidRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

async function fetchFromOpenErApi(): Promise<FxPayload> {
  const response = await fetch("https://open.er-api.com/v6/latest/USD", {
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) {
    throw new Error(`OpenERAPI failed: ${response.status}`);
  }

  const data: unknown = await response.json();

  if (typeof data !== "object" || data === null || !("rates" in data)) {
    throw new Error("OpenERAPI payload invalid");
  }

  const rates = (data as { rates: Record<string, unknown> }).rates;
  const rate = rates?.KRW;

  if (!isValidRate(rate)) {
    throw new Error("OpenERAPI KRW rate invalid");
  }

  let asOf = new Date().toISOString().slice(0, 10);
  const updateUtc = (data as { time_last_update_utc?: unknown }).time_last_update_utc;

  if (typeof updateUtc === "string") {
    const parsed = new Date(updateUtc);
    if (!Number.isNaN(parsed.getTime())) {
      asOf = parsed.toISOString().slice(0, 10);
    }
  }

  return {
    rate,
    asOf,
  };
}

export async function GET() {
  try {
    const payload = await fetchFromOpenErApi();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch {
    return NextResponse.json(
      {
        rate: DEFAULT_FX_RATE,
        asOf: new Date().toISOString().slice(0, 10),
      },
      {
        headers: {
          "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`,
        },
      },
    );
  }
}
