#!/usr/bin/env python3
"""One-off cleanup for excluded US sector-etf-trend snapshots.

Deletes rows/files for excluded section/symbol rules on a target run_date:
- blocked section: contains both '자산배분' and '멀티에셋'
- blocked symbols: VTI, IVV, PHXE (normalized)

Environment variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime
from typing import Any

import requests
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
MARKET_REGION = "us"
PAGE_SLUG = "sector-etf-trend"
BUCKET = "market-images"
BLOCKED_SYMBOLS = {"VTI", "IVV", "PHXE"}


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()

    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")

    return value


def _headers(api_key: str) -> dict[str, str]:
    return {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
    }


def _today_kst() -> str:
    return datetime.now(KST).date().isoformat()


def _normalize_symbol(symbol: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (symbol or "").upper())


def _is_blocked_section(section: str) -> bool:
    compact = re.sub(r"[\s/_-]+", "", (section or "").strip())
    return "자산배분" in compact and "멀티에셋" in compact


def _is_blocked_row(row: dict[str, Any]) -> bool:
    symbol = _normalize_symbol(str(row.get("symbol", "")))

    if symbol in BLOCKED_SYMBOLS:
        return True

    section = str(row.get("section", ""))
    return _is_blocked_section(section)


def _fetch_rows(*, supabase_url: str, api_key: str, run_date: str) -> list[dict[str, Any]]:
    url = f"{supabase_url}/rest/v1/market_snapshots"
    params = {
        "select": "id,snapshot_key,symbol,section,image_path",
        "market_region": f"eq.{MARKET_REGION}",
        "page_slug": f"eq.{PAGE_SLUG}",
        "run_date": f"eq.{run_date}",
    }

    response = requests.get(url, params=params, headers=_headers(api_key), timeout=30)

    if response.status_code >= 300:
        raise RuntimeError(f"fetch failed {response.status_code}: {response.text}")

    data = response.json()
    return data if isinstance(data, list) else []


def _delete_snapshot_rows(*, supabase_url: str, api_key: str, row_ids: list[int]) -> int:
    if not row_ids:
        return 0

    url = f"{supabase_url}/rest/v1/market_snapshots"
    deleted = 0

    for idx in range(0, len(row_ids), 100):
        chunk = row_ids[idx : idx + 100]
        params = {
            "id": f"in.({','.join(str(v) for v in chunk)})",
            "Prefer": "return=representation",
        }
        headers = {
            **_headers(api_key),
            "Prefer": "return=representation",
        }
        response = requests.delete(url, params=params, headers=headers, timeout=30)

        if response.status_code >= 300:
            raise RuntimeError(f"delete rows failed {response.status_code}: {response.text}")

        body = response.json() if response.text else []
        deleted += len(body) if isinstance(body, list) else 0

    return deleted


def _delete_storage_paths(*, supabase_url: str, api_key: str, paths: list[str]) -> int:
    if not paths:
        return 0

    url = f"{supabase_url}/storage/v1/object/{BUCKET}"
    headers = {
        **_headers(api_key),
        "Content-Type": "application/json",
    }

    deleted = 0

    for idx in range(0, len(paths), 100):
        chunk = paths[idx : idx + 100]
        response = requests.delete(url, headers=headers, data=json.dumps(chunk), timeout=30)

        if response.status_code >= 300:
            raise RuntimeError(f"delete storage failed {response.status_code}: {response.text}")

        deleted += len(chunk)

    return deleted


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup excluded symbols/section from market snapshots")
    parser.add_argument("--run-date", default="", help="YYYY-MM-DD (default: today KST)")
    parser.add_argument("--dry-run", action="store_true", help="Print targets only")
    args = parser.parse_args()

    run_date = args.run_date or _today_kst()

    supabase_url = _required_env("SUPABASE_URL").rstrip("/")
    service_role_key = _required_env("SUPABASE_SERVICE_ROLE_KEY")

    rows = _fetch_rows(supabase_url=supabase_url, api_key=service_role_key, run_date=run_date)
    targets = [row for row in rows if _is_blocked_row(row)]

    row_ids = [int(row["id"]) for row in targets if str(row.get("id", "")).isdigit()]
    image_paths = [str(row.get("image_path", "")).strip() for row in targets if row.get("image_path")]

    print(
        json.dumps(
            {
                "run_date": run_date,
                "total_rows": len(rows),
                "target_rows": len(targets),
                "dry_run": bool(args.dry_run),
                "targets": [
                    {
                        "id": row.get("id"),
                        "snapshot_key": row.get("snapshot_key"),
                        "symbol": row.get("symbol"),
                        "section": row.get("section"),
                    }
                    for row in targets
                ],
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    if args.dry_run or not targets:
        return 0

    deleted_rows = _delete_snapshot_rows(
        supabase_url=supabase_url,
        api_key=service_role_key,
        row_ids=row_ids,
    )
    deleted_files = _delete_storage_paths(
        supabase_url=supabase_url,
        api_key=service_role_key,
        paths=image_paths,
    )

    print(
        json.dumps(
            {
                "run_date": run_date,
                "deleted_rows": deleted_rows,
                "deleted_files": deleted_files,
            },
            ensure_ascii=False,
            indent=2,
        )
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
