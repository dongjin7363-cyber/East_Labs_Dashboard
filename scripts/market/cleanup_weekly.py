#!/usr/bin/env python3
"""Weekly cleanup for US / sector-etf-trend snapshots and related assets.

Deletes last week's Monday~Friday data (KST):
- public.market_snapshots
- public.market_runs
- storage bucket: market-images (us/sector-etf-trend/{date}/...)

Environment variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

import requests
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
MARKET_REGION = "us"
PAGE_SLUG = "sector-etf-trend"
BUCKET = "market-images"


@dataclass
class CleanupDayResult:
    run_date: str
    deleted_snapshots: int
    deleted_runs: int
    deleted_storage_files: int


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


def _kst_today() -> date:
    return datetime.now(KST).date()


def _date_range(start: date, end: date) -> list[date]:
    cursor = start
    dates: list[date] = []

    while cursor <= end:
        dates.append(cursor)
        cursor += timedelta(days=1)

    return dates


def _delete_rows(
    *,
    supabase_url: str,
    api_key: str,
    table: str,
    run_date: str,
) -> int:
    url = f"{supabase_url}/rest/v1/{table}"
    params = {
        "market_region": f"eq.{MARKET_REGION}",
        "page_slug": f"eq.{PAGE_SLUG}",
        "run_date": f"eq.{run_date}",
    }
    headers = {
        **_headers(api_key),
        "Prefer": "return=representation",
    }

    response = requests.delete(url, params=params, headers=headers, timeout=30)

    if response.status_code >= 300:
        raise RuntimeError(
            f"Delete failed [{table}/{run_date}] {response.status_code}: {response.text}"
        )

    body = response.text.strip()

    if not body:
        return 0

    parsed = response.json()

    if isinstance(parsed, list):
        return len(parsed)

    return 0


def _list_storage_paths_for_prefix(
    *,
    supabase_url: str,
    api_key: str,
    bucket: str,
    prefix: str,
) -> list[str]:
    url = f"{supabase_url}/storage/v1/object/list/{bucket}"
    headers = {
        **_headers(api_key),
        "Content-Type": "application/json",
    }

    all_paths: list[str] = []
    offset = 0
    limit = 1000

    while True:
        payload = {
            "prefix": prefix,
            "limit": limit,
            "offset": offset,
            "sortBy": {"column": "name", "order": "asc"},
        }

        response = requests.post(url, headers=headers, json=payload, timeout=30)

        if response.status_code >= 300:
            raise RuntimeError(
                f"Storage list failed [{prefix}] {response.status_code}: {response.text}"
            )

        rows = response.json()

        if not isinstance(rows, list) or len(rows) == 0:
            break

        for row in rows:
            name = row.get("name") if isinstance(row, dict) else None

            if not isinstance(name, str) or not name:
                continue

            if name.startswith(prefix):
                all_paths.append(name)
            else:
                all_paths.append(f"{prefix}{name}")

        if len(rows) < limit:
            break

        offset += limit

    # de-duplicate while preserving order
    unique: list[str] = []
    seen = set()

    for path in all_paths:
        if path in seen:
            continue

        seen.add(path)
        unique.append(path)

    return unique


def _delete_storage_paths(
    *,
    supabase_url: str,
    api_key: str,
    bucket: str,
    paths: list[str],
) -> int:
    if not paths:
        return 0

    url = f"{supabase_url}/storage/v1/object/{bucket}"
    headers = {
        **_headers(api_key),
        "Content-Type": "application/json",
    }

    deleted = 0
    chunk_size = 100

    for start in range(0, len(paths), chunk_size):
        chunk = paths[start : start + chunk_size]
        response = requests.delete(url, headers=headers, data=json.dumps(chunk), timeout=30)

        if response.status_code >= 300:
            raise RuntimeError(
                f"Storage delete failed [{bucket}] {response.status_code}: {response.text}"
            )

        deleted += len(chunk)

    return deleted


def cleanup_weekly() -> dict[str, Any]:
    today = _kst_today()
    current_week_monday = today - timedelta(days=today.weekday())
    prev_monday = current_week_monday - timedelta(days=7)
    prev_friday = current_week_monday - timedelta(days=3)

    print(f"[cleanup] today_kst={today.isoformat()}")
    print(f"[cleanup] weekday_kst={today.weekday()} (Monday=0)")
    print(f"[cleanup] delete_from={prev_monday.isoformat()}")
    print(f"[cleanup] delete_to={prev_friday.isoformat()}")

    supabase_url = _required_env("SUPABASE_URL").rstrip("/")
    service_role_key = _required_env("SUPABASE_SERVICE_ROLE_KEY")

    results: list[CleanupDayResult] = []

    for day in _date_range(prev_monday, prev_friday):
        run_date = day.isoformat()

        deleted_snapshots = _delete_rows(
            supabase_url=supabase_url,
            api_key=service_role_key,
            table="market_snapshots",
            run_date=run_date,
        )

        deleted_runs = _delete_rows(
            supabase_url=supabase_url,
            api_key=service_role_key,
            table="market_runs",
            run_date=run_date,
        )

        prefix = f"{MARKET_REGION}/{PAGE_SLUG}/{run_date}/"
        paths = _list_storage_paths_for_prefix(
            supabase_url=supabase_url,
            api_key=service_role_key,
            bucket=BUCKET,
            prefix=prefix,
        )
        deleted_storage_files = _delete_storage_paths(
            supabase_url=supabase_url,
            api_key=service_role_key,
            bucket=BUCKET,
            paths=paths,
        )

        results.append(
            CleanupDayResult(
                run_date=run_date,
                deleted_snapshots=deleted_snapshots,
                deleted_runs=deleted_runs,
                deleted_storage_files=deleted_storage_files,
            )
        )

        print(
            "[cleanup] "
            f"run_date={run_date} "
            f"deleted_market_snapshots={deleted_snapshots} "
            f"deleted_market_runs={deleted_runs} "
            f"deleted_storage_files={deleted_storage_files}"
        )

    total_deleted_snapshots = sum(result.deleted_snapshots for result in results)
    total_deleted_runs = sum(result.deleted_runs for result in results)
    total_deleted_storage_files = sum(result.deleted_storage_files for result in results)

    summary = {
        "today_kst": today.isoformat(),
        "weekday_kst": today.weekday(),  # Monday=0 ... Sunday=6
        "target": {
            "market_region": MARKET_REGION,
            "page_slug": PAGE_SLUG,
            "bucket": BUCKET,
            "from": prev_monday.isoformat(),
            "to": prev_friday.isoformat(),
        },
        "days": [
            {
                "run_date": result.run_date,
                "deleted_snapshots": result.deleted_snapshots,
                "deleted_runs": result.deleted_runs,
                "deleted_storage_files": result.deleted_storage_files,
            }
            for result in results
        ],
        "totals": {
            "deleted_snapshots": total_deleted_snapshots,
            "deleted_runs": total_deleted_runs,
            "deleted_storage_files": total_deleted_storage_files,
        },
    }

    return summary


def main() -> int:
    summary = cleanup_weekly()
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
