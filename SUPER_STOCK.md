# Super Stock

Route: `/market/super-stock`, immediately below 수출입 데이터.

Watchlists are account-specific. Saturday 09:00 KST (00:00 UTC) freezes each
account's cohort, then processes one unique ticker per invocation. Adding a
watchlist ticker does not fabricate a score or backfill prior weeks. Removing
it preserves historical cohorts. Rank changes use the previous week's actual
cohort. The UI labels incomplete rankings and uses exact calendar-week matches
for WoW and 4W differences. Evidence and all 16 components are retained inside
each immutable assessment JSON; updates are insert-only in application code.

Quality /40 contributes 30 points; Delta /40 contributes 45; Narrative /100
contributes 15; Market Confirmation /100 contributes 10. Scores are subjective
AI ratings, not measured expected returns. Rubric version is `1`. Ties use ticker
order. Classification boundaries are 30/40 on each axis.

## OpenAI setup and activation

1. In Vercel `east-labs-dashboard`, set server-only `OPENAI_API_KEY` for Production.
   Optional `SUPER_STOCK_MODEL` defaults to `gpt-5.4-mini`.
2. Redeploy so the new runtime receives the variable.
3. Apply `supabase/sql/super_stock.sql` once on a new database. This has already
   been applied to the EAST production database during implementation.
4. `supabase/sql/super_stock_cron.sql` registers a **paused** Saturday worker.
   Keep it paused until a real authenticated run confirms model access, quota,
   web research, strict structured output and persistence.
5. Enable the job via `cron.alter_job(..., active := true)` after the smoke test.

The worker reuses the existing server-only portfolio cron authentication secret;
no secret is exposed to the browser. No API key is included in this repository.
The same infrastructure performs independent scheduled calls, without requiring
an open browser. One run can process up to 143 tickers plus finalization in the
12-hour window; monitor `super_stock_runs` for unfinished/partial runs. Failed
tickers are not given fallback scores. Operators can clear specific entries in
`failed` and invoke again for an explicit retry within the same cutoff week.
Prior successfully persisted scores are reused, so retries do not overwrite them.

## Evidence pipeline

Responses API web search collects cited public evidence; separate Analyst and
Judge requests return strict JSON. Validation rejects future-dated evidence,
non-HTTPS links, missing/duplicate IDs, unknown component references, scores out
of range, social-only high component scores, and evidence URLs absent from the
research tool's returned sources. There must be at least two evidence entries
and one primary source. This checks provenance, not the truth of every source;
AI may still misread a source. Unavailable paywalled analyst reports, Reddit
content or financial metrics are disclosed as limitations. Market confirmation
is based on cited public evidence, not a dedicated institutional flow data feed.

Sources:
- https://developers.openai.com/api/docs/guides/tools-web-search
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Verification

`npm test`, `npm run lint`, `npm run build`. Live paid OpenAI evaluation is
pending API key registration; tests use fixtures, never fabricated live ratings.

## Historical research (2026-09-16)

The user requested actual historical reconstruction for 2026-08-15 through
2026-09-12. 31 equities have five ratings each; SPY, QQQ and MAGS are benchmarks
without company ratings. Corrected source-table ticker aliases: TSMC → TSM and
CRBS → CBRS. HOOD is included from the earlier screening set.

`data/super-stock/research-*` contains the dated public-source ledger, nine
Friday OHLCV observations per instrument, and generated snapshots. Run
`node scripts/build-super-stock-research.cjs` to reproduce the ratings. These
are retrospective analyst judgments, not the original provisional ratings,
contemporaneous observations, or output from the live Analyst/Judge pipeline.
They live in account-scoped `super_stock_research` with read-only owner RLS,
and are displayed in a separate view. Live workers never consume these as priors.

Only releases before each Saturday 00:00 UTC cutoff are eligible. Known prior
financials carry forward until a new release. Source dates are conservatively
represented as end-of-day UTC. Historical market observations use Friday close
and exclude dividends; the current vendor history can include later corrections
or split adjustments. Volume is the Friday daily volume, not weekly volume.

`historical-v1` retains the 30/45/15/10 score weights. The first seven quality
and first five delta components are explicit research judgments in the ledger.
Unverified financial components and expectation gaps get a disclosed neutral
2.5. Institutional flows were not retrieved; the institutional/RS component
uses only RS. The 4-week excess return against SPY maps to RS 5/4.5/3.5/2.5/1.5/0.5
at thresholds 10/5/0/-5/-10 percentage points. Market confirmation is
clamp(50 + 2 × excess4w + return1w, 0, 100). Narrative is a **filing-recency
proxy**, not a measured news/social sentiment series: clamp(30 + 30 × freshness
+ 10 × selected events in 28 days, 0, 100). Freshness is 1/.75/.5/.25 for
release ages ≤7/≤14/≤28/>28 days. Catalyst density is min(5, 1 + 2 × freshness
+ .5 × recent event count); recent selected events add .5 to narrative change,
TAM expansion and product/mix. This narrow event sample does not represent an
exhaustive news archive. Selection and hindsight bias remain possible.

The UI exposes financial raw metrics with period/unit/accounting labels,
dated evidence links, five-week scores, price inputs, missing fields, formulas,
limitations, and downloadable JSON. The cron remains paused until the user
registers an OpenAI API key and a paid live run is verified.
