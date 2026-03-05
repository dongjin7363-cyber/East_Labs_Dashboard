#!/usr/bin/env python3
"""Upload market snapshot images and metadata to Supabase.

Environment variables:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
"""

from __future__ import annotations

import json
import mimetypes
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

import requests

DEFAULT_BUCKET = "market-images"


@dataclass
class SnapshotPublishItem:
    snapshot_key: str
    title: str
    symbol: str
    source_url: str
    category: str
    sort_order: int
    local_path: str
    image_path: str | None = None
    image_url: str | None = None
    error: str | None = None


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


def _postgrest_upsert(
    supabase_url: str,
    api_key: str,
    table: str,
    rows: list[dict[str, Any]],
    on_conflict: str,
) -> list[dict[str, Any]]:
    url = f"{supabase_url}/rest/v1/{table}"
    params = {"on_conflict": on_conflict}
    headers = {
        **_headers(api_key),
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    response = requests.post(
        url,
        params=params,
        headers=headers,
        data=json.dumps(rows),
        timeout=30,
    )

    if response.status_code >= 300:
        raise RuntimeError(
            f"PostgREST upsert failed [{table}] {response.status_code}: {response.text}"
        )

    if not response.text:
        return []

    parsed = response.json()
    return parsed if isinstance(parsed, list) else []


def _upload_storage_object(
    supabase_url: str,
    api_key: str,
    bucket: str,
    object_path: str,
    local_file: Path,
) -> str:
    encoded_path = quote(object_path, safe="/")
    url = f"{supabase_url}/storage/v1/object/{bucket}/{encoded_path}"

    content_type = mimetypes.guess_type(local_file.name)[0] or "application/octet-stream"
    headers = {
        **_headers(api_key),
        "Content-Type": content_type,
        "x-upsert": "true",
    }

    with local_file.open("rb") as fh:
        response = requests.post(url, headers=headers, data=fh.read(), timeout=60)

    if response.status_code >= 300:
        raise RuntimeError(
            f"Storage upload failed [{object_path}] {response.status_code}: {response.text}"
        )

    return f"{supabase_url}/storage/v1/object/public/{bucket}/{encoded_path}"


def publish_market_run(
    *,
    market_region: str,
    page_slug: str,
    run_date: str,
    snapshots: list[SnapshotPublishItem],
    success_count: int,
    fail_count: int,
    bucket: str = DEFAULT_BUCKET,
) -> dict[str, Any]:
    """Upload files and upsert market_runs / market_snapshots metadata."""

    supabase_url = _required_env("SUPABASE_URL").rstrip("/")
    service_role_key = _required_env("SUPABASE_SERVICE_ROLE_KEY")

    uploaded = 0

    for item in snapshots:
        if item.error:
            continue

        local_path = Path(item.local_path)

        if not local_path.exists():
            item.error = f"local file missing: {local_path}"
            continue

        object_path = f"{market_region}/{page_slug}/{run_date}/{item.snapshot_key}.png"

        try:
            public_url = _upload_storage_object(
                supabase_url=supabase_url,
                api_key=service_role_key,
                bucket=bucket,
                object_path=object_path,
                local_file=local_path,
            )
            item.image_path = object_path
            item.image_url = public_url
            uploaded += 1
        except Exception as exc:  # noqa: BLE001
            item.error = str(exc)

    final_success_count = sum(1 for item in snapshots if not item.error)
    final_fail_count = len(snapshots) - final_success_count

    run_status = "success"

    if final_success_count == 0:
        run_status = "failed"
    elif final_fail_count > 0:
        run_status = "partial"

    now_iso = _now_iso()

    _postgrest_upsert(
        supabase_url=supabase_url,
        api_key=service_role_key,
        table="market_runs",
        on_conflict="market_region,page_slug,run_date",
        rows=[
            {
                "market_region": market_region,
                "page_slug": page_slug,
                "run_date": run_date,
                "status": run_status,
                "success_count": final_success_count,
                "fail_count": final_fail_count,
                "updated_at": now_iso,
            }
        ],
    )

    snapshot_rows = []

    for item in snapshots:
        if item.error:
            continue

        snapshot_rows.append(
            {
                "market_region": market_region,
                "page_slug": page_slug,
                "run_date": run_date,
                "snapshot_key": item.snapshot_key,
                "title": item.title,
                "symbol": item.symbol,
                "source_url": item.source_url,
                "image_path": item.image_path,
                "image_url": item.image_url,
                "category": item.category,
                "sort_order": item.sort_order,
                "updated_at": now_iso,
            }
        )

    if snapshot_rows:
        _postgrest_upsert(
            supabase_url=supabase_url,
            api_key=service_role_key,
            table="market_snapshots",
            on_conflict="market_region,page_slug,run_date,snapshot_key",
            rows=snapshot_rows,
        )

    failed_items = [
        {
            "snapshot_key": item.snapshot_key,
            "title": item.title,
            "error": item.error,
        }
        for item in snapshots
        if item.error
    ]

    return {
        "market_region": market_region,
        "page_slug": page_slug,
        "run_date": run_date,
        "status": run_status,
        "download_success_count": success_count,
        "download_fail_count": fail_count,
        "success_count": final_success_count,
        "fail_count": final_fail_count,
        "uploaded_count": uploaded,
        "failed_items": failed_items,
    }


def _now_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _main() -> int:
    print(
        "This module is intended to be imported by market job scripts. "
        "Use us_sector_etf_trend.py instead."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
