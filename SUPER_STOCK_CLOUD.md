# Super Stock · ChatGPT Cloud weekly update

Fixed operating policy confirmed 2026-10-18: Saturday 07:00 Asia/Seoul, starting 2026-10-24. ChatGPT Cloud itself researches and evaluates; never call the OpenAI API, the legacy `/api/cron/super-stock` route, a local program or a second LLM. The old Supabase API cron stays paused. The task starts at 07:00; a full cohort can take time, and the page shows progress/partial results accurately.

## Storage and account scope

Use owner-connected Supabase `execute_sql`, project `nqpysdrvvdinfaeqfoio`. Do not publish account IDs, watchlists or assessments to GitHub. Read this file and `lib/super-stock/model.ts` through the connected GitHub app in `dongjin7363-cyber/East_Labs_Dashboard`, main, for the exact rubric and types.

1. Confirm the actual Korean date is Saturday and at or after 07:00. Use today's YYYY-MM-DD as `week`. The immutable evidence cutoff is Saturday 07:00 KST = Friday 22:00 UTC, including US DST changes.
2. Call `select public.prepare_super_stock_cloud('YYYY-MM-DD'::date);`. This freezes active account cohorts in `super_stock_user_weeks` and the unique nonbenchmark ticker list in `super_stock_runs`. It is idempotent. SPY/QQQ/MAGS are benchmarks, never company ratings.
3. Process only cohort tickers absent from completed/failed. Reuse an existing saved ticker/week without overwriting it. For each ticker, read its latest earlier `super_stock_weekly_scores` row and available source evidence. A missing prior week is missing history; do not fabricate five weeks of scores or treat old historical research as a contemporaneous prior.
4. Gather dated public facts directly, make an Analyst assessment, then directly audit it as Judge within the same ChatGPT Cloud execution. Save each completed ticker immediately using `select public.save_super_stock_cloud('YYYY-MM-DD'::date, 'TICKER', '<serialized JSON>'::jsonb);`.
5. Escape every single quote in a JSON SQL literal by doubling it. Never concatenate a retrieved URL, article, company name or report as SQL syntax. The functions restrict writes to the frozen cohort and recompute scores/returns. Do not change their definitions, RLS, permissions, cron settings or any other tables in a scheduled run.
6. On a confirmed ticker research failure, call `select public.save_super_stock_cloud('YYYY-MM-DD'::date, 'TICKER', null, '<escaped concrete reason>');` and continue with remaining tickers. Never insert a fallback rating for a failed company. A transient storage failure does not prove failure: reread the exact score key before retrying. Persisted scores are immutable.
7. Reread `super_stock_runs` and saved score count. Completed plus failed must account for the cohort before claiming completion. Remaining work means incomplete, not success. Report counts and failed/unprocessed tickers briefly; keep the schedule enabled. Do not alter other automations. No paid API smoke test or unsolicited Telegram delivery.

## Assessment contract

Pass an Assessment object, not a complete Snapshot; the database sets ticker, week_date, creation time, scores and classification. Preserve the existing 30/45/15/10 formula. All 16 components require a 0..5 score, a Korean rationale and nonempty supporting evidence IDs:

- Quality /40: `tam`, `adoption`, `revenue`, `margin`, `fcf`, `moat`, `capital`, `rs`.
- Delta /40: `fundamental_acceleration`, `narrative_change`, `tam_expansion`, `strategic_scarcity`, `product_mix`, `catalyst_density`, `expectation_gap`, `institutional_confirmation`.

Each `components[key]` is `{score,reason,evidence_ids}`. Top-level fields: `components`, `narrative_momentum` (0..100), `market_confirmation` (0..100), `confidence` (0..1), `thesis` (Korean), `risks` (string array), `drivers` (`{label,impact,evidence_ids}` array) and `evidence`.

Evidence entries require `{id,headline,source,source_type,url,published_at,summary,materiality,novelty,confidence,sentiment}`. Source types: primary/analyst/news/social. Sentiment: positive/neutral/negative. The last three numeric evidence weights are 0..1. At least two distinct original HTTPS URLs and one company/SEC/official primary source are mandatory. Every ID must resolve. A score above 3 cannot rely on social-only evidence. All publication times must be real and no later than cutoff. Do not invent access to analyst reports, institutional flows, financial figures or Reddit. Verify ticker identity. Use current financials but retain actual release dates; an old valid release is not a new weekly event. Separate new delta, contradiction and carried-forward thesis. Reduce confidence and explicitly list missing inputs; neutral scores for unverified items must never be described as demonstrated strengths.

The `research` object is mandatory so the live Raw Data panel can update:

```text
origin: "cloud_weekly"
version: "cloud-v1"
researched_at: actual Korean research date YYYY-MM-DD
cutoff: exact Saturday 07:00 KST ISO timestamp (Friday 22:00Z)
limitations: string[]
missing: string[]
releases: [{published_at: actual release timestamp, url: verified HTTPS URL,
            metrics: {"metric with period/unit/accounting label": actual numeric value}}]
prices: [{date: YYYY-MM-DD, open, high, low, close, volume}]
price_url: verified historical-price source URL, or "" if prices unavailable
spy_prices: same OHLCV shape for SPY
spy_price_url: verified SPY historical-price source URL, or "" if unavailable
return_1w / return_4w / spy_return_4w / excess_4w: null in the input;
  the database calculates them from the saved actual prices.
```

Collect about nine weekly observations from the last completed US session of each week, newest first, covering at least 28 days. Each observation is an actual daily bar (volume is that day's volume, not a weekly aggregate). Verify dates, splits and provider adjustment method; use consistent series. If Friday was a holiday, use the actual latest completed session, not an invented Friday bar. Prices cannot be dated on/after Saturday, duplicated or stale. Price URLs and data must be actually retrieved, not inferred from a URL pattern. Preserve real gaps and never interpolate. If a series cannot be verified, use an empty array, null returns and explicit limitations/missing inputs, not invented prices. Include the price source in evidence. Inspect official financial releases for current revenue/growth/margins/FCF/cash/debt, recording units and periods in metric keys. Leave unverified metrics absent.

The database validates sources, dates, scores and OHLCV, computes the weighted result and price returns, inserts into `super_stock_weekly_scores`, and updates completed/failed counts atomically. It does arithmetic and storage only; all analysis is performed by this ChatGPT Cloud run. Existing owner RLS remains in force. No API key is required for this path.

## Website behavior

When live results exist, the page defaults to automatic weekly evaluations. Historical 2026-09-16 research remains separately selectable and unchanged. Raw Data, component rationales and evidence come from the saved live assessment. Unavailable values display as missing. Partial cohorts are labeled. The page uses an uncached authenticated API, so new database records appear on opening or refreshing; a weekly code deployment is unnecessary.
