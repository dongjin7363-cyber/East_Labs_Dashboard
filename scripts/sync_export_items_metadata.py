import argparse
import csv
import os
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "data" / "export_items.csv"
SHEET_NAME = "수출항목 분류"
CSV_FIELDS = [
    "sector",
    "sheet_name",
    "name",
    "importance",
    "description",
    "related_stocks",
    "note",
]


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
        "Prefer": "resolution=merge-duplicates,return=representation",
    }


def clean_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def normalize_sheet_name(value: Any) -> str:
    return clean_text(value)


def load_metadata(file_path: Path) -> dict[str, dict[str, str]]:
    df = pd.read_excel(file_path, sheet_name=SHEET_NAME)
    required = {"시트명", "항목 설명", "관련 종목", "비고"}
    missing = required - set(df.columns)
    if missing:
        raise RuntimeError(f"Missing columns in {SHEET_NAME}: {', '.join(sorted(missing))}")

    metadata: dict[str, dict[str, str]] = {}
    for _, row in df.iterrows():
        sheet_name = normalize_sheet_name(row.get("시트명"))
        if not sheet_name:
            continue
        metadata[sheet_name] = {
            "description": clean_text(row.get("항목 설명")),
            "related_stocks": clean_text(row.get("관련 종목")),
            "note": clean_text(row.get("비고")),
        }
    return metadata


def load_csv_items() -> list[dict[str, str]]:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    normalized_rows: list[dict[str, str]] = []
    for row in rows:
        normalized_rows.append({field: clean_text(row.get(field)) for field in CSV_FIELDS})
    return normalized_rows


def write_csv_items(rows: list[dict[str, str]]) -> None:
    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in CSV_FIELDS})


def fetch_db_items(supabase_url: str, headers: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(
        f"{supabase_url}/rest/v1/export_items?select=id,sector,sheet_name,name,importance",
        headers=headers,
        timeout=30,
    )
    if response.status_code == 400 and "name" in response.text:
        response = requests.get(
            f"{supabase_url}/rest/v1/export_items?select=id,sector,sheet_name,item_name,importance",
            headers=headers,
            timeout=30,
        )
    response.raise_for_status()
    return response.json()


def upsert_db_items(
    supabase_url: str,
    headers: dict[str, str],
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0

    response = requests.post(
        f"{supabase_url}/rest/v1/export_items?on_conflict=sheet_name",
        headers=headers,
        json=rows,
        timeout=60,
    )
    if response.status_code == 400 and (
        "description" in response.text
        or "related_stocks" in response.text
        or "note" in response.text
    ):
        raise RuntimeError(
            "Supabase export_items metadata columns are missing. "
            "Run supabase/sql/export_schema.sql first, then rerun this command. "
            f"Response: {response.text}"
        )
    response.raise_for_status()
    return len(response.json()) if response.text else len(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync export item metadata from classification workbook.")
    parser.add_argument(
        "--file",
        required=True,
        help="Path to 수출항목_분류_중요도.xlsx.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    file_path = Path(args.file).expanduser()
    if not file_path.is_absolute():
        file_path = PROJECT_ROOT / file_path
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f"Metadata workbook does not exist: {file_path}")

    metadata = load_metadata(file_path)
    csv_rows = load_csv_items()
    csv_sheet_names = {row["sheet_name"] for row in csv_rows if row.get("sheet_name")}
    metadata_sheet_names = set(metadata)

    csv_matched = sorted(csv_sheet_names & metadata_sheet_names)
    unmatched_metadata_sheet_names = sorted(metadata_sheet_names - csv_sheet_names)
    unmatched_csv_sheet_names = sorted(csv_sheet_names - metadata_sheet_names)

    for row in csv_rows:
        sheet_name = row.get("sheet_name", "")
        if sheet_name in metadata:
            row.update(metadata[sheet_name])
    write_csv_items(csv_rows)
    print("CSV metadata updated")
    print(f"  loaded metadata rows count: {len(metadata)}")
    print(f"  csv matched export_items count: {len(csv_matched)}")

    load_env()
    supabase_url = resolve_supabase_url()
    service_role_key = require_env("SUPABASE_SERVICE_ROLE_KEY")
    headers = build_headers(service_role_key)

    db_items = fetch_db_items(supabase_url, headers)
    db_by_sheet = {
        normalize_sheet_name(item.get("sheet_name")): item
        for item in db_items
        if normalize_sheet_name(item.get("sheet_name"))
    }
    db_sheet_names = set(db_by_sheet)
    db_matched = sorted(db_sheet_names & metadata_sheet_names)
    unmatched_db_sheet_names = sorted(db_sheet_names - metadata_sheet_names)

    payload = []
    for sheet_name in db_matched:
        item = db_by_sheet[sheet_name]
        item_metadata = metadata[sheet_name]
        payload.append(
            {
                "id": item.get("id"),
                "sector": item.get("sector"),
                "sheet_name": item.get("sheet_name"),
                "importance": item.get("importance"),
                "description": item_metadata["description"],
                "related_stocks": item_metadata["related_stocks"],
                "note": item_metadata["note"],
            }
        )
        if "name" in item:
            payload[-1]["name"] = item.get("name")
        if "item_name" in item:
            payload[-1]["item_name"] = item.get("item_name")

    print("DB metadata match preview")
    print(f"  matched export_items count: {len(db_matched)}")
    print(f"  unmatched metadata sheet names count: {len(metadata_sheet_names - db_sheet_names)}")
    print(f"  unmatched DB sheet names count: {len(unmatched_db_sheet_names)}")

    updated_rows_count = upsert_db_items(supabase_url, headers, payload)

    print("Summary")
    print(f"  loaded metadata rows count: {len(metadata)}")
    print(f"  matched export_items count: {len(db_matched)}")
    print(f"  csv matched export_items count: {len(csv_matched)}")
    print(f"  updated rows count: {updated_rows_count}")

    print("\nUnmatched metadata sheet names:")
    if unmatched_metadata_sheet_names:
        for sheet_name in unmatched_metadata_sheet_names:
            print(f"  - {sheet_name}")
    else:
        print("  - none")

    print("\nUnmatched DB sheet names:")
    if unmatched_db_sheet_names:
        for sheet_name in unmatched_db_sheet_names:
            print(f"  - {sheet_name}")
    else:
        print("  - none")

    print("\nUnmatched CSV sheet names:")
    if unmatched_csv_sheet_names:
        for sheet_name in unmatched_csv_sheet_names:
            print(f"  - {sheet_name}")
    else:
        print("  - none")


if __name__ == "__main__":
    main()
