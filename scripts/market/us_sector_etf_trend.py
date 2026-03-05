#!/usr/bin/env python3
"""Download US sector ETF trend chart snapshots and publish to Supabase.

Usage:
  python scripts/market/us_sector_etf_trend.py
  python scripts/market/us_sector_etf_trend.py --skip-publish
  python scripts/market/us_sector_etf_trend.py --run-date 2026-03-05
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from zoneinfo import ZoneInfo

from publish_supabase import SnapshotPublishItem, publish_market_run

MARKET_REGION = "us"
PAGE_SLUG = "sector-etf-trend"
KST = ZoneInfo("Asia/Seoul")
DEFAULT_TIMEOUT = 30
DEFAULT_WATCHLIST_FILE = Path(__file__).with_name("watchlist_us_sector_etf_trend.json")


@dataclass
class WatchlistItem:
    snapshot_key: str
    title: str
    symbol: str
    source_url: str
    category: str
    sort_order: int


def kst_today_ymd() -> str:
    from datetime import datetime

    return datetime.now(KST).date().isoformat()


def load_watchlist(path: Path) -> list[WatchlistItem]:
    raw = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(raw, list):
        raise RuntimeError(f"Watchlist must be a JSON array: {path}")

    items: list[WatchlistItem] = []

    for idx, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise RuntimeError(f"Invalid watchlist row #{idx}: not an object")

        snapshot_key = str(item.get("snapshot_key", "")).strip()
        symbol = str(item.get("symbol", "")).strip().upper()
        source_url = str(item.get("source_url", "")).strip()

        if not snapshot_key or not symbol or not source_url:
            raise RuntimeError(f"Invalid watchlist row #{idx}: missing key/symbol/source_url")

        items.append(
            WatchlistItem(
                snapshot_key=snapshot_key,
                title=str(item.get("title", symbol)).strip() or symbol,
                symbol=symbol,
                source_url=source_url,
                category=str(item.get("category", "Other")).strip() or "Other",
                sort_order=int(item.get("sort_order", idx * 10)),
            )
        )

    return items


def _request_headers() -> dict[str, str]:
    return {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/123.0.0.0 Safari/537.36"
        ),
        "Referer": "https://finviz.com/",
    }


def _extract_chart_image_url(html: str, base_url: str, symbol: str) -> str | None:
    patterns: list[str] = []

    if symbol:
        patterns.append(
            rf'src=["\']([^"\']*chart\.ashx[^"\']*t={re.escape(symbol)}[^"\']*)["\']'
        )

    patterns.append(r'src=["\']([^"\']*chart\.ashx[^"\']*)["\']')

    for pattern in patterns:
        matched = re.search(pattern, html, flags=re.IGNORECASE)

        if matched:
            return urljoin(base_url, matched.group(1))

    return None


def _download_as_image(url: str, timeout: int, symbol: str) -> bytes:
    response = requests.get(url, headers=_request_headers(), timeout=timeout)
    response.raise_for_status()

    content_type = (response.headers.get("content-type") or "").lower()

    if content_type.startswith("image/"):
        return response.content

    html = response.text
    chart_url = _extract_chart_image_url(html, response.url, symbol=symbol)

    if not chart_url:
        raise RuntimeError(
            f"Image response expected but got content-type={content_type or 'unknown'}"
        )

    chart_response = requests.get(chart_url, headers=_request_headers(), timeout=timeout)
    chart_response.raise_for_status()

    chart_content_type = (chart_response.headers.get("content-type") or "").lower()

    if not chart_content_type.startswith("image/"):
        raise RuntimeError(
            f"Chart image fetch failed: content-type={chart_content_type or 'unknown'}"
        )

    return chart_response.content


def download_snapshot(item: WatchlistItem, out_dir: Path, timeout: int) -> tuple[bool, str | None, Path | None]:
    out_file = out_dir / f"{item.snapshot_key}.png"

    try:
        image_bytes = _download_as_image(item.source_url, timeout=timeout, symbol=item.symbol)
        out_file.write_bytes(image_bytes)
        return True, None, out_file
    except Exception as exc:  # noqa: BLE001
        return False, str(exc), None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="US Sector ETF Trend snapshot runner")
    parser.add_argument(
        "--watchlist",
        default=str(DEFAULT_WATCHLIST_FILE),
        help="Watchlist JSON path",
    )
    parser.add_argument(
        "--run-date",
        default="",
        help="Run date in YYYY-MM-DD (default: today in Asia/Seoul)",
    )
    parser.add_argument(
        "--out-root",
        default="out",
        help="Output root directory (default: out)",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT,
        help=f"HTTP timeout seconds (default: {DEFAULT_TIMEOUT})",
    )
    parser.add_argument(
        "--skip-publish",
        action="store_true",
        help="Skip Supabase publish step",
    )
    return parser


def _validate_run_date(run_date: str) -> str:
    if not run_date:
        return kst_today_ymd()

    if not re.match(r"^\d{4}-\d{2}-\d{2}$", run_date):
        raise RuntimeError("--run-date must be YYYY-MM-DD")

    return run_date


def run_job(
    *,
    watchlist_path: Path,
    run_date: str,
    out_root: Path,
    timeout: int,
    skip_publish: bool,
) -> dict[str, Any]:
    items = load_watchlist(watchlist_path)

    out_dir = out_root / MARKET_REGION / PAGE_SLUG / run_date
    out_dir.mkdir(parents=True, exist_ok=True)

    snapshots: list[SnapshotPublishItem] = []

    for item in items:
        ok, error, out_file = download_snapshot(item=item, out_dir=out_dir, timeout=timeout)

        snapshots.append(
            SnapshotPublishItem(
                snapshot_key=item.snapshot_key,
                title=item.title,
                symbol=item.symbol,
                source_url=item.source_url,
                category=item.category,
                sort_order=item.sort_order,
                local_path=str(out_file) if out_file else str(out_dir / f"{item.snapshot_key}.png"),
                error=None if ok else error,
            )
        )

    success_count = sum(1 for s in snapshots if not s.error)
    fail_count = len(snapshots) - success_count

    summary: dict[str, Any] = {
        "market_region": MARKET_REGION,
        "page_slug": PAGE_SLUG,
        "run_date": run_date,
        "out_dir": str(out_dir),
        "total": len(snapshots),
        "success_count": success_count,
        "fail_count": fail_count,
        "failed_items": [
            {
                "snapshot_key": s.snapshot_key,
                "title": s.title,
                "error": s.error,
            }
            for s in snapshots
            if s.error
        ],
    }

    if skip_publish:
        summary["publish"] = "skipped"
        return summary

    publish_summary = publish_market_run(
        market_region=MARKET_REGION,
        page_slug=PAGE_SLUG,
        run_date=run_date,
        snapshots=snapshots,
        success_count=success_count,
        fail_count=fail_count,
    )
    summary["publish"] = publish_summary
    return summary


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    run_date = _validate_run_date(args.run_date)

    summary = run_job(
        watchlist_path=Path(args.watchlist),
        run_date=run_date,
        out_root=Path(args.out_root),
        timeout=args.timeout,
        skip_publish=args.skip_publish,
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if summary.get("fail_count", 0) > 0:
        return 2

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
