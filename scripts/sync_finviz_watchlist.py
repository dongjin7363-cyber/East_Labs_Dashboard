import argparse
import os
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd
import requests
from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FILE = Path('/Users/kevin/Desktop/태린아재 파일 + 코드/EAST_Finviz_Watchlist.xlsx')
WATCHLIST_SHEET = 'Watchlist'
EXCLUDED_TICKERS = {'PSTG', 'ALTM', 'FANUY', 'HOLX'}


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


def default_chart_url(ticker: str) -> str:
    return f'https://finviz.com/chart.ashx?t={ticker}&ty=c&ta=1&p=d&s=l'


def parse_sort_order(value: Any, fallback: int) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def find_column(column_index: dict[str, int], candidates: list[str]) -> int | None:
    for candidate in candidates:
        if candidate in column_index:
            return column_index[candidate]
    return None


def normalize_star(value: Any) -> int:
    text = clean_text(value)
    try:
        numeric_level = int(float(text))
    except (TypeError, ValueError):
        numeric_level = text.count('★')
    return max(0, min(3, numeric_level))


def parse_watchlist(file_path: Path) -> tuple[list[dict[str, Any]], int, list[str], list[str], int]:
    df = pd.read_excel(file_path, sheet_name=WATCHLIST_SHEET, header=None)
    header_row_index = None
    for idx, row in df.iterrows():
        values = [clean_text(value) for value in row.tolist()]
        if 'Ticker' in values and '섹터' in values:
            header_row_index = idx
            break

    if header_row_index is None:
        raise RuntimeError(f'Could not find Watchlist header row in sheet: {WATCHLIST_SHEET}')

    headers = [clean_text(value) for value in df.iloc[header_row_index].tolist()]
    column_index = {name: index for index, name in enumerate(headers) if name}
    chart_col = find_column(column_index, ['Finviz 차트', 'Finviz 차트 URL'])
    required = ['#', 'Ticker', '섹터', '종목명', '성격 키워드', 'Star']
    missing = [name for name in required if name not in column_index]
    if chart_col is None:
        missing.append('Finviz 차트 URL')
    if missing:
        raise RuntimeError(f'Missing columns: {", ".join(missing)}')

    loaded_rows_count = max(0, len(df) - header_row_index - 1)
    parsed_rows: list[dict[str, Any]] = []
    skipped_rows_count = 0
    excluded_tickers: list[str] = []

    for fallback_order, (_, row) in enumerate(df.iloc[header_row_index + 1 :].iterrows(), start=1):
        ticker = clean_text(row.iloc[column_index['Ticker']]).upper()
        sector = clean_text(row.iloc[column_index['섹터']])
        display_name = clean_text(row.iloc[column_index['종목명']])
        keywords = clean_text(row.iloc[column_index['성격 키워드']])
        star = normalize_star(row.iloc[column_index['Star']])
        chart_url = clean_text(row.iloc[chart_col])
        sort_order = parse_sort_order(row.iloc[column_index['#']], fallback_order)

        if not ticker or not sector or not display_name:
            skipped_rows_count += 1
            continue
        if ticker.lower() == 'ticker' or sector == '섹터':
            skipped_rows_count += 1
            continue
        if ticker in EXCLUDED_TICKERS:
            excluded_tickers.append(ticker)
            continue

        parsed_rows.append(
            {
                'ticker': ticker,
                'sector': sector,
                'display_name': display_name,
                'keywords': keywords,
                'star': star,
                'chart_url': chart_url or default_chart_url(ticker),
                'sort_order': sort_order,
                'is_active': True,
            }
        )

    ticker_counts = Counter(row['ticker'] for row in parsed_rows)
    duplicate_tickers = sorted([ticker for ticker, count in ticker_counts.items() if count > 1])

    deduped_by_ticker: dict[str, dict[str, Any]] = {}
    for row in parsed_rows:
        deduped_by_ticker[row['ticker']] = row

    return (
        list(deduped_by_ticker.values()),
        skipped_rows_count,
        duplicate_tickers,
        sorted(set(excluded_tickers)),
        loaded_rows_count,
    )


def upsert_rows(supabase_url: str, headers: dict[str, str], rows: list[dict[str, Any]]) -> tuple[int, int]:
    if not rows:
        return 0, 0

    response = requests.post(
        f'{supabase_url}/rest/v1/market_finviz_watchlist?on_conflict=ticker',
        headers=headers,
        json=rows,
        timeout=60,
    )
    if 200 <= response.status_code < 300:
        if response.text:
            return len(response.json()), 0
        return len(rows), 0

    print(f'[FAIL] {response.status_code} {response.text}')
    return 0, len(rows)


def fetch_existing_tickers(supabase_url: str, headers: dict[str, str]) -> set[str]:
    response = requests.get(
        f'{supabase_url}/rest/v1/market_finviz_watchlist?select=ticker',
        headers=headers,
        timeout=60,
    )
    if not (200 <= response.status_code < 300):
        print(f'[WARN] could not fetch existing Finviz tickers: {response.status_code} {response.text}')
        return set()

    tickers: set[str] = set()
    for row in response.json():
        ticker = clean_text(row.get('ticker')).upper()
        if ticker:
            tickers.add(ticker)
    return tickers


def deactivate_tickers(
    supabase_url: str,
    headers: dict[str, str],
    tickers: set[str],
) -> tuple[int, int]:
    deactivated = 0
    failed = 0
    for ticker in sorted(tickers):
        response = requests.patch(
            f'{supabase_url}/rest/v1/market_finviz_watchlist?ticker=eq.{ticker}',
            headers=headers,
            json={'is_active': False},
            timeout=30,
        )
        if 200 <= response.status_code < 300:
            deactivated += 1
        else:
            failed += 1
            print(f'[WARN] failed to deactivate {ticker}: {response.status_code} {response.text}')
    return deactivated, failed


def print_sector_summary(rows: list[dict[str, Any]]) -> None:
    counts = Counter(row['sector'] for row in rows)
    print('  sectors summary:')
    for sector, count in sorted(counts.items()):
        print(f'    - {sector}: {count}')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description='Sync EAST Finviz watchlist from Excel to Supabase.')
    parser.add_argument(
        '--file',
        default=str(DEFAULT_FILE),
        help='Path to EAST_Finviz_Watchlist.xlsx.',
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    file_path = Path(args.file).expanduser()
    if not file_path.is_absolute():
        file_path = PROJECT_ROOT / file_path
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f'Watchlist file does not exist: {file_path}')

    rows, skipped_rows_count, duplicate_tickers, excluded_tickers, loaded_rows_count = parse_watchlist(file_path)

    load_env()
    supabase_url = resolve_supabase_url()
    service_role_key = require_env('SUPABASE_SERVICE_ROLE_KEY')
    headers = build_headers(service_role_key)

    existing_tickers = fetch_existing_tickers(supabase_url, headers)
    upserted_rows_count, failed_rows_count = upsert_rows(supabase_url, headers, rows)
    synced_tickers = {row['ticker'] for row in rows}
    stale_tickers = existing_tickers - synced_tickers
    tickers_to_deactivate = stale_tickers | (EXCLUDED_TICKERS & existing_tickers)
    deactivated_rows_count, deactivation_failed_count = deactivate_tickers(
        supabase_url,
        headers,
        tickers_to_deactivate,
    )

    print('Summary')
    print(f'  loaded rows count: {loaded_rows_count}')
    print(f'  valid rows count: {len(rows)}')
    print(f'  skipped rows count: {skipped_rows_count}')
    print(f'  excluded ticker count: {len(EXCLUDED_TICKERS)}')
    print(f'  excluded ticker list: {", ".join(sorted(EXCLUDED_TICKERS))}')
    print(f'  duplicate ticker count: {len(duplicate_tickers)}')
    print(f'  duplicate ticker list: {", ".join(duplicate_tickers) if duplicate_tickers else "none"}')
    print(f'  upserted rows count: {upserted_rows_count}')
    print(f'  failed rows count: {failed_rows_count}')
    print(f'  deactivated rows count: {deactivated_rows_count}')
    print(f'  deactivation failed count: {deactivation_failed_count}')
    print(f'  stale DB ticker count: {len(stale_tickers)}')
    print(f'  stale DB ticker list: {", ".join(sorted(stale_tickers)) if stale_tickers else "none"}')
    print(f'  excluded tickers found in Excel: {", ".join(excluded_tickers) if excluded_tickers else "none"}')
    print_sector_summary(rows)


if __name__ == '__main__':
    main()
