from __future__ import annotations

import holidays
from datetime import date as _date
_kr_holidays = holidays.KR()
if _date.today() in _kr_holidays:
    print(f"오늘은 공휴일 ({_kr_holidays[_date.today()]}) — 종료")
    exit()

"""
KR_Sector_ZScore_Thermometer.py  v2
──────────────────────────────────────
EMA20 괴리율 Z-Score 온도계 차트.
KR_Momentum_Map 실행 후 CSV를 읽어 사분면 자동 연동.

출력: KR_Sector_ZScore_{YYYYMMDD}.png → Desktop/Python_Global/
전송: 텔레그램 East_Research 채널
"""

import datetime as dt
import glob
import logging
import os
import platform
import requests

import FinanceDataReader as fdr
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
import pandas as pd
from matplotlib import font_manager


# ─────────────────────────────────────────────
# 1) 유니버스
# ─────────────────────────────────────────────
ASSET_CATALOG = [
    {"sector": "반도체",         "ticker": "091160"},
    {"sector": "반도체 후공정",   "ticker": "475310"},
    {"sector": "반도체 전공정",   "ticker": "475300"},
    {"sector": "반도체 소부장",   "ticker": "455850"},
    {"sector": "조선",            "ticker": "494670"},
    {"sector": "방산",            "ticker": "449450"},
    {"sector": "원자력",          "ticker": "424960"},
    {"sector": "은행",            "ticker": "091170"},
    {"sector": "증권",            "ticker": "102970"},
    {"sector": "보험",            "ticker": "140700"},
    {"sector": "2차전지 제조",    "ticker": "305720"},
    {"sector": "2차전지 소재",    "ticker": "462010"},
    {"sector": "철강",            "ticker": "117680"},
    {"sector": "에너지 화학",     "ticker": "139250"},
    {"sector": "건설",            "ticker": "139220"},
    {"sector": "화장품",          "ticker": "228790"},
    {"sector": "전력설비",        "ticker": "487240"},
    {"sector": "친환경",          "ticker": "457990"},
    {"sector": "코스닥150",       "ticker": "229200"},
    {"sector": "로봇",            "ticker": "445290"},
    {"sector": "엔터",            "ticker": "475050"},
    {"sector": "우주",            "ticker": "421320"},
    {"sector": "게임",            "ticker": "364990"},
    {"sector": "인터넷",          "ticker": "365000"},
    {"sector": "지주사",          "ticker": "307520"},
    {"sector": "바이오",          "ticker": "462900"},
    {"sector": "자동차",          "ticker": "466930"},
    {"sector": "2차전지 전고체",  "ticker": "0005D0"},
]

TOKEN    = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_IDS = ["1143521164", "6339079627", "5234880171", "@East_Research"]
SAVE_DIR   = os.environ.get("MOMENTUM_OUTPUT_DIR") or os.path.join(os.path.expanduser("~"), "Desktop", "Python_Global")
TODAY_STR  = dt.datetime.now().strftime("%Y%m%d")
DATE_LABEL = dt.datetime.now().strftime("%Y-%m-%d")

FETCH_BUFFER = 300   # 히스토리 fetch 일수
EMA_W        = 20    # EMA 창
Z_W          = 20    # Z-Score 롤링 창


# ─────────────────────────────────────────────
# 2) 환경 설정
# ─────────────────────────────────────────────
def setup_font() -> None:
    system = platform.system().lower()
    candidates = (
        ["AppleGothic", "NanumGothic"] if system == "darwin"
        else ["Malgun Gothic", "NanumGothic"] if system == "windows"
        else ["NanumGothic", "DejaVu Sans"]
    )
    available = {f.name for f in font_manager.fontManager.ttflist}
    for name in candidates:
        if name in available:
            plt.rc("font", family=name)
            break
    plt.rcParams["axes.unicode_minus"] = False


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%H:%M:%S",
    )


# ─────────────────────────────────────────────
# 3) 데이터 & 지표 계산
# ─────────────────────────────────────────────
def fetch_close(ticker: str, start: str) -> pd.Series:
    df = fdr.DataReader(ticker, start)
    if df.empty or "Close" not in df.columns:
        raise ValueError(f"데이터 없음: {ticker}")
    return df["Close"].dropna()


def calc_zscore(close: pd.Series) -> pd.Series:
    """Pine Script Disparity Z-Score 20 로직"""
    ema    = close.ewm(span=EMA_W, adjust=False).mean()
    disp   = (close - ema) / ema * 100.0
    mean_d = disp.rolling(Z_W).mean()
    std_d  = disp.rolling(Z_W).std(ddof=0).replace(0, np.nan)
    return (disp - mean_d) / std_d


# KR_Momentum_Map CSV의 Quadrant 표기를 내부 키로 통일
QUAD_NORMALIZE = {
    "리더":       "리더",
    "강세 둔화":  "강세둔화",
    "강세둔화":   "강세둔화",
    "회복 후보":  "회복후보",
    "회복후보":   "회복후보",
    "약세 지속":  "약세",
    "약세지속":   "약세",
    "약세":       "약세",
}


def load_quadrants() -> dict:
    """오늘 KR_Momentum_Map CSV에서 사분면 정보 로드"""
    files = sorted(glob.glob(
        os.path.join(SAVE_DIR, f"KR_Momentum_Map_v2_{TODAY_STR}.csv")
    ))
    if not files:
        logging.warning("오늘 맵 CSV 없음 — 전체 Z-Score 순 정렬")
        return {}
    df = pd.read_csv(files[-1])
    if "Sector" not in df.columns or "Quadrant" not in df.columns:
        logging.warning("CSV에 Sector/Quadrant 컬럼 없음")
        return {}
    df["Quadrant"] = df["Quadrant"].map(QUAD_NORMALIZE).fillna("기타")
    return dict(zip(df["Sector"], df["Quadrant"]))


def collect_data() -> pd.DataFrame:
    start = (dt.datetime.now() - dt.timedelta(days=FETCH_BUFFER)).strftime("%Y-%m-%d")
    rows  = []
    for item in ASSET_CATALOG:
        sector, ticker = item["sector"], item["ticker"]
        try:
            close  = fetch_close(ticker, start)
            z_ser  = calc_zscore(close)
            z_now  = float(z_ser.iloc[-1])
            z_prev = float(z_ser.iloc[-2]) if len(z_ser) >= 2 else z_now
            rows.append({
                "sector":  sector,
                "z_now":   round(z_now,  2),
                "rising":  z_now > z_prev,
            })
            logging.info("완료: %-14s  Z=%+.2f", sector, z_now)
        except Exception as e:
            logging.warning("실패: %s (%s) — %s", sector, ticker, e)

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    quad_map = load_quadrants()
    if quad_map:
        df["quadrant"] = df["sector"].map(quad_map).fillna("기타")
    else:
        df["quadrant"] = "전체"
    return df


# ─────────────────────────────────────────────
# 4) 시각화
# ─────────────────────────────────────────────
QUAD_ORDER = ["리더", "강세둔화", "회복후보", "약세", "전체", "기타"]
QUAD_LABEL = {
    "리더":    "1사분면 — 리더",
    "강세둔화": "4사분면 — 강세 둔화",
    "회복후보": "2사분면 — 회복 후보",
    "약세":    "3사분면 — 약세",
    "전체":    "전체 섹터",
    "기타":    "기타",
}

def z_color(z: float) -> str:
    if   z >=  2.5: return "#C0392B"
    elif z >=  2.0: return "#E74C3C"
    elif z >=  1.5: return "#E67E22"
    elif z >=  0.5: return "#F39C12"
    elif z >= -0.5: return "#95A5A6"
    elif z >= -1.5: return "#27AE60"
    elif z >= -2.0: return "#2980B9"
    else:           return "#1A5276"

Z_MIN, Z_MAX = -3.5, 3.5

def z_frac(z: float) -> float:
    return (np.clip(float(z), Z_MIN, Z_MAX) - Z_MIN) / (Z_MAX - Z_MIN)


def build_chart(df: pd.DataFrame, save_path: str) -> None:
    setup_font()

    quads_present = [q for q in QUAD_ORDER
                     if q in df["quadrant"].values]
    N  = len(df)
    ND = len(quads_present)

    # ── 레이아웃 비율 (axes 0~1 좌표) ────────────
    TITLE_F  = 0.042
    HEADER_F = 0.042
    DIV_F    = 0.028
    BOT_PAD  = 0.025
    usable   = 1.0 - TITLE_F - HEADER_F - BOT_PAD
    ROW_F    = (usable - ND * DIV_F) / max(N, 1)

    LABEL_W  = 0.155
    TRACK_X0 = LABEL_W + 0.008
    TRACK_X1 = 0.840
    TRACK_W  = TRACK_X1 - TRACK_X0
    VAL_X    = TRACK_X1 + 0.012   # Z 수치 (트랙 바깥 오른쪽)
    ARROW_X  = TRACK_X1 + 0.052   # ▲▼

    fig_h = max(7.0, N * 0.36 + ND * 0.28 + 1.6)
    fig, ax = plt.subplots(figsize=(13, fig_h))
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    fig.patch.set_facecolor("white")
    T = ax.transAxes

    # ── 제목 ──────────────────────────────────────
    ax.text(0.5, 0.978,
            f"섹터 과열도  —  Disparity Z-Score 20    ({DATE_LABEL})",
            ha="center", va="top", fontsize=13,
            fontweight="bold", transform=T)

    # ── σ 눈금 헤더 ───────────────────────────────
    header_y = 1.0 - TITLE_F - HEADER_F * 0.2
    for s in [-3, -2.5, -2, -1, 0, 1, 2, 2.5, 3]:
        xp  = TRACK_X0 + z_frac(s) * TRACK_W
        lbl = f"{s:+g}σ" if s != 0 else "0"
        ax.text(xp, header_y, lbl,
                ha="center", va="bottom", fontsize=7.5,
                color="#444444" if s == 0 else "#888888",
                transform=T)
        ax.plot([xp, xp], [header_y - 0.016, header_y - 0.004],
                color="#cccccc", lw=0.7, transform=T)

    # ── 배경 존 ───────────────────────────────────
    content_h = 1.0 - TITLE_F - HEADER_F - BOT_PAD
    content_y = BOT_PAD
    for z_lo, z_hi, col, alpha in [
        ( 2.0,  3.5, "#E74C3C", 0.08),
        ( 2.5,  3.5, "#C0392B", 0.05),
        (-3.5, -2.0, "#2980B9", 0.08),
        (-3.5, -2.5, "#1A5276", 0.05),
    ]:
        x0 = TRACK_X0 + z_frac(z_lo) * TRACK_W
        x1 = TRACK_X0 + z_frac(z_hi) * TRACK_W
        ax.add_patch(mpatches.FancyBboxPatch(
            (x0, content_y), x1 - x0, content_h,
            boxstyle="square,pad=0", linewidth=0,
            facecolor=col, alpha=alpha,
            zorder=0, transform=T))

    # ── σ 수직선 ──────────────────────────────────
    for s, lw, ls, col in [
        (-2,   0.7, "--", "#cccccc"),
        ( 2,   0.7, "--", "#cccccc"),
        (-2.5, 0.9, "-",  "#c0c0c0"),
        ( 2.5, 0.9, "-",  "#c0c0c0"),
        ( 0,   1.0, "-",  "#999999"),
    ]:
        xp = TRACK_X0 + z_frac(s) * TRACK_W
        ax.plot([xp, xp], [content_y, content_y + content_h],
                color=col, lw=lw, ls=ls, zorder=1, transform=T)

    # ── 섹터 행 ───────────────────────────────────
    cur_y = 1.0 - TITLE_F - HEADER_F

    for quad in quads_present:
        sub = df[df["quadrant"] == quad].sort_values("z_now", ascending=False)
        if sub.empty:
            continue

        # 사분면 구분 헤더
        cur_y -= DIV_F
        ax.text(TRACK_X0, cur_y + DIV_F * 0.65,
                QUAD_LABEL.get(quad, quad),
                ha="left", va="center", fontsize=8,
                color="#777777", fontstyle="italic", transform=T)
        ax.plot([TRACK_X0, TRACK_X1],
                [cur_y + DIV_F * 0.12] * 2,
                color="#e0e0e0", lw=0.6, transform=T)

        for _, row in sub.iterrows():
            z   = float(row["z_now"])
            col = z_color(z)
            xp  = TRACK_X0 + z_frac(z) * TRACK_W
            x0z = TRACK_X0 + z_frac(0) * TRACK_W

            row_top = cur_y
            row_bot = cur_y - ROW_F
            row_cy  = (row_top + row_bot) / 2
            PAD_V   = ROW_F * 0.10

            # 트랙 배경
            ax.add_patch(mpatches.FancyBboxPatch(
                (TRACK_X0, row_bot + PAD_V),
                TRACK_W, ROW_F - 2 * PAD_V,
                boxstyle="square,pad=0", linewidth=0.3,
                edgecolor="#e8e8e8", facecolor="#f8f8f8",
                zorder=2, transform=T))

            # 채움 바 (0선 → 현재값)
            ax.add_patch(mpatches.FancyBboxPatch(
                (min(x0z, xp), row_bot + ROW_F * 0.2),
                abs(xp - x0z), ROW_F * 0.6,
                boxstyle="square,pad=0", linewidth=0,
                facecolor=col, alpha=0.38,
                zorder=3, transform=T))

            # 바늘
            ax.plot([xp, xp],
                    [row_bot + PAD_V, row_top - PAD_V],
                    color=col, lw=2.5, solid_capstyle="round",
                    zorder=4, transform=T)

            # 섹터명 (왼쪽)
            ax.text(TRACK_X0 - 0.010, row_cy,
                    row["sector"],
                    ha="right", va="center", fontsize=9,
                    color="#333333", transform=T)

            # Z 수치 (트랙 바깥 오른쪽)
            ax.text(VAL_X, row_cy,
                    f"{z:+.2f}",
                    ha="left", va="center", fontsize=8,
                    color=col, fontweight="bold",
                    zorder=5, transform=T)

            # ▲▼ 방향 화살표
            ax.text(ARROW_X, row_cy,
                    "▲" if row["rising"] else "▼",
                    ha="center", va="center", fontsize=9,
                    color="#1D9E75" if row["rising"] else "#E24B4A",
                    zorder=5, transform=T)

            cur_y -= ROW_F

    # ── 범례 ──────────────────────────────────────
    ax.legend(
        handles=[
            mpatches.Patch(color="#E74C3C", alpha=0.7, label="+2σ 이상   과열"),
            mpatches.Patch(color="#95A5A6", alpha=0.7, label=" 0 부근     중립"),
            mpatches.Patch(color="#2980B9", alpha=0.7, label="-2σ 이하   과매도"),
        ],
        loc="lower right", fontsize=8,
        framealpha=0.88, edgecolor="#dddddd",
        bbox_to_anchor=(0.997, 0.004),
    )

    os.makedirs(SAVE_DIR, exist_ok=True)
    plt.savefig(save_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close()
    logging.info("저장 완료: %s", save_path)


# ─────────────────────────────────────────────
# 5) 텔레그램 전송
# ─────────────────────────────────────────────
def send_photo(path: str, caption: str = "") -> None:
    if os.environ.get("MOMENTUM_ENABLE_TELEGRAM") != "1" or not TOKEN:
        logging.info("텔레그램 전송 생략")
        return

    for cid in CHAT_IDS:
        try:
            with open(path, "rb") as f:
                requests.post(
                    f"https://api.telegram.org/bot{TOKEN}/sendPhoto",
                    data={"chat_id": cid, "caption": caption},
                    files={"photo": f},
                    timeout=30,
                )
        except Exception as e:
            logging.warning("텔레그램 전송 실패 (%s): %s", cid, e)


# ─────────────────────────────────────────────
# 6) 메인
# ─────────────────────────────────────────────
def main() -> None:
    setup_logging()
    logging.info("=== KR Sector Z-Score Thermometer v2 시작 ===")

    df = collect_data()
    if df.empty:
        logging.error("데이터 없음 — 종료")
        return

    save_path = os.path.join(SAVE_DIR, f"KR_Sector_ZScore_{TODAY_STR}.png")
    build_chart(df, save_path)
    send_photo(save_path, f"📊 섹터 과열도 Z-Score ({DATE_LABEL})")
    logging.info("전송 완료!")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        msg = f"⚠️ ZScore Thermometer 실패\n{e}"
        logging.error(msg)
        if os.environ.get("MOMENTUM_ENABLE_TELEGRAM") != "1" or not TOKEN:
            raise
        for cid in CHAT_IDS:
            try:
                requests.post(
                    f"https://api.telegram.org/bot{TOKEN}/sendMessage",
                    data={"chat_id": cid, "text": msg},
                    timeout=10,
                )
            except Exception:
                pass
