# EAST Weekly Equity Report

Separate from US Weekly Macro: never modify its schedule, instructions, drafts or publications.

## Schedule and destinations

- Asia/Seoul Saturday 06:00: research and generate an equity draft. First scheduled run: 2026-10-31.
- Saturday 07:00: validate and publish that exact completed draft. The time is the start of publication; Git/Vercel build latency can delay website availability.
- Scheduler: two ChatGPT Cloud scheduled tasks, verified in the web Scheduled view on 2026-10-25. They run without the user’s computer or app. Generation ID `6ade168103dc81908acccd0d8219d6f4` (Saturday 06:00 Asia/Seoul); publication ID `6ade17095ec88190b62dfeeeadaf66a8` (Saturday 07:00 Asia/Seoul). The former local Codex automations `east-weekly-equity-report` and `east-weekly-equity-report-2` are paused to prevent duplicate execution. Durable data lives in GitHub, not chat memory. Existing Macro cloud schedules remain separate and unchanged.
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

UTF-8 JSON. No raw HTML, secrets, execution notes, unresolved tool citation markers or synthetic data. Use the same connected-tool workflow as Macro: ChatGPT Cloud researches and checks the report, GitHub stores the draft, and a separate publication task copies the checked draft to the published path. A shell, repository checkout, npm/npx installation or local Mac process is NOT a prerequisite. If a cloud code runtime is available, use JSON serialization/parsing and the current model validator as an additional check; otherwise explicitly check every rule in `lib/equity-report/model.ts` using the checklist below. Do not claim an automated validator ran when it did not. Missing mandatory source data, invalid schema, or failed GitHub access still means no draft commit. The website continues to run the unchanged `parseEquityReport` against published records; only a matching production READY deployment plus the live page is publication success.

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

Do not append an EAST / GLOBAL MARKET RESEARCH / WEEKLY EDITION footer; the website provides its own navigation footer.

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
2. Fetch final path. Treat only confirmed 404/absence as absent. Recheck the full schema and source/time checklist below against the fetched draft and current model. If available, run the model in a cloud runtime as an additional check; npm/npx or shell access is not mandatory. `validatePublication` and `publicationDecision` define the same-day/07:00 and duplicate/conflict rules; all still apply without a shell. Compare parsed JSON deeply, independent of object-key ordering, or copy and compare exact fetched draft text. Identical existing final is a no-op; conflicting final is a hard stop.
3. On confirmed absence, GitHub `create_file` writes the exact validated draft bytes to the final path on main, commit `Publish EAST Weekly Equity YYYY-MM-DD`. Never overwrite a published file automatically. Reread after uncertainty before retrying.
4. Find the production Vercel deployment matching the returned Git commit SHA in the exact project/team above. For a no-op, verify the deployment serving the existing report. Wait with bounded checks for READY; pending/error is not success. Do not change settings or deploy a different commit.
5. Verify both production URL `/equity-report/YYYY-MM-DD` (headline, six main sections, at least ten required asset charts) and `/weekly-report` (latest Equity banner; legacy `/equity-report` redirects here). Report the publication URL or the specific failed stage. Quietly stop only when an already-published identical report is confirmed live and nothing changed.

## Validation

`node --test tests/equity-report.cjs tests/weekly-report.cjs`, `npx tsc --noEmit`, `npm run build`.

Tests use explicit synthetic fixtures, never committed to either draft or final production folders. Test early/late publication, duplicate/conflicting writes, type isolation, stale/future data, missing assets, section order, computed returns/bp, safe rendering, and chart placement. The initial rollout may correctly show an empty archive until the first real scheduled report; do not publish a fabricated demonstration report.

## User-supplied historical issue

The user explicitly supplied and requested publication of issue 001 (2026-10-24) on 2026-10-25. It uses schema version 2, `publication_mode: user_supplied_archive`, the actual `imported_at` timestamp and an explicit source description. It transcribes the supplied screenshots; it does not claim independent source verification, a fabricated historical generation timestamp, or fabricated daily observations. The comparison chart uses only the seven assets with explicit weekly returns in the source table (the Dow graphic has no numeric value). The source table is preserved; user-approved editorial changes remove the overlapping Macro & Economic Conditions section and redundant labels/footer, with EAST branding and the Macro page’s formatting. No missing Korean yields or source URLs are fabricated. Archived records can render, but `validatePublication` rejects them: the scheduled pipeline continues to require the complete version 1 source-backed contract.

## Approved presentation memory — 2026-10-25

Use this saved contract on every run, rather than relying on conversation memory. Presentation changes require a user request; scheduled runs only update research data.

- Shared Weekly Report page has no Macro/Equity tabs. Latest Macro uses lime #19E619 with dark readable text; latest Equity uses blue #1444FD. Older reports are small white cards below.
- Latest banner order: Latest Report + category + YYYY.MM.DD weekday on one wrapping row, then headline, then 리포트 읽기 and the bottom-right arrow. No duplicate category/date subtitle.
- Headline style: explain the weekly finding and its market implication in approachable Korean. Macro focuses on growth/inflation/policy/rates. Equity focuses on earnings, guidance, stock reactions, cash flow and profitability; avoid repeating the macro headline.
- Approved examples (style only, never reuse as fresh research): Macro “미국 경기는 견조하지만 물가 부담은 확대 — 국채금리 하락은 안전자산 선호를 반영”; Equity “견조한 실적에도 AI·반도체주 약세 — 시장은 투자 확대보다 현금흐름과 수익성을 주목”.
- Stored Equity headings must match the six-section contract above exactly. The renderer replaces numeric labels with ➡️ Regime, 📌 Weekly Takeaway, 📊 Weekly Market Dashboard, 🏢 Equity Market & Earnings, 💹 Bonds Commodities & Crypto, 🎯 Next Week Watchlist. Do not insert emojis into stored headings or change numbering independently.
- Subheadings include 📈 Market Read-through and 🧭 Weekly Outlook through the renderer. Preserve analytical interpretation after each numbered section.
- Major sections have a centered 80%-width, 1px #e7eaf0 separator, with 10% side margins and 48px above / 40px below. The article title separator stays full width. Do not add Markdown separators or duplicate lines between subheadings.
- Omit GLOBAL CROSS-ASSET PERFORMANCE between chart and table. Omit EAST / GLOBAL MARKET RESEARCH · WEEKLY EDITION 001 at the end.
- No Macro & Economic Conditions section in Equity. Keep the market dashboard, earnings, cross-assets and next-week watchlist.

## Cloud migration verification

Both cloud tasks were saved for Saturday 06:00 / 07:00 GMT+9, first run 2026-10-31; old local schedules paused. Configuration and repository validation have been checked. A live cloud research-to-publication run has not yet completed; do not represent configuration checks as an end-to-end scheduled execution test. Generation and publication must each have connected GitHub and required source/Vercel tools available at runtime. On missing access or failed validation, report clearly and leave existing publications intact.

## Cloud workflow recovery — 2026-10-31

The 2026-10-31 generation run ended without a draft, with empty result text and requires_user_action=true; the generation task was subsequently found disabled. The publication run correctly reported missing draft/final. Available run metadata does not expose the disabling actor or exact error. The previous mandatory npm/npx runtime was a separate architectural dependency, not a proven cause of that run's failure. Remove that runtime prerequisite; retain all model/data checks.

### Required checks without a shell

- Read current main contract/model, then today's exact draft and final paths. Only confirmed NOT_FOUND is absence; permission/network errors are failures.
- schema_version=1, report_type=east_weekly_equity; filename/published_date must agree and be the actual Saturday in Asia/Seoul. Title starts EAST Weekly Equity Report. All required text fields are nonempty; no unresolved tool citation markers.
- generated_at is the true completion time in [06:00,07:00) KST. cutoff_at is timezone-explicit, at/after 05:00 and at/before generated_at. Never fabricate timestamps to recover a late run.
- Exactly six level-two headings in SECTION_TITLES order. Sections 01–04 each contain a nonempty level-three Market Read-through; 02–04 contain verified ordinary source links.
- dashboard has 10–20 unique IDs including all REQUIRED_ASSETS. Every item has nonempty id/label/unit/source_name, a verified HTTP(S) source_url, note string, timezone-explicit as_of, kind and points. Four treasury IDs use kind=yield, unit=%; other assets use kind=price.
- as_of is no later than cutoff_at and no earlier than publication-date UTC minus three days, matching the model. Every points array has 2–10 finite numeric observations, valid ascending unique dates, all before published_date; prices are positive. First date is 8–11 days before publication and last date no more than four days before publication. Non-Friday endpoints require an explanation; source timestamps and observations must be genuine. Respect the documented BTC completed-UTC-day cutoff.
- Check the complete fetched JSON and numeric units; preserve all source links and content. GitHub round-trip read must match the authored JSON before claiming draft storage success. No incomplete chart, placeholder value, interpolated missing price, archive-schema substitution or fabricated consensus.
- Publishing additionally requires actual KST date=published_date and clock>=07:00, with generated_at not in the future. Existing identical final is a no-op; conflicting final is never overwritten. Copy the exact draft bytes on confirmed absence. Confirm matching commit production READY and the dated report plus shared listing.

### Scheduling and failure behavior

Keep existing two ChatGPT Cloud tasks, explicitly Asia/Seoul Saturday 06:00 generation and 07:00 publication. If scheduler starts early, read contracts and prepare but wait until the actual boundary before timestamping the completed draft or publishing; do not declare failure solely for an early start. Never require the user's MacBook or application to be running.

No scheduled execution may modify, disable or delete its own or another task. Failures are per-run: record date, stage (source collection / schema check / draft write / draft read / publication write / deployment), exact tool error, and last successful step. Always emit a readable failure result; never silently finish with empty output. Retry a confirmed transient read/network failure at most twice respecting Retry-After; re-read after any ambiguous write, never blindly duplicate it. Do not add watcher tasks or regenerate a report during publication. Platform-imposed pauses cannot be prevented by prompt instructions and must not be described as impossible.

## User-authorized same-day recovery

When the user explicitly requests a missing issue to be researched and published after 07:00 on the same Saturday, schema 1 may use publication_mode=manual_recovery, recovery_authorized_at (actual same-day authorization-processing timestamp), and recovery_reason. generated_at must be the true completion time at/after 07:00 on that Saturday. All source, coverage, heading, freshness and numeric checks remain unchanged. The normal scheduled validator rejects this mode; only the directly authorized recovery may write it. This is not permission for scheduled jobs to create late reports or change timestamps. On 2026-10-31 the user explicitly requested today's missing Equity report to be executed and published.
