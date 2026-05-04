import argparse
import csv
import os
import re
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FILE = Path('/Users/kevin/Desktop/태린아재 파일 + 코드/수출항목_분류_중요도.xlsx')
CSV_PATH = PROJECT_ROOT / 'data' / 'export_items.csv'
DEFAULT_SHEET_NAME = '수출항목 종목 페어'
CSV_FIELDS = [
    'sector',
    'sheet_name',
    'name',
    'importance',
    'description',
    'related_stocks',
    'note',
]
SHEET_NAME_CANDIDATES = ['시트명', '수출항목', '항목명', 'sheet_name']
RELATED_STOCKS_CANDIDATES = ['관련 종목', '관련종목', 'related_stocks']
SECTOR_CANDIDATES = ['섹터', 'sector']
IMPORTANCE_CANDIDATES = ['중요도', 'importance', '핵심 여부', '핵심\n여부']
DESCRIPTION_CANDIDATES = ['항목 설명', 'description']
NOTE_CANDIDATES = ['비고', 'note']
EXPORT_ITEMS_UPSERT_KEYS = [
    'sheet_name',
    'sector',
    'importance',
    'related_stocks',
    'is_active',
    'item_name',
    'description',
    'note',
]
SHEET_NAME_ALIASES = {
    'DRAM': '디램',
    'NAND': '낸드',
    'MLCC': 'mlcc',
    'PCB': 'pcb',
    'ESS (미국)': 'ess 미국',
    'EMC (HBM소재)': 'EMC(HBM소재) 일본',
    '반도체 장비수입': '반도체장비수입',
    '반도체 검사장비': '반도체검사장비',
    '전선 (미국)': '전선(미국)',
    '고용량변압기 (미국)': '고용량변압기+미국',
    'HVAC (미국)': 'HVAC 미국',
    '미용기기 (미국)': '미용기기(미국)',
    '보톡스 (미국)': '보톡스(미국)',
    '보톡스 (전체)': '보톡스 (합)',
    'OLED 유기재료': 'oled유기재료',
    'OLDE TV 패널(전체)': 'OLDE패널(TV)(합)',
    '양극재 (NCM+NCA)': '양극재(NCM+NCA)',
    '양극재 (NCM 전구체 수입량)': '양극재(NCM 전구체수입)',
    '전구체 수출량': '전구체 수출',
    '수산화리튬 (수입량)': '수산화리튬(수입)',
    '탄산리튬 (수입량)': '탄산리튬(수입)',
    '분리막': '분리막(1)',
    '자동차부품 (미국)': '자동차부품 미국',
    '자동차부품 (멕시코+미국)': '자동차부품 멕시코 + 미국',
    '굴삭기 (미국)': '굴삭기미국',
    '카메라 부분품': '카메라부문품',
    '전기회로+미국': '전기회로 + 미국',
    '타이어': '타이어 ',
}


def load_env() -> None:
    load_dotenv(PROJECT_ROOT / '.env.local')
    load_dotenv(PROJECT_ROOT / '.env')


def require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f'Missing required environment variable: {name}')
    return value


def resolve_supabase_url() -> str:
    return os.environ.get('SUPABASE_URL') or require_env('NEXT_PUBLIC_SUPABASE_URL')


def build_headers(service_role_key: str) -> dict[str, str]:
    return {
        'apikey': service_role_key,
        'Authorization': f'Bearer {service_role_key}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=representation',
    }


def clean_text(value: Any) -> str:
    if value is None or pd.isna(value):
        return ''
    text = str(value).strip()
    return '' if text.lower() == 'nan' else text


def nullable_text(value: Any) -> str | None:
    text = clean_text(value)
    return text or None


def normalize_sheet_name(value: Any) -> str:
    return clean_text(value)


def match_key(value: Any) -> str:
    text = clean_text(value).lower()
    return re.sub(r'[^0-9a-z가-힣]+', '', text)


def normalize_header(value: Any) -> str:
    return clean_text(value).replace('\r\n', '\n').replace('\r', '\n')


def find_column(columns: list[Any], candidates: list[str]) -> str | None:
    normalized_to_actual = {normalize_header(column): column for column in columns}
    compact_to_actual = {
        normalize_header(column).replace(' ', '').replace('\n', ''): column
        for column in columns
    }

    for candidate in candidates:
        normalized = normalize_header(candidate)
        if normalized in normalized_to_actual:
            return normalized_to_actual[normalized]
        compact = normalized.replace(' ', '').replace('\n', '')
        if compact in compact_to_actual:
            return compact_to_actual[compact]
    return None


def normalize_importance(value: Any) -> int:
    if value is None or pd.isna(value):
        return 0
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(0, min(5, int(value)))

    text = clean_text(value)
    if not text:
        return 0
    try:
        return max(0, min(5, int(float(text))))
    except ValueError:
        pass

    stars = text.count('★')
    return max(0, min(5, stars))


def load_pair_metadata(file_path: Path, sheet_name: str) -> tuple[dict[str, dict[str, Any]], int, int]:
    df = pd.read_excel(file_path, sheet_name=sheet_name)
    sheet_col = find_column(list(df.columns), SHEET_NAME_CANDIDATES)
    if sheet_col is None:
        raise RuntimeError(
            f'Missing sheet_name column in {sheet_name}. '
            f'Allowed names: {", ".join(SHEET_NAME_CANDIDATES)}'
        )

    related_col = find_column(list(df.columns), RELATED_STOCKS_CANDIDATES)
    sector_col = find_column(list(df.columns), SECTOR_CANDIDATES)
    importance_col = find_column(list(df.columns), IMPORTANCE_CANDIDATES)
    description_col = find_column(list(df.columns), DESCRIPTION_CANDIDATES)
    note_col = find_column(list(df.columns), NOTE_CANDIDATES)

    loaded_rows_count = len(df)
    valid_rows_count = 0
    metadata: dict[str, dict[str, Any]] = {}

    for _, row in df.iterrows():
        sheet = normalize_sheet_name(row.get(sheet_col))
        if not sheet:
            continue

        valid_rows_count += 1
        metadata[sheet] = {
            'sheet_name': sheet,
            'sector': nullable_text(row.get(sector_col)) if sector_col is not None else None,
            'importance': normalize_importance(row.get(importance_col)) if importance_col is not None else None,
            'description': nullable_text(row.get(description_col)) if description_col is not None else None,
            'related_stocks': nullable_text(row.get(related_col)) if related_col is not None else None,
            'note': nullable_text(row.get(note_col)) if note_col is not None else None,
        }

    return metadata, loaded_rows_count, valid_rows_count


def load_csv_items() -> list[dict[str, str]]:
    if not CSV_PATH.exists():
        return []
    with CSV_PATH.open(newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    normalized_rows: list[dict[str, str]] = []
    for row in rows:
        normalized_rows.append({field: clean_text(row.get(field)) for field in CSV_FIELDS})
    return normalized_rows


def write_csv_items(rows: list[dict[str, str]]) -> None:
    with CSV_PATH.open('w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, lineterminator='\n')
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, '') for field in CSV_FIELDS})


def sync_csv_metadata(metadata: dict[str, dict[str, Any]]) -> tuple[int, list[str]]:
    csv_rows = load_csv_items()
    csv_by_sheet = {row.get('sheet_name', ''): row for row in csv_rows if row.get('sheet_name')}
    matched: list[str] = []

    for sheet_name, item_metadata in metadata.items():
        row = csv_by_sheet.get(sheet_name)
        if row is None:
            row = {
                'sector': item_metadata.get('sector') or '',
                'sheet_name': sheet_name,
                'name': sheet_name,
                'importance': str(item_metadata.get('importance') or 0),
                'description': '',
                'related_stocks': '',
                'note': '',
            }
            csv_rows.append(row)
            csv_by_sheet[sheet_name] = row

        matched.append(sheet_name)
        if item_metadata.get('sector'):
            row['sector'] = item_metadata['sector']
        if item_metadata.get('importance') is not None:
            row['importance'] = str(item_metadata.get('importance') or 0)
        if item_metadata.get('description') is not None:
            row['description'] = item_metadata.get('description') or ''
        row['related_stocks'] = item_metadata.get('related_stocks') or ''
        if item_metadata.get('note') is not None:
            row['note'] = item_metadata.get('note') or ''

    write_csv_items(csv_rows)
    return len(matched), sorted(set(csv_by_sheet) - set(metadata))


def fetch_db_items(supabase_url: str, headers: dict[str, str]) -> list[dict[str, Any]]:
    response = requests.get(
        f'{supabase_url}/rest/v1/export_items?select=*',
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def fetch_export_data_counts(supabase_url: str, headers: dict[str, str]) -> dict[str, int]:
    counts: dict[str, int] = {}
    page_size = 1000
    offset = 0

    while True:
        response = requests.get(
            f'{supabase_url}/rest/v1/export_data?select=item_id',
            headers={**headers, 'Range': f'{offset}-{offset + page_size - 1}'},
            timeout=60,
        )
        response.raise_for_status()
        rows = response.json()
        for row in rows:
            item_id = clean_text(row.get('item_id'))
            if item_id:
                counts[item_id] = counts.get(item_id, 0) + 1
        if len(rows) < page_size:
            break
        offset += page_size

    return counts


def assert_is_active_column(supabase_url: str, headers: dict[str, str]) -> None:
    response = requests.get(
        f'{supabase_url}/rest/v1/export_items?select=id,is_active&limit=1',
        headers=headers,
        timeout=30,
    )
    if response.status_code == 400 and 'is_active' in response.text:
        raise RuntimeError(
            'Supabase export_items.is_active column is missing. '
            'Run supabase/sql/export_schema.sql in Supabase SQL Editor first, then rerun this command.'
        )
    response.raise_for_status()


def upsert_db_items(
    supabase_url: str,
    headers: dict[str, str],
    rows: list[dict[str, Any]],
) -> int:
    if not rows:
        return 0

    rows = normalize_upsert_rows(rows)
    print(f'  normalized payload keys: {", ".join(EXPORT_ITEMS_UPSERT_KEYS)}')
    print(f'  payload row count: {len(rows)}')

    request_url = f'{supabase_url}/rest/v1/export_items?on_conflict=sheet_name'
    response = requests.post(
        request_url,
        headers=headers,
        json=rows,
        timeout=60,
    )
    if response.status_code >= 400:
        print('[ERROR] export_items upsert failed')
        print(f'  status_code: {response.status_code}')
        print(f'  response_text: {response.text}')
        print(f'  request_url: {request_url}')
        print(f'  payload row count: {len(rows)}')
        print(f'  payload sample rows: {rows[:2]}')
    response.raise_for_status()
    return len(response.json()) if response.text else len(rows)


def normalize_upsert_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_rows: list[dict[str, Any]] = []
    expected_keys = set(EXPORT_ITEMS_UPSERT_KEYS)

    for row in rows:
        normalized = {key: row.get(key) for key in EXPORT_ITEMS_UPSERT_KEYS}
        normalized_rows.append(normalized)

    key_sets = {tuple(sorted(row.keys())) for row in normalized_rows}
    if key_sets != {tuple(sorted(expected_keys))}:
        raise RuntimeError(f'Normalized export_items payload key mismatch: {key_sets}')

    return normalized_rows


def build_payload(
    metadata: dict[str, dict[str, Any]],
    db_items: list[dict[str, Any]],
    export_data_counts: dict[str, int],
) -> tuple[list[dict[str, Any]], list[str], list[str], list[str], int, list[str], int, int, int, dict[str, int]]:
    db_by_sheet_candidates: dict[str, list[dict[str, Any]]] = {}
    for item in db_items:
        sheet_name = normalize_sheet_name(item.get('sheet_name'))
        if sheet_name:
            db_by_sheet_candidates.setdefault(sheet_name, []).append(item)
    db_by_sheet_key: dict[str, list[dict[str, Any]]] = {}
    db_by_item_key: dict[str, list[dict[str, Any]]] = {}
    for item in db_items:
        sheet_key = match_key(item.get('sheet_name'))
        item_key = match_key(item.get('item_name') or item.get('name'))
        if sheet_key:
            db_by_sheet_key.setdefault(sheet_key, []).append(item)
        if item_key:
            db_by_item_key.setdefault(item_key, []).append(item)

    def data_count(item: dict[str, Any]) -> int:
        item_id = clean_text(item.get('id'))
        return export_data_counts.get(item_id, 0)

    def choose_best(candidates: list[dict[str, Any]]) -> dict[str, Any] | None:
        if not candidates:
            return None
        return sorted(
            candidates,
            key=lambda item: (data_count(item), clean_text(item.get('sheet_name'))),
            reverse=True,
        )[0]

    db_by_sheet = {
        sheet_name: best
        for sheet_name, candidates in db_by_sheet_candidates.items()
        if (best := choose_best(candidates)) is not None
    }
    db_sheet_names = set(db_by_sheet)

    def find_existing_item(pair_sheet_name: str) -> tuple[dict[str, Any], str] | None:
        candidates: list[tuple[int, dict[str, Any], str]] = []

        exact = db_by_sheet.get(pair_sheet_name)
        if exact:
            candidates.append((1, exact, 'exact'))

        alias = SHEET_NAME_ALIASES.get(pair_sheet_name)
        if alias and alias in db_by_sheet:
            candidates.append((2, db_by_sheet[alias], 'alias'))

        pair_key = match_key(pair_sheet_name)
        alias_key = match_key(alias) if alias else ''
        for key in [pair_key, alias_key]:
            if not key:
                continue
            by_sheet = choose_best(db_by_sheet_key.get(key, []))
            if by_sheet:
                candidates.append((3, by_sheet, 'normalized_sheet_name'))
            by_item_name = choose_best(db_by_item_key.get(key, []))
            if by_item_name:
                candidates.append((4, by_item_name, 'normalized_item_name'))

        if candidates:
            deduped: dict[str, tuple[int, dict[str, Any], str]] = {}
            for priority, item, method in candidates:
                item_id = clean_text(item.get('id')) or clean_text(item.get('sheet_name'))
                current = deduped.get(item_id)
                if current is None or priority < current[0]:
                    deduped[item_id] = (priority, item, method)

            return sorted(
                deduped.values(),
                key=lambda candidate: (
                    0 if data_count(candidate[1]) > 0 else 1,
                    candidate[0],
                    -data_count(candidate[1]),
                    clean_text(candidate[1].get('sheet_name')),
                ),
            )[0][1:]

        return None

    pair_to_existing: dict[str, dict[str, Any]] = {}
    match_methods: dict[str, str] = {}
    unmatched_pair_sheet_names: list[str] = []
    for pair_sheet_name in metadata:
        match = find_existing_item(pair_sheet_name)
        if match:
            existing, method = match
            pair_to_existing[pair_sheet_name] = existing
            match_methods[pair_sheet_name] = method
        else:
            unmatched_pair_sheet_names.append(pair_sheet_name)

    matched_sheet_names = sorted(
        {
            normalize_sheet_name(item.get('sheet_name'))
            for item in pair_to_existing.values()
            if normalize_sheet_name(item.get('sheet_name'))
        }
    )
    activated_sheet_names = sorted(
        sheet_name
        for sheet_name in matched_sheet_names
        if export_data_counts.get(clean_text(db_by_sheet[sheet_name].get('id')), 0) > 0
    )
    related_updated = 0

    payload: list[dict[str, Any]] = []

    for pair_sheet_name, item_metadata in metadata.items():
        existing = pair_to_existing.get(pair_sheet_name)
        if not existing:
            continue

        matched_sheet_name = normalize_sheet_name(existing.get('sheet_name'))
        if matched_sheet_name not in activated_sheet_names:
            continue
        sheet_name = existing.get('sheet_name') if existing.get('sheet_name') is not None else matched_sheet_name
        row: dict[str, Any] = {
            'sheet_name': sheet_name,
            'item_name': pair_sheet_name,
            'sector': item_metadata.get('sector') or existing.get('sector') or '기타',
            'importance': item_metadata.get('importance') if item_metadata.get('importance') is not None else existing.get('importance') or 0,
            'related_stocks': item_metadata.get('related_stocks'),
            'is_active': True,
            'description': None,
            'note': None,
        }
        if item_metadata.get('description') is not None:
            row['description'] = item_metadata.get('description')
        elif existing.get('description') is not None:
            row['description'] = existing.get('description')
        if item_metadata.get('note') is not None:
            row['note'] = item_metadata.get('note')
        elif existing.get('note') is not None:
            row['note'] = existing.get('note')

        if existing.get('related_stocks') != item_metadata.get('related_stocks'):
            related_updated += 1
        payload.append(row)

    active_payload_sheet_names = {row.get('sheet_name') for row in payload if row.get('sheet_name')}
    deactivated_sheet_names: list[str] = []
    for existing in db_items:
        raw_sheet_name = existing.get('sheet_name')
        if not raw_sheet_name or raw_sheet_name in active_payload_sheet_names:
            continue
        deactivated_sheet_names.append(str(raw_sheet_name))
        row = {
            'sheet_name': raw_sheet_name,
            'item_name': existing.get('item_name') or existing.get('name') or raw_sheet_name,
            'sector': existing.get('sector') or '기타',
            'importance': existing.get('importance') or 0,
            'description': existing.get('description'),
            'related_stocks': existing.get('related_stocks'),
            'note': existing.get('note'),
            'is_active': False,
        }
        payload.append(row)

    active_without_data: list[str] = []
    active_by_sector: dict[str, int] = {}
    for row in payload:
        if row.get('is_active') is True:
            sector = clean_text(row.get('sector')) or '기타'
            active_by_sector[sector] = active_by_sector.get(sector, 0) + 1

    return (
        payload,
        activated_sheet_names,
        sorted(unmatched_pair_sheet_names),
        deactivated_sheet_names,
        related_updated,
        active_without_data,
        len(pair_to_existing),
        sum(1 for method in match_methods.values() if method == 'alias'),
        sum(1 for method in match_methods.values() if method.startswith('normalized')),
        active_by_sector,
    )


def summarize_final_db_state(
    db_items: list[dict[str, Any]],
    export_data_counts: dict[str, int],
) -> tuple[int, int, list[str], dict[str, int]]:
    active_count = 0
    inactive_count = 0
    active_without_data: list[str] = []
    active_by_sector: dict[str, int] = {}

    for item in db_items:
        is_active = item.get('is_active') is True
        if is_active:
            active_count += 1
            sector = clean_text(item.get('sector')) or '기타'
            active_by_sector[sector] = active_by_sector.get(sector, 0) + 1
            item_id = clean_text(item.get('id'))
            if export_data_counts.get(item_id, 0) == 0:
                active_without_data.append(clean_text(item.get('sheet_name')))
        else:
            inactive_count += 1

    return active_count, inactive_count, sorted(active_without_data), active_by_sector


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Sync export item whitelist metadata from workbook.')
    parser.add_argument(
        '--file',
        default=str(DEFAULT_FILE),
        help='Path to 수출항목_분류_중요도.xlsx.',
    )
    parser.add_argument(
        '--sheet',
        default=DEFAULT_SHEET_NAME,
        help='Workbook sheet name to use as export item whitelist.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    file_path = Path(args.file).expanduser()
    if not file_path.is_absolute():
        file_path = PROJECT_ROOT / file_path
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f'Metadata workbook does not exist: {file_path}')

    metadata, loaded_rows_count, valid_rows_count = load_pair_metadata(file_path, args.sheet)
    active_sheet_names = set(metadata)

    load_env()
    supabase_url = resolve_supabase_url()
    service_role_key = require_env('SUPABASE_SERVICE_ROLE_KEY')
    headers = build_headers(service_role_key)

    assert_is_active_column(supabase_url, headers)
    db_items = fetch_db_items(supabase_url, headers)
    export_data_counts = fetch_export_data_counts(supabase_url, headers)
    (
        payload,
        matched_sheet_names,
        unmatched_pair_sheet_names,
        deactivated_sheet_names,
        related_updated,
        active_without_data,
        matched_pair_rows_count,
        alias_matched_count,
        normalized_matched_count,
        active_by_sector,
    ) = build_payload(
        metadata,
        db_items,
        export_data_counts,
    )
    updated_rows_count = upsert_db_items(supabase_url, headers, payload)
    final_db_items = fetch_db_items(supabase_url, headers)
    (
        final_active_count,
        final_inactive_count,
        final_active_without_data,
        final_active_by_sector,
    ) = summarize_final_db_state(final_db_items, export_data_counts)

    print('Summary')
    print(f'  source sheet: {args.sheet}')
    print(f'  loaded pair rows count: {loaded_rows_count}')
    print(f'  valid pair rows count: {valid_rows_count}')
    print(f'  matched pair rows count: {matched_pair_rows_count}')
    print(f'  unmatched pair rows count: {len(unmatched_pair_sheet_names)}')
    print(f'  active sheet_names count: {len(matched_sheet_names)}')
    print(f'  matched export_items count: {len(matched_sheet_names)}')
    print(f'  activated rows count: {len(matched_sheet_names)}')
    print(f'  deactivated rows count: {len(deactivated_sheet_names)}')
    print(f'  updated related_stocks rows count: {related_updated}')
    print(f'  upserted rows count: {updated_rows_count}')
    print(f'  final active count: {final_active_count}')
    print(f'  final inactive count: {final_inactive_count}')
    print(f'  active items with no export_data count: {len(final_active_without_data)}')
    print(f'  alias matched count: {alias_matched_count}')
    print(f'  normalized matched count: {normalized_matched_count}')

    print('\nActive by sector summary:')
    if final_active_by_sector:
        for sector, count in sorted(final_active_by_sector.items()):
            print(f'  - {sector}: {count}')
    else:
        print('  - none')

    print('\nUnmatched pair sheet names:')
    if unmatched_pair_sheet_names:
        for sheet_name in unmatched_pair_sheet_names:
            print(f'  - {sheet_name}')
    else:
        print('  - none')

    print('\nDeactivated sheet names:')
    if deactivated_sheet_names:
        for sheet_name in deactivated_sheet_names:
            print(f'  - {sheet_name}')
    else:
        print('  - none')

    print('\nActive items with no export_data:')
    if final_active_without_data:
        for sheet_name in final_active_without_data:
            print(f'  - {sheet_name}')
    else:
        print('  - none')

    print('\nUnmatched CSV sheet names:')
    print('  - skipped (DB active sync uses existing export_items sheet_name)')


if __name__ == '__main__':
    main()
