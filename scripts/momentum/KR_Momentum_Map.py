from __future__ import annotations

import holidays
from datetime import date as _date
_kr_holidays = holidays.KR()
if _date.today() in _kr_holidays:
    print(f"오늘은 공휴일 ({_kr_holidays[_date.today()]}) — 종료")
    exit()

import datetime as dt
import logging
import os
import platform
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

import FinanceDataReader as fdr
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib import font_manager
from scipy.stats import linregress


# ==============================
# 1) 유니버스 정의
# ==============================
ETF_CATALOG: List[Dict[str, str]] = [
    {"sector": "반도체", "asset_name": "KODEX 반도체", "ticker": "091160"},
    {"sector": "반도체 후공정", "asset_name": "SOL 반도체 후공정", "ticker": "475310"},
    {"sector": "반도체 전공정", "asset_name": "SOL 반도체 전공정", "ticker": "475300"},
    {"sector": "반도체 소부장", "asset_name": "SOL AI 반도체 소부장", "ticker": "455850"},
    {"sector": "조선", "asset_name": "KODEX 조선 TOP10", "ticker": "494670"},
    {"sector": "방산", "asset_name": "PLUS K 방산", "ticker": "449450"},
    {"sector": "원자력", "asset_name": "HANARO 원자력iSelect", "ticker": "434730"},
    {"sector": "은행", "asset_name": "KODEX 은행", "ticker": "091170"},
    {"sector": "증권", "asset_name": "TIGER 증권", "ticker": "102970"},
    {"sector": "보험", "asset_name": "KODEX 보험", "ticker": "140700"},
    {"sector": "2차전지 제조", "asset_name": "Kodex 2차전지산업", "ticker": "305720"},
    {"sector": "2차전지 소재", "asset_name": "Tiger 2차전지소재FN", "ticker": "462010"},
    {"sector": "철강", "asset_name": "KODEX 철강", "ticker": "117680"},
    {"sector": "에너지 화학", "asset_name": "TIGER 200 에너지화학", "ticker": "139250"},
    {"sector": "건설", "asset_name": "TIGER 200 건설", "ticker": "139220"},
    {"sector": "화장품", "asset_name": "TIGER 화장품", "ticker": "228790"},
    {"sector": "전력설비", "asset_name": "KODEX AI전력핵심설비", "ticker": "487240"},
    {"sector": "친환경", "asset_name": "PLUS 태양광&ESS", "ticker": "457990"},
    {"sector": "코스닥150", "asset_name": "KODEX 코스닥150", "ticker": "229200"},
    {"sector": "코스피200", "asset_name": "KODEX 200", "ticker": "069500"},
    {"sector": "로봇", "asset_name": "KODEX 로봇액티브", "ticker": "445290"},
    {"sector": "엔터", "asset_name": "ACE KPOP포커스", "ticker": "475050"},
    {"sector": "우주", "asset_name": "PLUS 우주항공&UAM", "ticker": "421320"},
    {"sector": "게임", "asset_name": "TIGER TOP10 게임", "ticker": "364990"},
    {"sector": "인터넷", "asset_name": "Tiger 인터넷 top10", "ticker": "365000"},
    {"sector": "지주사", "asset_name": "TIGER 지주회사", "ticker": "307520"},
    {"sector": "바이오", "asset_name": "KoAct 바이오헬스케어액티브", "ticker": "462900"},
    {"sector": "S&P500", "asset_name": "S&P 500 Index", "ticker": "S&P500"},
    {"sector": "나스닥", "asset_name": "NASDAQ Composite", "ticker": "IXIC"},
    {"sector": "Gold", "asset_name": "Gold Futures", "ticker": "GC=F"},
    {"sector": "WTI", "asset_name": "WTI Crude Oil Futures", "ticker": "CL=F"},
    {"sector": "BTC", "asset_name": "Bitcoin / USD", "ticker": "BTC/USD"},
    {"sector": "ETH", "asset_name": "Ethereum / USD", "ticker": "ETH/USD"},
    {"sector": "자동차", "asset_name": "SOL 자동차 TOP3 플러스", "ticker": "466930"},
    {"sector": "2차전지 전고체", "asset_name": "SOL 전고체배터리&실리콘음극재", "ticker": "0005D0"},
    {"sector": "자동차", "asset_name": "SOL 자동차 TOP3 플러스", "ticker": "466930"},
    {"sector": "2차전지 전고체", "asset_name": "SOL 전고체배터리&실리콘음극재", "ticker": "0005D0"},
    {"sector": "원자력2", "asset_name": "TIGER 코리아원자력", "ticker": "0091P0"},
]

ETF_UNIVERSE: Dict[str, str] = {item["sector"]: item["ticker"] for item in ETF_CATALOG}
ETF_FULLNAME_MAP: Dict[str, str] = {item["sector"]: item["asset_name"] for item in ETF_CATALOG}


# ==============================
# 2) 설정값
# ==============================
@dataclass
class MomentumMapConfig:
    benchmark_name: str = "코스피200"
    ultra_short_window: int = 5          # ★ 추가: Acceleration용 초단기 윈도우 (5일 = 1주)
    short_window: int = 20
    mid_window: int = 60
    long_window: int = 120
    trend_window: int = 60
    volatility_window: int = 20
    liquidity_window: int = 20
    fetch_buffer_days: int = 420
    min_avg_trading_value_krw: float = 2_000_000_000  # 20억
    top_n_rank_box: int = 10
    score_weights: Dict[str, float] = field(
        default_factory=lambda: {
            "RS_20": 0.35,
            "RS_60": 0.25,
            "RS_120": 0.15,
            "TrendQuality": 0.15,
            "Acceleration": 0.10,
        }
    )
    winsor_quantiles: Tuple[float, float] = (0.05, 0.95)
    save_csv: bool = True
    save_png: bool = True

    # 시각화 관련
    label_all_eligible: bool = True
    label_top_ineligible: int = 2
    min_bubble_size: float = 320.0
    max_bubble_size: float = 3200.0
    ineligible_marker_size: float = 95.0
    chart_width: float = 19.0
    chart_height: float = 11.0
    side_panel_width_ratio: float = 1.9
    colorbar_width_ratio: float = 0.18


# ==============================
# 3) 환경 설정
# ==============================
def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%H:%M:%S",
    )


def setup_korean_font() -> None:
    candidates: List[str]
    system = platform.system().lower()
    if system == "darwin":
        candidates = ["AppleGothic", "NanumGothic", "Malgun Gothic"]
    elif system == "windows":
        candidates = ["Malgun Gothic", "NanumGothic", "AppleGothic"]
    else:
        candidates = ["NanumGothic", "AppleGothic", "Malgun Gothic"]

    available = {f.name for f in font_manager.fontManager.ttflist}
    for font_name in candidates:
        if font_name in available:
            plt.rc("font", family=font_name)
            break
    plt.rcParams["axes.unicode_minus"] = False


def resolve_save_dir(folder_name: str = "Python_Global") -> str:
    output_dir = os.environ.get("MOMENTUM_OUTPUT_DIR")
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)
        return output_dir

    try:
        desktop = os.path.join(os.path.expanduser("~"), "Desktop")
        save_dir = os.path.join(desktop, folder_name)
        os.makedirs(save_dir, exist_ok=True)
        return save_dir
    except Exception:
        return os.getcwd()


# ==============================
# 4) 지표 계산 유틸
# ==============================
def safe_read_ohlcv(ticker: str, start_date: str) -> pd.DataFrame:
    df = fdr.DataReader(ticker, start_date)
    required_cols = {"Close", "Volume"}
    if df.empty or not required_cols.issubset(df.columns):
        raise ValueError(f"필수 컬럼 누락 또는 빈 데이터: {ticker}")
    return df[["Close", "Volume"]].dropna()


def latest_return_pct(series: pd.Series, window: int) -> float:
    if len(series) <= window:
        return np.nan
    return (series.iloc[-1] / series.iloc[-(window + 1)] - 1.0) * 100.0


def excess_log_return_bps_per_day(asset: pd.Series, benchmark: pd.Series, window: int) -> float:
    if len(asset) <= window or len(benchmark) <= window:
        return np.nan
    asset_lr = np.log(asset.iloc[-1] / asset.iloc[-(window + 1)]) / window
    benchmark_lr = np.log(benchmark.iloc[-1] / benchmark.iloc[-(window + 1)]) / window
    return (asset_lr - benchmark_lr) * 10000.0


def log_trend_stats(series: pd.Series) -> Tuple[float, float, float]:
    y = np.log(series.astype(float).values)
    x = np.arange(len(y))
    slope, _, r_value, _, _ = linregress(x, y)
    r2 = r_value**2
    annualized_return_pct = (np.exp(slope * 252) - 1.0) * 100.0
    return slope, r2, annualized_return_pct


def annualized_volatility_pct(series: pd.Series, window: int) -> float:
    log_returns = np.log(series / series.shift(1)).dropna().tail(window)
    if log_returns.empty:
        return np.nan
    return float(log_returns.std(ddof=0) * np.sqrt(252) * 100.0)


def average_trading_value_krw(close: pd.Series, volume: pd.Series, window: int) -> float:
    traded_value = (close * volume).tail(window)
    if traded_value.empty:
        return np.nan
    return float(traded_value.mean())


def winsorize(series: pd.Series, low_q: float, high_q: float) -> pd.Series:
    lower = series.quantile(low_q)
    upper = series.quantile(high_q)
    return series.clip(lower=lower, upper=upper)


def zscore(series: pd.Series) -> pd.Series:
    std = series.std(ddof=0)
    if std == 0 or np.isnan(std):
        return pd.Series(0.0, index=series.index)
    return (series - series.mean()) / std


def classify_quadrant(rs_20: float, acceleration: float) -> str:
    if rs_20 >= 0 and acceleration >= 0:
        return "리더"
    if rs_20 >= 0 and acceleration < 0:
        return "강세 둔화"
    if rs_20 < 0 and acceleration >= 0:
        return "회복 후보"
    return "약세 지속"


# ==============================
# 5) 핵심 로직
# ==============================
def calculate_momentum_map(universe: Dict[str, str], config: MomentumMapConfig) -> pd.DataFrame:
    benchmark_ticker = universe[config.benchmark_name]
    start_date = (dt.datetime.now() - dt.timedelta(days=config.fetch_buffer_days)).strftime("%Y-%m-%d")
    min_history = max(
        config.long_window,
        config.trend_window,
        config.volatility_window,
        config.liquidity_window,
    ) + 5

    benchmark_df = safe_read_ohlcv(benchmark_ticker, start_date)
    benchmark_close = benchmark_df["Close"]

    records = []
    for sector_name, ticker in universe.items():
        try:
            df = safe_read_ohlcv(ticker, start_date)

            aligned = pd.concat(
                [df[["Close"]].rename(columns={"Close": "asset_close"}), benchmark_close.rename("bench_close")],
                axis=1,
                join="inner",
            ).dropna()

            if len(aligned) < min_history:
                logging.warning("히스토리 부족으로 제외: %s (%s)", sector_name, ticker)
                continue

            asset_close = aligned["asset_close"]
            bench_close = aligned["bench_close"]
            volume = df["Volume"].reindex(asset_close.index).fillna(0)

            ret_20 = latest_return_pct(asset_close, config.short_window)
            ret_60 = latest_return_pct(asset_close, config.mid_window)
            ret_120 = latest_return_pct(asset_close, config.long_window)
            bench_ret_20 = latest_return_pct(bench_close, config.short_window)
            bench_ret_60 = latest_return_pct(bench_close, config.mid_window)
            bench_ret_120 = latest_return_pct(bench_close, config.long_window)

            rs_20 = ret_20 - bench_ret_20
            rs_60 = ret_60 - bench_ret_60
            rs_120 = ret_120 - bench_ret_120

            excess_ultra  = excess_log_return_bps_per_day(asset_close, bench_close, config.ultra_short_window)  # ★ RS_5
            excess_short  = excess_log_return_bps_per_day(asset_close, bench_close, config.short_window)         # RS_20
            excess_mid    = excess_log_return_bps_per_day(asset_close, bench_close, config.mid_window)           # RS_60
            acceleration  = excess_ultra - excess_short   # ★ 변경: RS_5 - RS_20 (더 민감)

            _, r2, annualized_return = log_trend_stats(asset_close.tail(config.trend_window))
            vol_20 = annualized_volatility_pct(asset_close, config.volatility_window)
            trend_quality = annualized_return * r2 / max(vol_20, 1e-6)

            avg_trading_value = average_trading_value_krw(asset_close, volume, config.liquidity_window)
            avg_trading_value_eok = avg_trading_value / 100_000_000.0
            eligible = avg_trading_value >= config.min_avg_trading_value_krw

            records.append(
                {
                    "Sector": sector_name,
                    "ETFName": ETF_FULLNAME_MAP.get(sector_name, sector_name),
                    "Code": ticker,
                    "Close": float(asset_close.iloc[-1]),
                    "Return_20(%)": round(ret_20, 2),
                    "Return_60(%)": round(ret_60, 2),
                    "Return_120(%)": round(ret_120, 2),
                    "RS_20(%p)": round(rs_20, 2),
                    "RS_60(%p)": round(rs_60, 2),
                    "RS_120(%p)": round(rs_120, 2),
                    "RS5_bps": round(excess_ultra, 2),   # ★ 추가: 5일 초과수익 (참고용)
                    "RS20_bps": round(excess_short, 2),  # ★ 추가: 20일 초과수익 (참고용)
                    "Acceleration(bps/day)": round(acceleration, 2),
                    "TrendQuality": round(trend_quality, 2),
                    "Vol_20(ann%)": round(vol_20, 2),
                    "AvgTradingValue(억원)": round(avg_trading_value_eok, 2),
                    "Eligible": bool(eligible),
                    "Quadrant": classify_quadrant(rs_20, acceleration),
                }
            )

        except Exception as exc:
            logging.exception("데이터 처리 실패: %s (%s) | %s", sector_name, ticker, exc)

    result = pd.DataFrame(records)
    if result.empty:
        raise RuntimeError("계산 가능한 ETF가 없습니다. 유니버스 또는 데이터 소스를 확인하세요.")

    low_q, high_q = config.winsor_quantiles
    score_columns = {
        "RS_20(%p)": "RS_20_Z",
        "RS_60(%p)": "RS_60_Z",
        "RS_120(%p)": "RS_120_Z",
        "TrendQuality": "TrendQuality_Z",
        "Acceleration(bps/day)": "Acceleration_Z",
    }

    for raw_col, z_col in score_columns.items():
        clipped = winsorize(result[raw_col], low_q, high_q)
        result[z_col] = zscore(clipped).round(4)

    result["MomentumScore"] = (
        config.score_weights["RS_20"] * result["RS_20_Z"]
        + config.score_weights["RS_60"] * result["RS_60_Z"]
        + config.score_weights["RS_120"] * result["RS_120_Z"]
        + config.score_weights["TrendQuality"] * result["TrendQuality_Z"]
        + config.score_weights["Acceleration"] * result["Acceleration_Z"]
    ).round(4)

    result["Rank"] = np.nan
    eligible_order = result.loc[result["Eligible"]].sort_values("MomentumScore", ascending=False).index
    result.loc[eligible_order, "Rank"] = np.arange(1, len(eligible_order) + 1)

    result = result.sort_values(["Eligible", "MomentumScore"], ascending=[False, False]).reset_index(drop=True)
    return result


# ==============================
# 6) 시각화 유틸
# ==============================
def add_quadrant_text(ax: plt.Axes) -> None:
    quadrant_specs = [
        ((0.97, 0.93), "1사분면: 리더\n(상대강도+가속)", "right", "top"),
        ((0.03, 0.93), "2사분면: 회복 후보\n(약했지만 개선)", "left", "top"),
        ((0.03, 0.07), "3사분면: 약세 지속\n(약하고 더 악화)", "left", "bottom"),
        ((0.97, 0.07), "4사분면: 강세 둔화\n(강하지만 식는 구간)", "right", "bottom"),
    ]
    for (x_pos, y_pos), text, ha, va in quadrant_specs:
        ax.text(
            x_pos,
            y_pos,
            text,
            transform=ax.transAxes,
            ha=ha,
            va=va,
            fontsize=10,
            fontweight="bold",
            color="dimgray",
            bbox=dict(boxstyle="round,pad=0.25", facecolor="white", edgecolor="none", alpha=0.72),
            zorder=4,
        )


def build_rank_box(df: pd.DataFrame, top_n: int) -> str:
    eligible = df[df["Eligible"]].sort_values("MomentumScore", ascending=False).head(top_n)
    lines = ["[ Top Momentum ]"]
    for _, row in eligible.iterrows():
        rank = int(row["Rank"])
        lines.append(f"{rank:>2}. {row['Sector']}  {row['MomentumScore']:+.2f}")
    return "\n".join(lines)


def build_map_guide_text(config: MomentumMapConfig) -> str:
    return (
        "[ 맵 읽는 법 ]\n"
        f"x축: 최근 {config.short_window}일 상대강도\n"
        f"y축: {config.ultra_short_window}일 RS - {config.short_window}일 RS\n"
        f"원 크기: 최근 {config.liquidity_window}일 평균 거래대금\n"
        "원 색상: 복합 모멘텀 점수\n"
        f"× 표시는 유동성 {config.min_avg_trading_value_krw/100_000_000:.0f}억원 미만"
    )


def compute_bubble_sizes(values: pd.Series, min_size: float, max_size: float) -> pd.Series:
    values = values.clip(lower=0)
    if values.empty:
        return pd.Series(dtype=float)

    transformed = np.log1p(values)
    min_val = transformed.min()
    max_val = transformed.max()

    if max_val == min_val:
        return pd.Series(min_size, index=values.index, dtype=float)

    scaled = (transformed - min_val) / (max_val - min_val)
    sizes = min_size + scaled * (max_size - min_size)
    return pd.Series(sizes, index=values.index, dtype=float)


def select_label_rows(df: pd.DataFrame, config: MomentumMapConfig) -> pd.DataFrame:
    labels: List[pd.DataFrame] = []

    eligible = df[df["Eligible"]].copy()
    if config.label_all_eligible:
        labels.append(eligible)
    else:
        labels.append(eligible.sort_values("MomentumScore", ascending=False).head(config.top_n_rank_box))

    ineligible = df[~df["Eligible"]].copy()
    if config.label_top_ineligible > 0 and not ineligible.empty:
        labels.append(ineligible.sort_values("MomentumScore", ascending=False).head(config.label_top_ineligible))

    benchmark_row = df[df["Sector"] == config.benchmark_name]
    if not benchmark_row.empty:
        labels.append(benchmark_row)

    if not labels:
        return pd.DataFrame(columns=df.columns)

    return pd.concat(labels, axis=0).drop_duplicates(subset=["Sector"]).copy()


def annotate_with_spacing(
    ax: plt.Axes,
    label_df: pd.DataFrame,
    x_col: str,
    y_col: str,
    name_col: str,
    benchmark_name: str,
) -> None:
    if label_df.empty:
        return

    x_min, x_max = ax.get_xlim()
    y_min, y_max = ax.get_ylim()
    x_range = max(x_max - x_min, 1e-6)
    y_range = max(y_max - y_min, 1e-6)
    min_gap = y_range * 0.028
    x_pad = x_range * 0.015

    rows = label_df.copy()
    rows["LabelSide"] = "right"
    rows.loc[rows[x_col] > x_max - x_range * 0.18, "LabelSide"] = "left"
    rows.loc[rows[x_col] < x_min + x_range * 0.18, "LabelSide"] = "right"
    rows.loc[(rows[x_col] < 0) & (rows[x_col] >= x_min + x_range * 0.18), "LabelSide"] = "left"

    for side in ["left", "right"]:
        subset = rows[rows["LabelSide"] == side].sort_values(y_col).copy()
        if subset.empty:
            continue

        adjusted_y: List[float] = []
        last_y: float | None = None
        for val in subset[y_col].tolist():
            new_y = float(val)
            if last_y is not None and new_y - last_y < min_gap:
                new_y = last_y + min_gap
            adjusted_y.append(new_y)
            last_y = new_y

        overflow = adjusted_y[-1] - (y_max - y_range * 0.02)
        if overflow > 0:
            adjusted_y = [y - overflow for y in adjusted_y]

        underflow = (y_min + y_range * 0.02) - adjusted_y[0]
        if underflow > 0:
            adjusted_y = [y + underflow for y in adjusted_y]

        subset = subset.assign(AdjustedY=adjusted_y)

        for _, row in subset.iterrows():
            is_benchmark = row[name_col] == benchmark_name
            if side == "right":
                text_x = row[x_col] + x_pad
                ha = "left"
            else:
                text_x = row[x_col] - x_pad
                ha = "right"

            text_color = "black" if row["Eligible"] else "dimgray"
            font_weight = "bold" if is_benchmark else "normal"
            box_face = "white" if row["Eligible"] else "#F0F0F0"

            ax.annotate(
                row[name_col],
                xy=(row[x_col], row[y_col]),
                xytext=(text_x, row["AdjustedY"]),
                textcoords="data",
                ha=ha,
                va="center",
                fontsize=10,
                fontweight=font_weight,
                color=text_color,
                bbox=dict(boxstyle="round,pad=0.15", facecolor=box_face, edgecolor="none", alpha=0.78),
                arrowprops=dict(arrowstyle="-", color="gray", alpha=0.45, lw=0.7),
                zorder=5,
            )


def draw_side_panel(side_ax: plt.Axes, df: pd.DataFrame, config: MomentumMapConfig) -> None:
    side_ax.set_xlim(0, 1)
    side_ax.set_ylim(0, 1)
    side_ax.axis("off")

    rank_box = build_rank_box(df, top_n=config.top_n_rank_box)
    side_ax.text(
        0.02,
        0.98,
        rank_box,
        va="top",
        ha="left",
        fontsize=10,
        bbox=dict(boxstyle="round,pad=0.50", facecolor="white", edgecolor="gray", alpha=0.94),
    )

    guide_text = build_map_guide_text(config)
    side_ax.text(
        0.02,
        0.62,
        guide_text,
        va="top",
        ha="left",
        fontsize=9.5,
        bbox=dict(boxstyle="round,pad=0.45", facecolor="white", edgecolor="lightgray", alpha=0.94),
    )

    side_ax.text(0.02, 0.34, "[ 표시 규칙 ]", fontsize=10, fontweight="bold", ha="left", va="top")
    side_ax.scatter([0.08], [0.28], s=120, facecolor="#d95f5f", edgecolor="black", alpha=0.78)
    side_ax.text(0.18, 0.28, "유동성 통과", fontsize=9.5, va="center", ha="left")
    side_ax.scatter([0.08], [0.22], s=120, marker="x", color="gray", linewidths=1.4)
    side_ax.text(0.18, 0.22, "유동성 미통과", fontsize=9.5, va="center", ha="left")

    side_ax.text(0.02, 0.15, "[ 원 크기 = 거래대금 ]", fontsize=10, fontweight="bold", ha="left", va="top")
    sample_values = pd.Series([20, 100, 300], index=["20억원", "100억원", "300억원"])
    sample_sizes = compute_bubble_sizes(sample_values, config.min_bubble_size, config.max_bubble_size) * 0.24
    y_positions = [0.10, 0.065, 0.025]
    for y_pos, (label, size) in zip(y_positions, sample_sizes.items()):
        side_ax.scatter([0.10], [y_pos], s=float(size), facecolor="lightgray", edgecolor="black", alpha=0.65)
        side_ax.text(0.22, y_pos, label, fontsize=9.5, va="center", ha="left")


# ==============================
# 7) 시각화
# ==============================
def plot_momentum_map(df: pd.DataFrame, config: MomentumMapConfig, save_dir: str) -> str:
    today_str = dt.datetime.now().strftime("%Y%m%d")
    fig = plt.figure(figsize=(config.chart_width, config.chart_height))
    gs = fig.add_gridspec(
        nrows=1,
        ncols=3,
        width_ratios=[7.2, config.colorbar_width_ratio, config.side_panel_width_ratio],
        wspace=0.08,
    )
    ax = fig.add_subplot(gs[0, 0])
    cax = fig.add_subplot(gs[0, 1])
    side_ax = fig.add_subplot(gs[0, 2])

    eligible = df[df["Eligible"]].copy()
    ineligible = df[~df["Eligible"]].copy()

    if not eligible.empty:
        eligible["BubbleSize"] = compute_bubble_sizes(
            eligible["AvgTradingValue(억원)"],
            config.min_bubble_size,
            config.max_bubble_size,
        )

    if not ineligible.empty:
        ineligible["BubbleSize"] = config.ineligible_marker_size

    if not ineligible.empty:
        ax.scatter(
            ineligible["RS_20(%p)"],
            ineligible["Acceleration(bps/day)"],
            s=ineligible["BubbleSize"],
            color="lightgray",
            alpha=0.75,
            marker="x",
            linewidths=1.2,
            zorder=2,
        )

    sc = None
    if not eligible.empty:
        sc = ax.scatter(
            eligible["RS_20(%p)"],
            eligible["Acceleration(bps/day)"],
            s=eligible["BubbleSize"],
            c=eligible["MomentumScore"],
            cmap="coolwarm",
            edgecolors="black",
            alpha=0.78,
            zorder=3,
        )

    ax.axhline(0, color="gray", linestyle="--", linewidth=1.2, alpha=0.8)
    ax.axvline(0, color="gray", linestyle="--", linewidth=1.2, alpha=0.8)
    ax.grid(True, alpha=0.25)

    x_min = df["RS_20(%p)"].min()
    x_max = df["RS_20(%p)"].max()
    y_min = df["Acceleration(bps/day)"].min()
    y_max = df["Acceleration(bps/day)"].max()
    x_pad = max((x_max - x_min) * 0.12, 2.0)
    y_pad = max((y_max - y_min) * 0.10, 4.0)
    ax.set_xlim(x_min - x_pad, x_max + x_pad)
    ax.set_ylim(y_min - y_pad, y_max + y_pad)

    label_rows = select_label_rows(df, config)
    annotate_with_spacing(ax, label_rows, "RS_20(%p)", "Acceleration(bps/day)", "Sector", config.benchmark_name)
    add_quadrant_text(ax)

    ax.set_title(
        f"Korea ETF Momentum Map (Relative Strength / Acceleration) - {today_str}",
        fontsize=18,
        fontweight="bold",
        pad=16,
    )
    ax.set_xlabel(f"RS {config.short_window}D vs {config.benchmark_name} (%p)", fontsize=12)
    ax.set_ylabel(f"Acceleration (RS{config.ultra_short_window} - RS{config.short_window}, bps/day)", fontsize=12)

    if sc is not None:
        cbar = fig.colorbar(sc, cax=cax)
        cbar.set_label("Momentum Score", fontsize=11)
    else:
        cax.axis("off")

    draw_side_panel(side_ax, df, config)

    fig.subplots_adjust(left=0.06, right=0.98, top=0.92, bottom=0.08, wspace=0.08)

    save_path = os.path.join(save_dir, f"KR_Momentum_Map_v2_{today_str}.png")
    if config.save_png:
        plt.savefig(save_path, dpi=300, bbox_inches="tight")
        logging.info("차트 저장 완료: %s", save_path)

    return save_path


# ==============================
# 8) 저장
# ==============================
def save_result_table(df: pd.DataFrame, save_dir: str) -> str:
    today_str = dt.datetime.now().strftime("%Y%m%d")
    csv_path = os.path.join(save_dir, f"KR_Momentum_Map_v2_{today_str}.csv")
    df.to_csv(csv_path, index=False, encoding="utf-8-sig")
    logging.info("테이블 저장 완료: %s", csv_path)
    return csv_path


# ==============================
# 9) 실행부
# ==============================
def main() -> None:
    setup_logging()
    setup_korean_font()
    save_dir = resolve_save_dir()

    config = MomentumMapConfig(
        benchmark_name="코스피200",
        ultra_short_window=5,            # ★ 추가
        short_window=20,
        mid_window=60,
        long_window=120,
        trend_window=60,
        volatility_window=20,
        liquidity_window=20,
        min_avg_trading_value_krw=2_000_000_000,
        top_n_rank_box=10,
        label_all_eligible=True,
        label_top_ineligible=2,
        min_bubble_size=320,
        max_bubble_size=3200,
        save_csv=True,
        save_png=True,
    )

    result_df = calculate_momentum_map(ETF_UNIVERSE, config)

    display_cols = [
        "Rank",
        "Sector",
        "ETFName",
        "Code",
        "RS_20(%p)",
        "RS_60(%p)",
        "RS_120(%p)",
        "Acceleration(bps/day)",
        "TrendQuality",
        "AvgTradingValue(억원)",
        "Quadrant",
        "MomentumScore",
        "Eligible",
    ]

    print("\n[Top 10 Momentum Score]")
    print(result_df.loc[result_df["Eligible"]].sort_values("MomentumScore", ascending=False)[display_cols].head(10))

    if config.save_csv:
        save_result_table(result_df, save_dir)
    plot_momentum_map(result_df, config, save_dir)


if __name__ == "__main__":
    main()


# 텔레그램 전송
import requests, glob

def send_telegram():
    if os.environ.get("MOMENTUM_ENABLE_TELEGRAM") != "1":
        print("텔레그램 전송 생략")
        return

    TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not TOKEN:
        print("텔레그램 토큰 없음 - 전송 생략")
        return

    CHAT_ID_LIST = ["1143521164", "6339079627", "5234880171", "@East_Research"]
    import datetime
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    save_dir = os.environ.get("MOMENTUM_OUTPUT_DIR") or os.path.join(
        os.path.expanduser("~"),
        "Desktop",
        "Python_Global",
    )
    files = glob.glob(f"{save_dir}/KR_Momentum_Map_v2_{today_str}.png")
    if files:
        img_path = files[-1]
        date_label = datetime.datetime.now().strftime("%Y-%m-%d")
        for cid in CHAT_ID_LIST:
            with open(img_path, "rb") as photo:
                requests.post(
                    f"https://api.telegram.org/bot{TOKEN}/sendPhoto",
                    data={"chat_id": cid, "caption": f"KR Momentum Map ({date_label})"},
                    files={"photo": photo}
                )
        print("텔레그램 전송 완료!")
    else:
        print("이미지 파일을 찾을 수 없습니다.")

if os.environ.get("MOMENTUM_ENABLE_TELEGRAM") == "1":
    send_telegram()
