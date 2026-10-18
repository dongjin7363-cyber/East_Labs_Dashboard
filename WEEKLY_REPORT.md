# Weekly Report publication

The existing ChatGPT Cloud task `미국 위클리 매크로 리포트` generates the report on Sundays at 10:00 Asia/Seoul. Publish the same completed report to this repository; do not generate a second analysis or depend on a local computer.

## Content contract

Create exactly one UTF-8 JSON file per publication date on `main`:

`data/weekly-reports/YYYY-MM-DD.json`

The date is the actual Sunday publication date in Asia/Seoul, not the preceding Friday's market date. Fields:

- `published_date`: `YYYY-MM-DD`, matching the filename, a valid Sunday.
- `title`: the original report title, e.g. `🇺🇸 US Weekly Macro | YYYY.MM.DD(일)`.
- `headline`: the original key headline, without its leading red-circle marker.
- `body_markdown`: the complete original report, including its title, headline, all sections, figures, tables and verified source links. Preserve its wording. Only convert source-reference markers into ordinary Markdown links to their verified URLs and apply Markdown headings to section labels for readability.

Serialize with a JSON serializer; use real newlines in the Markdown string before serialization. Do not include secrets, execution logs, tool markers, internal metadata or a fabricated report. The website supports headings, paragraphs, bold, bullets, Markdown tables and HTTP(S) links. Raw HTML is displayed as text.

## Publish and verify

1. Read the target file via the connected GitHub app in `dongjin7363-cyber/East_Labs_Dashboard`, branch `main`.
2. If it already exists and matches this completed report, do not create another file or commit. If it differs, report the conflict; never overwrite a published report automatically. If the read fails for a reason other than confirmed file absence, stop publication and report the failure.
3. Use GitHub `create_file` on the exact path, branch `main`, commit message `Publish US Weekly Macro YYYY-MM-DD`. If the result is uncertain, reread that same path before retrying. Never use a timestamp suffix or another date to bypass a collision.
4. Vercel's existing Git integration deploys the commit to the existing `east-labs-dashboard` project, ID `prj_Q5THAig5c5Hj6duRcIGCIh39ddcU`, team `team_bThRpgLUEvuoIFXPLdfiP6iY`. Do not create a new project or alter its settings. Check the matching commit deployment using connected Vercel tools. A successful Git commit alone is not proof of a live publication.
5. Confirm the deployed report at `https://east-labs-dashboard.vercel.app/weekly-report/YYYY-MM-DD` and its appearance in `/weekly-report`. A pending build means publication is pending; a failed build means the site has not updated. Report the actual result separately from the report body.

If GitHub or Vercel tools are unavailable in a scheduled run, deliver the original macro briefing as usual and explicitly report the website publication failure. Keep the original task enabled. Do not substitute an API-generated analysis, local cron, local files or a new recurring task.

## Site

The bottom navigation link opens `/weekly-report`. The newest report is featured; older reports remain in descending date order. Detail pages are `/weekly-report/YYYY-MM-DD`. With no published content, the page shows its publication schedule without inventing a sample market report. Each content commit builds the list and report pages together, so the website changes only after a successful deployment.

Validation: `node --test tests/weekly-report.cjs`, `npx tsc --noEmit`, `npm run build`.
