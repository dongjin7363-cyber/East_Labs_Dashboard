import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runWeeklyTick } from "@/lib/super-stock/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const secret = process.env.PORTFOLIO_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? ""),
    expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runWeeklyTick());
  } catch {
    return NextResponse.json(
      { error: "Weekly analysis unavailable. Check server configuration." },
      { status: 503 },
    );
  }
}
