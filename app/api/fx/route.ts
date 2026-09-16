import { NextResponse } from "next/server";
import { fetchUsdKrwRate } from "@/lib/services/fxRate";

export const dynamic = "force-dynamic";
const CACHE_SECONDS = 86400;

export async function GET() {
  try {
    const payload = await fetchUsdKrwRate();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Exchange rate temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
