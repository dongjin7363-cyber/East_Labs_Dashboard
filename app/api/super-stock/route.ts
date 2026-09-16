import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { normalizeTicker, weekDate } from "@/lib/super-stock/model";
import { unpack, userFromRequest } from "@/lib/super-stock/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  try {
    const db = createSupabaseAdminClient();
    const { data: watch, error } = await db
      .from("super_stock_watchlist")
      .select("ticker,active,created_at")
      .eq("user_id", userId)
      .order("ticker");
    if (error) throw error;
    const { data: cohorts, error: cohortError } = await db
      .from("super_stock_user_weeks")
      .select("week_date,tickers")
      .eq("user_id", userId)
      .order("week_date", { ascending: false })
      .limit(53);
    if (cohortError) throw cohortError;
    const tickers = [
      ...new Set([
        ...(watch ?? []).map((w) => w.ticker),
        ...(cohorts ?? []).flatMap((c) => c.tickers),
      ]),
    ];
    const since = new Date(Date.now() - 370 * 86400000)
      .toISOString()
      .slice(0, 10);
    const rows: Record<string, unknown>[] = [];
    if (tickers.length)
      for (let offset = 0; ; offset += 250) {
        const page = await db
          .from("super_stock_weekly_scores")
          .select("*")
          .in("ticker", tickers)
          .gte("week_date", since)
          .order("week_date", { ascending: false })
          .order("ticker")
          .range(offset, offset + 249);
        if (page.error) throw page.error;
        rows.push(...(page.data ?? []));
        if ((page.data ?? []).length < 250) break;
      }
    const { data: run, error: runError } = await db
      .from("super_stock_runs")
      .select("status,completed,failed")
      .eq("week_date", weekDate())
      .maybeSingle();
    if (runError) throw runError;
    return NextResponse.json(
      {
        watchlist: watch,
        snapshots: (rows ?? []).map(unpack),
        cohorts,
        configured: Boolean(process.env.OPENAI_API_KEY),
        run: run
          ? {
              status: run.status,
              completed: run.completed.filter((t: string) =>
                tickers.includes(t),
              ),
              failed: Object.fromEntries(
                Object.entries(run.failed).filter(([t]) => tickers.includes(t)),
              ),
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Super Stock 데이터를 불러오지 못했습니다. 서버 연결 및 저장소 설정을 확인해 주세요.",
      },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const userId = await userFromRequest(request);
  if (!userId)
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 },
    );
  const body = await request.json().catch(() => null);
  let ticker: string;
  try {
    ticker = normalizeTicker(body?.ticker);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
  if (typeof body?.active !== "boolean")
    return NextResponse.json({ error: "active is required" }, { status: 400 });
  const db = createSupabaseAdminClient();
  const { error } = await db
    .from("super_stock_watchlist")
    .upsert(
      { user_id: userId, ticker, active: body.active },
      { onConflict: "user_id,ticker" },
    );
  return error
    ? NextResponse.json(
        { error: "관심종목을 저장하지 못했습니다." },
        { status: 503 },
      )
    : NextResponse.json({ ok: true });
}
