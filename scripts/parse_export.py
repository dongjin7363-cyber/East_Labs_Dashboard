import argparse
import os
import re
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def load_env() -> None:
    load_dotenv(PROJECT_ROOT / ".env.local")
    load_dotenv(PROJECT_ROOT / ".env")


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def resolve_supabase_url() -> str:
    return os.environ.get("SUPABASE_URL") or require_env("NEXT_PUBLIC_SUPABASE_URL")


def build_headers(service_role_key: str) -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }


def normalize_sheet_name(value: str) -> str:
    return value.strip()


def get_items(supabase_url: str, headers: dict[str, str]) -> list[dict[str, str]]:
    response = requests.get(
        f"{supabase_url}/rest/v1/export_items?select=id,sheet_name,is_active&is_active=eq.true",
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()

    items = []
    for item in response.json():
        sheet_name = str(item.get("sheet_name") or "")
        item_id = item.get("id")
        if sheet_name and item_id is not None:
            items.append({"id": str(item_id), "sheet_name": sheet_name})

    return items


def get_inactive_sheet_names(supabase_url: str, headers: dict[str, str]) -> list[str]:
    response = requests.get(
        f"{supabase_url}/rest/v1/export_items?select=sheet_name&is_active=eq.false",
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()

    return [
        str(item.get("sheet_name") or "")
        for item in response.json()
        if str(item.get("sheet_name") or "")
    ]


def warn_duplicate_normalized_sheet_names(
    active_items: list[dict[str, str]],
    inactive_sheet_names: list[str],
) -> None:
    by_normalized: dict[str, list[str]] = {}

    for item in active_items:
        sheet_name = item["sheet_name"]
        normalized = normalize_sheet_name(sheet_name)
        if normalized:
            by_normalized.setdefault(normalized, []).append(
                f"active id={item['id']} sheet_name={sheet_name!r}"
            )

    for sheet_name in inactive_sheet_names:
        normalized = normalize_sheet_name(sheet_name)
        if normalized:
            by_normalized.setdefault(normalized, []).append(
                f"inactive sheet_name={sheet_name!r}"
            )

    duplicates = {
        normalized: entries
        for normalized, entries in by_normalized.items()
        if len(entries) > 1
    }

    if duplicates:
        print("\n[WARN] duplicate normalized sheet names:")
        for normalized, entries in sorted(duplicates.items()):
            print(f"  - {normalized!r}: {', '.join(entries)}")


def match_active_sheets(
    xl: pd.ExcelFile,
    active_items: list[dict[str, str]],
) -> tuple[list[tuple[str, str, str]], list[str]]:
    excel_sheet_names = list(xl.sheet_names)
    excel_sheet_name_set = set(excel_sheet_names)
    excel_by_normalized: dict[str, list[str]] = {}

    for sheet_name in excel_sheet_names:
        normalized = normalize_sheet_name(sheet_name)
        if normalized:
            excel_by_normalized.setdefault(normalized, []).append(sheet_name)

    matched: list[tuple[str, str, str]] = []
    skipped: list[str] = []
    used_excel_sheet_names: set[str] = set()

    for item in active_items:
        item_id = item["id"]
        item_sheet_name = item["sheet_name"]

        if item_sheet_name in excel_sheet_name_set:
            excel_sheet_name = item_sheet_name
            match_type = "exact"
        else:
            normalized = normalize_sheet_name(item_sheet_name)
            fallback_candidates = excel_by_normalized.get(normalized, [])
            if len(fallback_candidates) == 1:
                excel_sheet_name = fallback_candidates[0]
                match_type = "normalized"
            elif len(fallback_candidates) > 1:
                print(
                    f"  [SKIP] {item_sheet_name!r}: "
                    f"multiple normalized Excel matches {fallback_candidates}"
                )
                skipped.append(item_sheet_name)
                continue
            else:
                skipped.append(item_sheet_name)
                continue

        if excel_sheet_name in used_excel_sheet_names:
            print(
                f"  [SKIP] {item_sheet_name!r}: "
                f"Excel sheet {excel_sheet_name!r} already matched"
            )
            skipped.append(item_sheet_name)
            continue

        used_excel_sheet_names.add(excel_sheet_name)
        matched.append((excel_sheet_name, item_id, match_type))

        if normalize_sheet_name(item_sheet_name) == "타이어":
            print(
                f"  [DEBUG] tire sheet match: "
                f"item_id={item_id}, export_item_sheet_name={item_sheet_name!r}, "
                f"excel_sheet_name={excel_sheet_name!r}, match={match_type}"
            )

    return matched, skipped


def parse_ym(value) -> str | None:
    value = str(value).strip()
    match = re.match(r"(\d{4})년(\d{2})월", value)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return None


def to_pct(value) -> float | None:
    if value is None:
        return None
    try:
        parsed = float(value)
        if abs(parsed) < 10:
            return round(parsed * 100, 2)
        return round(parsed, 2)
    except (TypeError, ValueError):
        return None


def safe(df: pd.DataFrame, row_index: int, col_index: int) -> float | None:
    try:
        value = df.iloc[row_index, col_index]
        return float(value) if pd.notna(value) else None
    except (IndexError, TypeError, ValueError):
        return None


def detect_type(df: pd.DataFrame) -> tuple[str | None, int | None]:
    for row_index in range(3, 8):
        if parse_ym(df.iloc[row_index, 0]):
            return "A", row_index

    for row_index in range(2, 8):
        if parse_ym(df.iloc[row_index, 7]):
            return "B", row_index

    return None, None


def parse_sheet(xl: pd.ExcelFile, sheet_name: str) -> list[dict[str, float | str | None]]:
    try:
        df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
    except Exception as exc:
        print(f"  [SKIP] {sheet_name}: {exc}")
        return []

    sheet_type, start_row = detect_type(df)
    if not sheet_type or start_row is None:
        print(f"  [SKIP] {sheet_name}: structure not recognized")
        return []

    rows = []
    for row_index in range(start_row, len(df)):
        if sheet_type == "A":
            ym = parse_ym(df.iloc[row_index, 0])
            if not ym:
                continue
            rows.append(
                {
                    "ym": ym,
                    "avg_export": safe(df, row_index, 5),
                    "mom": to_pct(safe(df, row_index, 6)),
                    "yoy": to_pct(safe(df, row_index, 7)),
                    "price_yoy": to_pct(safe(df, row_index, 9)),
                    "qoq": to_pct(safe(df, row_index, 3)),
                }
            )
        else:
            ym = parse_ym(df.iloc[row_index, 7])
            if not ym:
                continue
            rows.append(
                {
                    "ym": ym,
                    "avg_export": safe(df, row_index, 4),
                    "mom": to_pct(safe(df, row_index, 5)),
                    "yoy": to_pct(safe(df, row_index, 6)),
                    "price_yoy": None,
                    "qoq": to_pct(safe(df, row_index, 2)),
                }
            )

    return rows


def upsert(
    supabase_url: str,
    headers: dict[str, str],
    item_id: str,
    sheet_name: str,
    rows: list[dict[str, float | str | None]],
    as_of_date: str,
    is_partial: bool,
) -> tuple[int, int]:
    if not rows:
        return 0, 0

    payload_before_count = len(rows)
    deduped_by_key: dict[tuple[str, str | None], dict[str, float | str | None]] = {}

    for row in rows:
        deduped_by_key[(item_id, row.get("ym"))] = row

    deduped_rows = list(deduped_by_key.values())
    payload_after_count = len(deduped_rows)
    duplicate_count = payload_before_count - payload_after_count

    print(
        f"  [DEDUP] {sheet_name}: "
        f"{payload_before_count} rows -> {payload_after_count} rows"
    )
    if duplicate_count > 0:
        print(f"  [DEDUP] {sheet_name}: removed {duplicate_count} duplicate item_id+ym rows")

    payload = [
        {
            "item_id": item_id,
            **row,
            "as_of_date": as_of_date,
            "is_partial": is_partial,
        }
        for row in deduped_rows
    ]
    response = requests.post(
        f"{supabase_url}/rest/v1/export_data?on_conflict=item_id,ym",
        headers=headers,
        json=payload,
        timeout=60,
    )

    if 200 <= response.status_code < 300:
        return len(deduped_rows), 0

    print(f"  [FAIL] item_id={item_id}: {response.status_code} {response.text}")
    return 0, len(deduped_rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Parse monthly export Excel data.")
    parser.add_argument(
        "--file",
        required=True,
        help="Path to the xlsx file received on the monthly export data schedule.",
    )
    parser.add_argument(
        "--as-of-date",
        default=None,
        help="Data received date in YYYY-MM-DD format. Defaults to today.",
    )
    return parser.parse_args()


def resolve_as_of_date(value: str | None) -> tuple[str, bool]:
    if value:
        parsed = datetime.strptime(value, "%Y-%m-%d").date()
    else:
        parsed = date.today()

    is_partial = parsed.day in {11, 21}
    return parsed.isoformat(), is_partial


def main() -> None:
    args = parse_args()
    file_path = Path(args.file).expanduser()
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f"Excel file does not exist: {file_path}")
    as_of_date, is_partial = resolve_as_of_date(args.as_of_date)

    load_env()
    supabase_url = resolve_supabase_url()
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = build_headers(service_role_key)

    print(f"Loading Excel file: {file_path}")
    print(f"Using as_of_date={as_of_date}, is_partial={is_partial}")
    xl = pd.ExcelFile(file_path)
    active_items = get_items(supabase_url, headers)
    inactive_sheet_names = get_inactive_sheet_names(supabase_url, headers)
    warn_duplicate_normalized_sheet_names(active_items, inactive_sheet_names)
    matched_sheets, skipped_whitelist_items = match_active_sheets(xl, active_items)
    matched_excel_sheet_names = {sheet_name for sheet_name, _, _ in matched_sheets}
    non_whitelisted_sheets = sorted(set(xl.sheet_names) - matched_excel_sheet_names)
    skipped_inactive_sheets = sorted(
        {
            sheet_name
            for sheet_name in inactive_sheet_names
            if sheet_name in xl.sheet_names
            and sheet_name not in matched_excel_sheet_names
        }
    )

    inserted_or_updated_rows = 0
    failed_rows = 0

    for sheet_name, item_id, _match_type in matched_sheets:
        rows = parse_sheet(xl, sheet_name)
        if not rows:
            continue

        ok_count, fail_count = upsert(
            supabase_url,
            headers,
            item_id,
            sheet_name,
            rows,
            as_of_date,
            is_partial,
        )
        inserted_or_updated_rows += ok_count
        failed_rows += fail_count
        status = "OK" if fail_count == 0 else "FAIL"
        print(f"  [{status}] {sheet_name}: {ok_count} rows")

    print("\nSummary")
    print(f"  active export_items count: {len(active_items)}")
    print(f"  matched active sheets count: {len(matched_sheets)}")
    print(f"  skipped inactive sheets count: {len(skipped_inactive_sheets)}")
    print(f"  skipped whitelist items count: {len(skipped_whitelist_items)}")
    print(f"  inserted/updated rows count: {inserted_or_updated_rows}")
    print(f"  failed rows count: {failed_rows}")

    if skipped_whitelist_items:
        print("\nWhitelist items not found in Excel:")
        for sheet_name in skipped_whitelist_items:
            print(f"  - {sheet_name}")

    if non_whitelisted_sheets:
        print("\nExcel sheets not in whitelist:")
        for sheet_name in non_whitelisted_sheets:
            print(f"  - {sheet_name}")


if __name__ == "__main__":
    main()
