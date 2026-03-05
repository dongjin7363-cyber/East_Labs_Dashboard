#!/usr/bin/env python3
"""Build US sector ETF trend watchlist JSON from raw txt source.

Parses section headers and tuple rows from `finviz_us_watchlist.txt` and writes
normalized watchlist JSON used by the downloader.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

MARKET_REGION = "us"
PAGE_SLUG = "sector-etf-trend"
DEFAULT_INPUT = Path(__file__).with_name("source") / "finviz_us_watchlist.txt"
DEFAULT_OUTPUT = Path(__file__).with_name("watchlist_us_sector_etf_trend.json")
DEFAULT_SECTION = "Uncategorized"

ITEM_RE = re.compile(r'\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)\s*,?')
SECTION_DASH_RE = re.compile(r"^-{2,}\s*(.+?)\s*(?:-{2,})?\s*$")
SEPARATOR_RE = re.compile(r"^[=\-\s]+$")


@dataclass
class ParsedItem:
    snapshot_key: str
    symbol: str
    title: str
    section: str
    source_url: str
    category: str
    sort_order: int


def _clean_section_label(raw: str) -> str | None:
    comment = raw.strip()

    if not comment:
        return None

    # "--- 미국 섹터 ---" style
    dash = SECTION_DASH_RE.match(comment)

    if dash:
        value = dash.group(1).strip()
        return value or None

    # "=====================" divider style should be ignored
    if SEPARATOR_RE.match(comment):
        return None

    # Keep literal section title comments like "바이오 / 제약"
    normalized = comment.strip("# ").strip()

    if not normalized:
        return None

    return normalized


def _extract_symbol(source_url: str) -> str:
    parsed = urlparse(source_url)
    ticker = parse_qs(parsed.query).get("t", [""])[0].strip().upper()

    if not ticker:
        raise RuntimeError(f"Cannot parse ticker from URL: {source_url}")

    return ticker


def _infer_subcategory(section: str, title: str) -> str:
    base = f"{section} {title}".lower()

    if any(token in base for token in ["광범위", "자산배분", "s&p", "나스닥", "전세계"]):
        return "Index"

    if any(token in base for token in ["etf", "섹터", "스타일", "테마", "이머징", "채권", "자산배분"]):
        return "Sector"

    return "Stock"


def _make_snapshot_key(symbol: str, seen: dict[str, int]) -> str:
    base = symbol.lower()
    count = seen.get(base, 0) + 1
    seen[base] = count

    if count == 1:
        return base

    # Preserve full list even when ticker appears multiple times across sections.
    return f"{base}-{count}"


def build_watchlist(*, source_path: Path, output_path: Path, run_date: str = "") -> list[dict[str, object]]:
    if not source_path.exists():
        raise RuntimeError(f"Source txt not found: {source_path}")

    lines = source_path.read_text(encoding="utf-8").splitlines()

    in_items = False
    section = DEFAULT_SECTION
    sort_order = 10
    seen_keys: dict[str, int] = {}
    parsed_items: list[ParsedItem] = []

    for raw_line in lines:
        line = raw_line.strip()

        if not in_items:
            if "items" in line and "[" in line and "=" in line:
                in_items = True
            continue

        if line == "]":
            break

        if line.startswith("#"):
            next_section = _clean_section_label(line[1:])

            if next_section:
                section = next_section
            continue

        match = ITEM_RE.search(line)

        if not match:
            continue

        source_url = match.group(1).strip()
        title = match.group(2).strip()

        if not source_url or not title:
            continue

        symbol = _extract_symbol(source_url)
        snapshot_key = _make_snapshot_key(symbol, seen_keys)
        category = _infer_subcategory(section, title)

        parsed_items.append(
            ParsedItem(
                snapshot_key=snapshot_key,
                symbol=symbol,
                title=title,
                section=section,
                source_url=source_url,
                category=category,
                sort_order=sort_order,
            )
        )
        sort_order += 10

    if not parsed_items:
        raise RuntimeError("No tuple items found in source txt")

    rows: list[dict[str, object]] = []

    for item in parsed_items:
        rows.append(
            {
                "market_region": MARKET_REGION,
                "page_slug": PAGE_SLUG,
                "run_date": run_date,
                "snapshot_key": item.snapshot_key,
                "symbol": item.symbol,
                "title": item.title,
                "section": item.section,
                "source_url": item.source_url,
                "category": item.category,
                "sort_order": item.sort_order,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    return rows


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build watchlist JSON from txt")
    parser.add_argument("--input", default=str(DEFAULT_INPUT), help="Source txt path")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT), help="Output JSON path")
    parser.add_argument(
        "--run-date",
        default="",
        help="Optional run date string written to JSON items",
    )
    return parser


def _main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    rows = build_watchlist(
        source_path=Path(args.input),
        output_path=Path(args.output),
        run_date=args.run_date,
    )

    print(
        f"Built watchlist: {len(rows)} items | "
        f"input={Path(args.input)} | output={Path(args.output)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
