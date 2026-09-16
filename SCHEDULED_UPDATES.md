# Portfolio schedule

Production uses Supabase Cron to POST to `/api/cron/portfolio` at KST 07:00, 12:00 and 17:00 every day (including weekends). GitHub's former 10-minute workflow is removed. The dashboard's manual refresh remains available.

The portfolio page refreshes on each signed-in page visit and when returning to the tab. Manual refresh remains available. The former two-hour portfolio polling timer is removed. Index widgets retain their existing independent polling.

At 07:00, quote refresh must succeed for every enabled holding before valuation. The job reads current server holdings and KRW/USD deposits and external KRW cash, obtains a valid USD/KRW rate, and calculates the same total as the portfolio page (including credit-position P&L). It saves that total under the preceding KST calendar date in `total_asset_snapshots`, which Performance reads. A 2026-09-16 07:00 KST run writes 2026-09-15. Existing notes are preserved. No historical record is written at noon or 17:00.

This is the portfolio valued using quotes fetched by the 07:00 job, not a guarantee of exchange trades executed precisely at 07:00:00. Invocation delays over 15 minutes are rejected rather than labeling later prices as the 07:00 value. Failed quote/FX/account reads abort the snapshot. `portfolio_schedule_runs` records success/failure; network delivery is visible in `net._http_response` and Cron's job history. Repeated completed slots are no-ops, and snapshot writes plus completion are atomic.

## Deployment

1. Apply `supabase/sql/portfolio_scheduled_updates.sql` (server-only tables/RPCs; pg_cron and pg_net).
2. Store a random shared value in Supabase Vault as `east_portfolio_cron_secret`, and Vercel production as `PORTFOLIO_CRON_SECRET`. Never put it in source control.
3. Deploy. An authenticated GET to the endpoint verifies access; an authenticated POST with `{"mode":"verify"}` updates quotes and checks FX without writing historical snapshots.
4. Apply `supabase/sql/portfolio_cron_schedule.sql` after verifying the endpoint.

The endpoint uses the existing production KIS and Supabase server credentials. No GitHub KIS secrets are necessary for the new automatic schedule.

## KIS tokens

Tokens are reused from memory and the shared `kis_tokens` row. Korean offset-free expiry values are parsed as +09:00 and capped to a 24-hour lifetime. In-process single-flight plus a database lease prevents concurrent new-token requests. Database lookup failures do not cause blind reissuance. Expired-token invalidation only deletes the rejected token, not a newer token stored by another worker.

The application has no documented KIS control to disable issuance SMS. Unnecessary issuance is reduced; SMS can still arrive when an expired/rejected token genuinely needs replacement.
