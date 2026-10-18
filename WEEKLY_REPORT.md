# Weekly Report publication

The schedule and presentation below are the user's fixed operating standard, confirmed on 2026-10-18. Both tasks run in ChatGPT Cloud in Asia/Seoul and continue until the user requests a change.

- Sunday 06:00: the existing `미국 위클리 매크로 리포트` task generates and delivers the original macro briefing, then saves the same completed report as website-ready JSON in `data/weekly-report-drafts/YYYY-MM-DD.json`. It must not write the final publication path.
- Sunday 07:00: `EAST Weekly Report 게시` reads that day's complete draft and publishes it to `data/weekly-reports/YYYY-MM-DD.json`, then checks the matching production deployment. It must not regenerate the analysis or reconstruct it from personal memory or partial conversation retrieval.

The first runs under this split schedule are 2026-10-25. The website reads only `data/weekly-reports`; draft commits do not add a report to the website. Keep drafts durable so publication does not depend on the previous task's conversation context or a local computer. If a complete current-day draft is unavailable, report publication failure instead of substituting another week or inventing content. The original chat briefing remains available even if draft storage fails.

## Content contract

Use the same four-field UTF-8 JSON contract for each day's draft and final publication on `main`. Create exactly one final file per publication date:

`data/weekly-reports/YYYY-MM-DD.json`

The date is the actual Sunday publication date in Asia/Seoul, not the preceding Friday's market date. Fields:

- `published_date`: `YYYY-MM-DD`, matching the filename, a valid Sunday.
- `title`: the original report title, e.g. `🇺🇸 US Weekly Macro | YYYY.MM.DD(일)`.
- `headline`: the original key headline, without its leading red-circle marker.
- `body_markdown`: the complete original report, including its title, headline, all sections, figures, tables and verified source links. Preserve its wording. Convert source-reference markers into ordinary Markdown links to their verified URLs and apply Markdown headings to section labels for readability. For the website, place the full `## ➡️ Regime` section immediately before `## 📌 Weekly Takeaway`, retaining its bold text and removing the duplicate at the bottom. Do not add an introduction explaining that the page is based on a briefing, a web edition, or a reconstructed report. This presentation order applies only to the website; preserve the existing chat briefing format.

Serialize with a JSON serializer; use real newlines in the Markdown string before serialization. Do not include secrets, execution logs, tool markers, internal metadata or a fabricated report. The website supports headings, paragraphs, bold, bullets, Markdown tables and HTTP(S) links. Raw HTML is displayed as text.

Keep Key Data as a Markdown table under its Key Data heading, with separate `지표`, `실제치`, `예상치`, and `마켓 해석` columns. The site automatically makes indicator names, actual values, and market interpretations bold and colors actual values red when above consensus, blue when below, and the default color when equal or not comparable. Legacy `시장 의미` headers display as `마켓 해석`. Compare numerical values, not whether the surprise is economically positive or negative. Do not inject HTML or inline colors into the report content.

Under Market Read-through, use `자산` and `주간 변화` table headers. Asset names render bold. Positive percentage/basis-point changes render red, negative changes blue, and prices stay black. Mixed cells such as `+4.9% / $109.86` color only the percentage change. Zero changes stay black. Keep percentage or bp units explicit so changes can be distinguished from prices.

## Publish and verify

1. At 06:00, read the draft path via the connected GitHub app in `dongjin7363-cyber/East_Labs_Dashboard`, branch `main`. Save the completed same-day JSON with `create_file`, commit message `Prepare US Weekly Macro YYYY-MM-DD`, only after confirmed absence. Reuse identical existing content; report conflicting content instead of overwriting it. Report ambiguous or failed writes accurately while still delivering the original chat briefing.
2. At 07:00, fetch and validate the complete current-day draft, then read the final target file. If the final already exists and matches the draft, do not create another file or commit. If it differs, report the conflict; never overwrite a published report automatically. If a read fails for a reason other than confirmed file absence, stop publication and report the failure.
3. Use GitHub `create_file` on the exact final path, branch `main`, copying the draft's four fields without new analysis, commit message `Publish US Weekly Macro YYYY-MM-DD`. If the result is uncertain, reread that same path before retrying. Never use a timestamp suffix or another date to bypass a collision.
4. Vercel's existing Git integration deploys the commit to the existing `east-labs-dashboard` project, ID `prj_Q5THAig5c5Hj6duRcIGCIh39ddcU`, team `team_bThRpgLUEvuoIFXPLdfiP6iY`. Do not create a new project or alter its settings. Check the matching commit deployment using connected Vercel tools. A successful Git commit alone is not proof of a live publication.
5. Confirm the deployed report at `https://east-labs-dashboard.vercel.app/weekly-report/YYYY-MM-DD` and its appearance in `/weekly-report`. A pending build means publication is pending; a failed build means the site has not updated. Report the actual result separately from the report body.

If GitHub or Vercel tools are unavailable in a scheduled run, explicitly report the affected draft/publication step and preserve both schedules. The 06:00 task still delivers its original briefing; the 07:00 task does not fabricate a replacement. Do not substitute an API-generated analysis, local cron, local files or duplicate recurring tasks.

## Site

The navigation link directly below Super Stock opens `/weekly-report`. The newest report is featured; older reports remain in descending date order. Detail pages are `/weekly-report/YYYY-MM-DD`. With no published content, the page shows its publication schedule without inventing a sample market report. Each content commit builds the list and report pages together, so the website changes only after a successful deployment.

Keep the website section order fixed: Regime → Weekly Takeaway → Key Data → Narrative Change → Fed / Rates → Market Read-through → Next Week. Preserve the confirmed formatting rules above and do not add production notes to the article.

Validation: `node --test tests/weekly-report.cjs`, `npx tsc --noEmit`, `npm run build`.
