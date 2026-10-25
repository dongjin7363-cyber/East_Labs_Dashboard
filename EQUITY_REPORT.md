# EAST Weekly Equity Report

Separate from US Weekly Macro: never modify its schedule, instructions, drafts or publications.

## Schedule and destinations

- Asia/Seoul Saturday 06:00: research and generate an equity draft. First scheduled run: 2026-10-31.
- Saturday 07:00: validate and publish that exact completed draft. The time is the start of publication; Git/Vercel build latency can delay website availability.
- Scheduler: two Codex app heartbeat automations in the implementing chat. These run locally, so the computer must be on and the app running. They are **not** the existing macro ChatGPT Cloud tasks. Do not claim cloud execution. Durable data lives in GitHub, not chat memory.
- Repository `dongjin7363-cyber/East_Labs_Dashboard`, branch `main`.
- Draft: `data/equity-report-drafts/YYYY-MM-DD.json`.
- Published: `data/equity-reports/YYYY-MM-DD.json`.
- Shared library `/weekly-report` under the single Weekly Report menu. Both latest reports appear together: `🌏 Weekly Macro` in green and `📊 Weekly Equity` in blue, followed by a combined chronological archive of small white cards. There are no category tabs. Legacy `/equity-report` redirects to this shared page; old type query parameters do not filter it. Detail URLs remain `/equity-report/YYYY-MM-DD`. The stored report type/title contract is unchanged.
- Existing Vercel Git integration: project `prj_Q5THAig5c5Hj6duRcIGCIh39ddcU`, team `team_bThRpgLUEvuoIFXPLdfiP6iY`. Production domain `https://east-labs-dashboard.vercel.app`.
- Never write `data/weekly-report-drafts` or `data/weekly-reports`, change other scheduled jobs, send Telegram/email, or alter deployment settings for this workflow.

## Research / generation at 06:00

Read this contract and `lib/equity-report/model.ts` from current main. Determine today's Saturday date in Asia/Seoul; no late Sunday catch-up. Check today's equity draft/final paths before research. A read error is not absence. Reuse a complete valid existing draft; never replace conflicting data or publish from the generation task.

Research the completed trading week in Korean using current connected sources and web browsing. Do not reuse prices, earnings or economic figures from chat memory. Source hierarchy: exchanges and official index providers for indices, Treasury/Federal Reserve and BOK/KOFIA for government yields, the declared gold benchmark provider, an explicitly named exchange/provider for BTC; BLS/BEA/Fed/BOK/KOSTAT and official releases for economics; company IR/SEC/DART for earnings and guidance. Consensus requires its own identified provider and pre-release vintage; if unverifiable use `확인 불가`, never a fabricated number. Cite facts with ordinary Markdown links in every analytical section and label interpretations separately.

Use previous-Friday closing observations (or previous completed session on a holiday) to current-Friday closing observations. Include daily observations in between when verified; do not interpolate missing observations. Clearly identify gold spot/futures contract and roll effects. BTC is 24/7: use one consistent UTC daily cutoff across both weeks, disclose it in note; at Saturday 06:00 KST the Friday UTC daily close is unavailable, so use the latest fully completed UTC day and explicitly label the comparison. Do not call an intraday quote an official close. At US standard time, Friday equity closes at Saturday 06:00 KST: verify the completed close after the bell before finishing the draft. Record true source observation timestamps and report cutoff. A complete draft must be ready before 07:00. Holidays/long closures or unavailable required data must cause an explicit incomplete-run failure; do not silently weaken freshness validation or fabricate charts.

Minimum asset IDs: `kospi`, `kosdaq`, `sp500`, `nasdaq`, `us2y`, `us10y`, `kr3y`, `kr10y`, `gold`, `bitcoin`. Optional extra verified assets (e.g. USDKRW, oil) up to 20 total. Treasury values are yields in percent; their weekly changes are basis points, not bond price returns. Prices/indices use percentage returns. Website computes changes from observations.

## JSON contract

UTF-8 JSON; serializer required. No raw HTML, secrets, execution notes, unresolved tool citation markers or synthetic data. Validate with `npx tsx scripts/validate-equity-report.ts <temporary-directory>/YYYY-MM-DD.json` in a checkout of current main before writing. Keep temporary files outside published data directories. Failure means no draft commit.

Fields (all required):

- `schema_version`: 1
- `report_type`: `east_weekly_equity`
- `published_date`: actual Saturday KST, matching filename
- `generated_at`: actual completion timestamp with timezone, 06:00 <= time < 07:00 KST
- `cutoff_at`: explicit timezone timestamp of information cutoff, <= generated_at, >= 05:00 KST
- `title`: starts `EAST Weekly Equity Report`, append date
- `headline`: concise Korean weekly narrative
- `body_markdown`: complete report with the exact six level-two headings below, in order
- `dashboard`: array of source-backed series. Each has `id`, `label`, `unit`, `kind` (`price` or `yield`), `source_name`, `source_url` (http/https), `as_of` (timezone timestamp of latest source observation), `note` (empty allowed), and `points` (2–10 ascending unique `{date: YYYY-MM-DD, value: finite number}` observations). Source links must support the observations. Earliest point is the previous week's close (8–11 days before Saturday), latest is 1–4 days before Saturday. Non-Friday endpoints require a note. Never mix adjusted/unadjusted bases or units within a series.

Do not include a Macro & Economic Conditions section or duplicate the macro report’s economic indicator tables. Focus on equities and cross-asset implications.

Exact headings:

1. `## Regime`: regime classification, evidence and what would invalidate it.
2. `## Weekly Takeaway`: 3–5 short bullet points summarizing the week.
3. `## 01 Weekly Market Dashboard`: website inserts the ten source-backed charts, closes, weekly changes and observation tables directly after this heading. Add a short cross-market summary; do not duplicate manually calculated dashboard values.
4. `## 02 Equity Market & Earnings`: prioritize KR/US companies whose actual earnings, guidance or events changed market momentum. Identify company/ticker/date, actual revenue/EPS vs verifiable consensus/previous period, guidance, price reaction and sector read-through. Separate earnings-driven moves from other catalysts; if no relevant verified result, state that rather than inventing one.
5. `## 03 Bonds Commodities & Crypto`: KR/US short/long yields, curves and weekly bp moves; gold and BTC performance, verified catalysts and implications for equities.
6. `## 04 Next Week Watchlist`: dated KST calendar for economics, central banks and major earnings; expected vs previous if verified, release-time timezone, bull/bear scenarios and variables to watch. Distinguish confirmed from tentative events.

Each numbered section ends with `### Market Read-through` followed by a concise Korean synthesis. Sections 02–04 each require verified source links. Avoid long prose blocks; use bullets, compact tables and a final synthesis in each section. The top Regime/Weekly Takeaway must remain above the dashboard.

## Durable draft write

Use connected GitHub tools. After validation read exact draft target again. On confirmed absence, create on `main` with message `Prepare EAST Weekly Equity YYYY-MM-DD`. If identical content exists, no-op. If different, stop and report conflict. On ambiguous write, reread exact path and compare; no blind retry or suffix. Keep the report durable and report validation/storage errors accurately. Do not modify application code during a scheduled research run.

## Publish at 07:00

1. Verify today's KST Saturday and clock >=07:00. Fetch complete same-day draft from main; no personal memory, regeneration, previous-week fallback or partial content. If missing, fail visibly and do not publish.
2. Fetch final path. Treat only confirmed 404/absence as absent. Save fetched draft temporarily outside `data/equity-reports` and run the validator in publish mode: `npx tsx scripts/validate-equity-report.ts <temp>/YYYY-MM-DD.json publish YYYY-MM-DD`. `publicationDecision` in the model defines duplicate/conflict semantics; compare parsed JSON deeply, independent of object-key ordering. Identical existing final is a no-op; conflicting final is a hard stop.
3. On confirmed absence, GitHub `create_file` writes the exact validated draft bytes to the final path on main, commit `Publish EAST Weekly Equity YYYY-MM-DD`. Never overwrite a published file automatically. Reread after uncertainty before retrying.
4. Find the production Vercel deployment matching the returned Git commit SHA in the exact project/team above. For a no-op, verify the deployment serving the existing report. Wait with bounded checks for READY; pending/error is not success. Do not change settings or deploy a different commit.
5. Verify both production URL `/equity-report/YYYY-MM-DD` (headline, seven sections, ten charts) and `/weekly-report` (latest Equity banner; legacy `/equity-report` redirects here). Report the publication URL or the specific failed stage. Quietly stop only when an already-published identical report is confirmed live and nothing changed.

## Validation

`node --test tests/equity-report.cjs tests/weekly-report.cjs`, `npx tsc --noEmit`, `npm run build`.

Tests use explicit synthetic fixtures, never committed to either draft or final production folders. Test early/late publication, duplicate/conflicting writes, type isolation, stale/future data, missing assets, section order, computed returns/bp, safe rendering, and chart placement. The initial rollout may correctly show an empty archive until the first real scheduled report; do not publish a fabricated demonstration report.

## User-supplied historical issue

The user explicitly supplied and requested publication of issue 001 (2026-10-24) on 2026-10-25. It uses schema version 2, `publication_mode: user_supplied_archive`, the actual `imported_at` timestamp and an explicit source description. It transcribes the supplied screenshots; it does not claim independent source verification, a fabricated historical generation timestamp, or fabricated daily observations. The comparison chart uses only the seven assets with explicit weekly returns in the source table (the Dow graphic has no numeric value). The full source table and narrative are preserved, with EAST branding and the Macro page's formatting. No missing Korean yields or source URLs are fabricated. Archived records can render, but `validatePublication` rejects them: the scheduled pipeline continues to require the complete version 1 source-backed contract.
