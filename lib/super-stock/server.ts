import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { acquireServerLease } from "@/lib/services/serverLease";
import { assess, model } from "./engine";
import { scores, weekDate, type Snapshot, type Assessment } from "./model";
export function unpack(row: Record<string, unknown>): Snapshot {
  return {
    ...(row.assessment as Assessment),
    ticker: String(row.ticker),
    week_date: String(row.week_date),
    quality_score: Number(row.quality_score),
    delta_score: Number(row.delta_score),
    super_score: Number(row.super_score),
    classification: String(row.classification),
    created_at: String(row.created_at),
  };
}
export async function userFromRequest(
  request: Request,
): Promise<string | null> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await createSupabaseAdminClient().auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}
export async function runWeeklyTick() {
  if (!process.env.OPENAI_API_KEY) throw new Error("OpenAI API 연결 대기");
  const week = weekDate(),
    cutoff = new Date(`${week}T00:00:00Z`);
  // Process one ticker per request to stay inside the server duration limit.
  const release = await acquireServerLease("super-stock-weekly", 290);
  if (!release) return { status: "busy" };
  const db = createSupabaseAdminClient();
  try {
    const initial = await db
      .from("super_stock_runs")
      .select("*")
      .eq("week_date", week)
      .maybeSingle();
    if (initial.error) throw initial.error;
    let run = initial.data;
    if (!run) {
      const { data: watch, error: watchError } = await db
        .from("super_stock_watchlist")
        .select("user_id,ticker")
        .eq("active", true)
        .lte("created_at", cutoff.toISOString());
      if (watchError) throw watchError;
      const cohort = [
        ...new Set((watch ?? []).map((w) => String(w.ticker))),
      ].sort();
      const users = [...new Set((watch ?? []).map((w) => String(w.user_id)))];
      // Cohorts are idempotent and created before the run, allowing safe retries.
      if (users.length) {
        const { error: e } = await db.from("super_stock_user_weeks").upsert(
          users.map((user_id) => ({
            user_id,
            week_date: week,
            tickers: (watch ?? [])
              .filter((w) => w.user_id === user_id)
              .map((w) => w.ticker),
          })),
          { onConflict: "user_id,week_date", ignoreDuplicates: true },
        );
        if (e) throw e;
      }
      const result = await db
        .from("super_stock_runs")
        .insert({
          week_date: week,
          cohort,
          status: cohort.length ? "running" : "complete",
        })
        .select()
        .single();
      if (result.error) throw result.error;
      run = result.data;
    }
    if (run.status === "complete" || run.status === "partial")
      return { status: run.status };
    const failed = run.failed as Record<string, string>;
    const ticker = (run.cohort as string[]).find(
      (t) => !run.completed.includes(t) && !failed[t],
    );
    if (!ticker) {
      const status = Object.keys(failed).length ? "partial" : "complete";
      const { error: e } = await db
        .from("super_stock_runs")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("week_date", week);
      if (e) throw e;
      return { status };
    }
    try {
      const { data: existing, error: existingError } = await db
        .from("super_stock_weekly_scores")
        .select("ticker")
        .eq("ticker", ticker)
        .eq("week_date", week)
        .maybeSingle();
      if (existingError) throw existingError;
      if (!existing) {
        const { data: previous, error: previousError } = await db
          .from("super_stock_weekly_scores")
          .select("*")
          .eq("ticker", ticker)
          .lt("week_date", week)
          .order("week_date", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (previousError) throw previousError;
        const assessment = await assess(
          ticker,
          cutoff,
          previous ? unpack(previous) : null,
        );
        const { error: saveError } = await db
          .from("super_stock_weekly_scores")
          .insert({
            ticker,
            week_date: week,
            ...scores(assessment),
            assessment,
            model: model(),
          });
        if (saveError) throw saveError;
      }
      const { error: e } = await db
        .from("super_stock_runs")
        .update({
          completed: [...run.completed, ticker],
          status: "running",
          updated_at: new Date().toISOString(),
        })
        .eq("week_date", week);
      if (e) throw e;
      return { status: "running", ticker };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Assessment failed";
      const { error: saveError } = await db
        .from("super_stock_runs")
        .update({
          failed: { ...failed, [ticker]: message.slice(0, 200) },
          updated_at: new Date().toISOString(),
        })
        .eq("week_date", week);
      if (saveError) throw saveError;
      return { status: "ticker_failed", ticker };
    }
  } finally {
    await release();
  }
}
