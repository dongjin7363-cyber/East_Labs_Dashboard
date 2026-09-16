import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runPortfolioSchedule, verifyPortfolioSchedule } from "@/lib/services/runPortfolioSchedule";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.PORTFOLIO_CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  return Boolean(secret && actual.length === expected.length && timingSafeEqual(actual, expected));
}

export async function GET(request: NextRequest) {
  return NextResponse.json({ ok: authorized(request) }, { status: authorized(request) ? 200 : 401 });
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (body?.mode === "verify") {
    try {
      return NextResponse.json(await verifyPortfolioSchedule());
    } catch (error) {
      console.error("[portfolio-verify]", error instanceof Error ? error.message : "failed");
      return NextResponse.json({ error: "Portfolio verification failed" }, { status: 500 });
    }
  }
  if (typeof body?.scheduledAt !== "string") {
    return NextResponse.json({ error: "scheduledAt is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await runPortfolioSchedule(body.scheduledAt));
  } catch (error) {
    console.error("[portfolio-schedule]", error instanceof Error ? error.message : "failed");
    return NextResponse.json({ error: "Scheduled update failed; inspect portfolio_schedule_runs" }, { status: 500 });
  }
}
