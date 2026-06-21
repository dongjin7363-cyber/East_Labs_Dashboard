#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

find_latest_export_file() {
  python3 - "$PROJECT_ROOT" <<'PY'
import os
import re
import sys
from pathlib import Path

project_root = Path(sys.argv[1]).resolve()
home = Path.home()
roots = os.environ.get("EXPORT_SEARCH_DIRS")
if roots:
    search_roots = [Path(value).expanduser() for value in roots.split(os.pathsep) if value]
else:
    search_roots = [project_root, home / "Downloads", home / "Desktop"]

max_depth = int(os.environ.get("EXPORT_SEARCH_MAX_DEPTH", "4"))
include = re.compile(os.environ.get("EXPORT_FILE_INCLUDE_REGEX", r"(export|수출|주요품목)"), re.I)
exclude = re.compile(
    os.environ.get(
        "EXPORT_FILE_EXCLUDE_REGEX",
        r"(^~\$|수출항목|분류|중요도|finviz|watchlist|metadata|mapping|template|템플릿|업종|노출도|equal_weight)",
    ),
    re.I,
)
skip_dirs = {".git", ".next", "node_modules", "__pycache__"}
suffixes = {".xls", ".xlsx", ".xlsm"}
candidates = []

for root in search_roots:
    if not root.exists():
        continue

    root = root.resolve()
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        try:
            relative_depth = len(current_path.relative_to(root).parts)
        except ValueError:
            relative_depth = 0

        dirs[:] = [
            name
            for name in dirs
            if name not in skip_dirs and not name.startswith(".") and relative_depth < max_depth
        ]

        for filename in files:
            file_path = current_path / filename
            if file_path.suffix.lower() not in suffixes:
                continue
            if exclude.search(filename):
                continue
            if not include.search(filename):
                continue

            try:
                stat = file_path.stat()
            except OSError:
                continue

            candidates.append((stat.st_mtime, str(file_path)))

if not candidates:
    raise SystemExit(
        "No export Excel file found. Set EXPORT_FILE=/absolute/path/to/file.xlsx to choose one explicitly."
    )

candidates.sort(reverse=True)
print(candidates[0][1])
PY
}

if [[ -n "${EXPORT_FILE:-}" ]]; then
  export_file="$EXPORT_FILE"
else
  export_file="$(find_latest_export_file)"
fi

if [[ ! -f "$export_file" ]]; then
  echo "[export:auto] Excel file does not exist: $export_file" >&2
  exit 1
fi

as_of_date="${EXPORT_AS_OF_DATE:-$(date +%F)}"

echo "[export:auto] Using Excel file: $export_file"
echo "[export:auto] Using as-of date: $as_of_date"
parse_log="$(mktemp -t export-parse.XXXXXX.log)"
trap 'rm -f "$parse_log"' EXIT
python3 scripts/parse_export.py --file "$export_file" --as-of-date "$as_of_date" | tee "$parse_log"
expected_period="$(
  awk '/^[[:space:]]+[0-9]{4}-[0-9]{2}:/ { gsub(":", "", $1); value = $1 } END { print value }' "$parse_log"
)"

echo "[export:auto] Verifying latest Supabase export period"
if [[ -n "$expected_period" ]]; then
  node scripts/check-export-latest.js --period "$expected_period"
else
  node scripts/check-export-latest.js
fi

echo "[export:auto] Deploying to Vercel production"
vercel_args=(deploy --prod)
if [[ -n "${VERCEL_TOKEN:-}" ]]; then
  vercel_args+=(--token "$VERCEL_TOKEN")
fi

npx --yes vercel "${vercel_args[@]}"
