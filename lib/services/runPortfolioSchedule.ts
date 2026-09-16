import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { updatePortfolioQuotes } from "@/lib/quotes/update";
import { deserializePortfolioHolding } from "@/lib/repository/mappers/portfolioHoldingMapper";
import { acquireServerLease } from "@/lib/services/serverLease";
import { buildScheduledSnapshots, resolvePortfolioSchedule } from "@/lib/services/portfolioSchedule";
import { fetchUsdKrwRate } from "@/lib/services/fxRate";

async function readAllRows(
  client: ReturnType<typeof createSupabaseAdminClient>, table: string, order: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select("*").order(order).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function runPortfolioSchedule(scheduledAt: string) {
  const schedule = resolvePortfolioSchedule(scheduledAt);
  const client = createSupabaseAdminClient();
  const release = await acquireServerLease(`portfolio-schedule:${schedule.scheduledAt}`, 360);
  if (!release) return { status: "already-running" };
  try {
    const { data: previous, error: previousError } = await client.from("portfolio_schedule_runs")
      .select("status").eq("scheduled_at", schedule.scheduledAt).maybeSingle();
    if (previousError) throw previousError;
    if (previous?.status === "complete") return { status: "already-complete" };
    const { error: startError } = await client.from("portfolio_schedule_runs").upsert({
      scheduled_at: schedule.scheduledAt, slot_kst: schedule.hour, status: "running", error: null,
      started_at: new Date().toISOString(),
    }, { onConflict: "scheduled_at" });
    if (startError) throw startError;

    const quotes = await updatePortfolioQuotes({ includeExtended: false });
    if (quotes.failedCount > 0 || quotes.supabase.failed > 0) {
      throw new Error(`Quote refresh incomplete: ${quotes.updatedCount} updated, ${quotes.failedCount} failed; snapshot not saved`);
    }
    let snapshots: ReturnType<typeof buildScheduledSnapshots> = [];
    if (schedule.snapshotDate) {
      // Never label a substantially delayed price as the 07:00 valuation.
      resolvePortfolioSchedule(schedule.scheduledAt);
      const [holdingRows, accountRows, fx] = await Promise.all([
        readAllRows(client, "portfolio_holdings", "id"),
        readAllRows(client, "portfolio_account_state", "user_id"),
        fetchUsdKrwRate(true),
      ]);
      const updatedIds = new Set(quotes.updated.map(row => row.id));
      const holdings = holdingRows.map((row, index) => {
        const parsed = deserializePortfolioHolding(row, index);
        if (!parsed || !row.user_id) throw new Error("Invalid holding; snapshot not saved");
        if (!parsed.quoteDisabled && !updatedIds.has(parsed.id)) {
          throw new Error("A holding was not refreshed; snapshot not saved");
        }
        return { ...parsed, userId: String(row.user_id) };
      });
      const accounts = accountRows.map(row => ({
        user_id: String(row.user_id), deposit_krw_int: Number(row.deposit_krw_int),
        deposit_usd_cents: Number(row.deposit_usd_cents), cash_krw_int: Number(row.cash_krw_int),
      }));
      snapshots = buildScheduledSnapshots(holdings, accounts, schedule.snapshotDate, fx.rate);
    }
    // Snapshot upserts and the completion marker commit atomically; retries preserve memo fields.
    const { error } = await client.rpc("complete_portfolio_schedule", {
      p_scheduled_at: schedule.scheduledAt, p_snapshots: snapshots, p_updated_count: quotes.updatedCount,
    });
    if (error) throw error;
    return { status: "complete", updated: quotes.updatedCount, snapshotDate: schedule.snapshotDate, snapshots: snapshots.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scheduled portfolio update failed";
    await client.from("portfolio_schedule_runs").upsert({
      scheduled_at: schedule.scheduledAt, slot_kst: schedule.hour, status: "failed", error: message,
      finished_at: new Date().toISOString(),
    }, { onConflict: "scheduled_at" });
    throw error;
  } finally {
    await release();
  }
}

// Deployment check: refresh current quotes, but never create a historical record.
export async function verifyPortfolioSchedule() {
  const quotes = await updatePortfolioQuotes({ includeExtended: false });
  if (quotes.failedCount > 0 || quotes.supabase.failed > 0) {
    throw new Error(`Quote verification failed: ${quotes.failedCount} failures`);
  }
  const fx = await fetchUsdKrwRate(true);
  return { status: "verified", updated: quotes.updatedCount, failed: quotes.failedCount, fxAvailable: fx.rate > 0, snapshotsWritten: 0 };
}
