# Export Items Seed Notes

- `data/export_items.csv` uses `sector,sheet_name,name,importance,description,related_stocks,note`.
- `sheet_name` must match the exact monthly workbook sheet name because `scripts/parse_export.py` only parses DB whitelist matches.
- `description`, `related_stocks`, and `note` are filled from `data/수출항목_분류_중요도.xlsx` sheet `수출항목 분류` when `npm run export:sync-items -- --file "data/수출항목_분류_중요도.xlsx"` runs.
- The current CSV has metadata for matched rows only; do not guess values for unmatched sheet names.
- When the workbook is available, map columns as follows: `섹터 -> sector`, `시트명 -> sheet_name`, `항목 설명 -> description`, `관련 종목 -> related_stocks`, `비고 -> note`. Keep the current UI-compatible numeric `importance` unless intentionally reseeding.
