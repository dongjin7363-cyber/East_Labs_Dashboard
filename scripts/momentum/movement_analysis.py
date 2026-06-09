import holidays
from datetime import date as _date
_kr_holidays = holidays.KR()
if _date.today() in _kr_holidays:
    print(f"오늘은 공휴일 ({_kr_holidays[_date.today()]}) — 종료")
    exit()

"""
movement_analysis.py
────────────────────
어제 vs 오늘 KR_Momentum_Map CSV를 비교해서
1) 화살표 차트 이미지 생성
2) Claude API로 분석 텍스트 생성
3) 텔레그램으로 이미지 + 텍스트 전송
"""

import datetime, glob, os, requests, json
import pandas as pd
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
CHAT_ID_LIST = ["1143521164", "6339079627", "5234880171", "@East_Research"]
SAVE_DIR = os.environ.get("MOMENTUM_OUTPUT_DIR") or os.path.join(os.path.expanduser("~"), "Desktop", "Python_Global")
TODAY = datetime.datetime.now()
TODAY_STR = TODAY.strftime("%Y%m%d")
DATE_LABEL = TODAY.strftime("%Y-%m-%d")
EXCLUDED = {"코스피200","S&P500","나스닥","Gold","WTI","BTC","ETH"}

def get_prev_day(today):
    import holidays
    kr_holidays = holidays.KR()
    prev = today - datetime.timedelta(days=1)
    while prev.weekday() >= 5 or prev.date() in kr_holidays:
        prev -= datetime.timedelta(days=1)
    return prev.strftime("%Y%m%d")

YESTERDAY_STR = get_prev_day(TODAY)

def send_message(text):
    if os.environ.get("MOMENTUM_ENABLE_TELEGRAM") != "1" or not TOKEN:
        print("텔레그램 메시지 전송 생략")
        return

    for cid in CHAT_ID_LIST:
        requests.post(f"https://api.telegram.org/bot{TOKEN}/sendMessage",
            data={"chat_id": cid, "text": text}, timeout=20)

def send_photo(path, caption=""):
    if os.environ.get("MOMENTUM_ENABLE_TELEGRAM") != "1" or not TOKEN:
        print("텔레그램 사진 전송 생략")
        return

    for cid in CHAT_ID_LIST:
        with open(path, "rb") as photo:
            requests.post(f"https://api.telegram.org/bot{TOKEN}/sendPhoto",
                data={"chat_id": cid, "caption": caption},
                files={"photo": photo}, timeout=30)

def load_map(date_str):
    files = glob.glob(os.path.join(SAVE_DIR, f"KR_Momentum_Map_v2_{date_str}.csv"))
    if not files:
        return None
    df = pd.read_csv(files[0])
    df = df[~df["Sector"].isin(EXCLUDED)]
    return df[df["Eligible"] == True].copy()

def calc_movement(prev, today):
    p = prev.set_index("Sector")[["Quadrant","RS_20(%p)","Acceleration(bps/day)","MomentumScore"]]
    t = today.set_index("Sector")[["Quadrant","RS_20(%p)","Acceleration(bps/day)","MomentumScore"]]
    m = p.join(t, lsuffix="_prev", rsuffix="_today", how="inner")
    m["dRS"] = m["RS_20(%p)_today"] - m["RS_20(%p)_prev"]
    m["dAcc"] = m["Acceleration(bps/day)_today"] - m["Acceleration(bps/day)_prev"]
    m["dScore"] = m["MomentumScore_today"] - m["MomentumScore_prev"]
    m["changed"] = m["Quadrant_prev"] != m["Quadrant_today"]
    m["dist"] = np.sqrt(m["dRS"]**2 + (m["dAcc"]/10)**2)
    return m.reset_index()

def select_focus_sectors(mv, n_dist=8):
    """
    주요 섹터 선택 로직:
      1) 사분면 변화 섹터 전부
      2) 오늘 1사분면 중 dist 상위 3개
      3) 전체 dist 상위 n_dist개
    → 합집합, 최대 12개
    """
    changed   = set(mv[mv["changed"]]["Sector"].tolist())
    leaders   = set(mv[mv["Quadrant_today"] == "리더"].nlargest(3, "dist")["Sector"].tolist())
    top_dist  = set(mv.nlargest(n_dist, "dist")["Sector"].tolist())
    focus     = changed | leaders | top_dist
    # 최대 12개로 cap — dist 기준 정렬
    ordered   = mv[mv["Sector"].isin(focus)].sort_values("dist", ascending=False)
    return set(ordered.head(12)["Sector"].tolist())


def build_chart(mv, save_path):
    plt.rc("font", family="AppleGothic")
    plt.rcParams["axes.unicode_minus"] = False

    fig, ax = plt.subplots(figsize=(13, 9))
    ax.set_facecolor("white")
    for spine in ax.spines.values():
        spine.set_edgecolor("#dddddd")

    # ── 축 범위 ──────────────────────────────────────
    xlim = max(abs(mv["RS_20(%p)_today"].max()),
               abs(mv["RS_20(%p)_today"].min()), 15) * 1.25
    ylim = max(abs(mv["Acceleration(bps/day)_today"].max()),
               abs(mv["Acceleration(bps/day)_today"].min()), 30) * 1.25
    ax.set_xlim(-xlim, xlim)
    ax.set_ylim(-ylim, ylim)

    # ── 사분면 배경 음영 ─────────────────────────────
    quad_fills = [
        (0, xlim, 0, ylim,  "#1D9E75", "1사분면  리더",      "right", "top"),
        (-xlim, 0, 0, ylim, "#378ADD", "2사분면  회복 후보",  "left",  "top"),
        (-xlim, 0, -ylim, 0,"#888888", "3사분면  약세 지속",  "left",  "bottom"),
        (0, xlim, -ylim, 0, "#EF9F27", "4사분면  강세 둔화",  "right", "bottom"),
    ]
    for x0, x1, y0, y1, col, lbl, ha, va in quad_fills:
        ax.fill_between([x0, x1], [y0, y0], [y1, y1],
                        color=col, alpha=0.04, zorder=0)
        px = xlim * 0.93 * (1 if ha == "right" else -1)
        py = ylim * 0.93 * (1 if va == "top"   else -1)
        ax.text(px, py, lbl, ha=ha, va=va,
                fontsize=9, color=col, alpha=0.65)

    ax.axhline(0, color="#bbbbbb", linewidth=1.0, linestyle="--", zorder=1)
    ax.axvline(0, color="#bbbbbb", linewidth=1.0, linestyle="--", zorder=1)
    ax.grid(True, color="#eeeeee", lw=0.6, zorder=1)

    # ── 섹터 색상 ────────────────────────────────────
    def get_color(row):
        if row["changed"]:
            if   row["Quadrant_today"] == "리더":  return "#1D9E75"
            elif row["Quadrant_prev"]  == "리더":  return "#E24B4A"
            else:                                   return "#378ADD"
        elif row["dAcc"] >  5: return "#1D9E75"
        elif row["dAcc"] < -5: return "#EF9F27"
        else:                   return "#AAAAAA"

    # ── 주요 섹터 선택 ───────────────────────────────
    focus = select_focus_sectors(mv)
    bg    = mv[~mv["Sector"].isin(focus)]
    fg    = mv[ mv["Sector"].isin(focus)]

    # ── 배경 섹터 — 오늘 위치 점만 (흐리게) ──────────
    for _, row in bg.iterrows():
        ax.scatter(row["RS_20(%p)_today"],
                   row["Acceleration(bps/day)_today"],
                   s=28, color="#cccccc", alpha=0.5,
                   zorder=2, linewidths=0)

    # ── 주요 섹터 — 화살표 + 라벨 ───────────────────
    for _, row in fg.iterrows():
        x1, y1 = row["RS_20(%p)_prev"],  row["Acceleration(bps/day)_prev"]
        x2, y2 = row["RS_20(%p)_today"], row["Acceleration(bps/day)_today"]
        color  = get_color(row)

        # 출발점 (반투명)
        ax.scatter(x1, y1, s=35, color=color, alpha=0.30,
                   zorder=3, linewidths=0)
        # 도착점 (진하게)
        ax.scatter(x2, y2, s=80, color=color, alpha=0.92,
                   zorder=5, edgecolors="white", linewidths=0.8)

        # 화살표
        ax.annotate("",
            xy=(x2, y2), xytext=(x1, y1),
            arrowprops=dict(
                arrowstyle="-|>",
                color=color, lw=1.6,
                alpha=0.80,
                mutation_scale=10,
            ),
            zorder=4,
        )

        # 라벨
        q_arrow = ""
        if row["changed"]:
            q_arrow = " ↑" if row["Quadrant_today"] == "리더" else " ↓"
        label = row["Sector"] + q_arrow

        # 라벨 위치: 오른쪽 기본, 오른쪽 경계 가까우면 왼쪽
        offset = xlim * 0.022
        if x2 > xlim * 0.75:
            ha, lx = "right", x2 - offset * 0.5
        else:
            ha, lx = "left",  x2 + offset

        ax.text(lx, y2, label,
                fontsize=9,
                fontweight="bold" if row["changed"] else "normal",
                color=color, ha=ha, va="center",
                zorder=6,
                bbox=dict(boxstyle="round,pad=0.15",
                          facecolor="white", edgecolor="none", alpha=0.75))

    # ── 범례 ─────────────────────────────────────────
    legend_elements = [
        mpatches.Patch(color="#1D9E75", label="1사분면 진입 / 가속"),
        mpatches.Patch(color="#E24B4A", label="1사분면 이탈 / 하락"),
        mpatches.Patch(color="#378ADD", label="회복 후보 진입"),
        mpatches.Patch(color="#EF9F27", label="강세 둔화 / 주의"),
        mpatches.Patch(color="#AAAAAA", label="변화 미미"),
        mpatches.Patch(color="#cccccc", label="비주요 (배경)", alpha=0.5),
    ]
    ax.legend(handles=legend_elements,
              loc="lower right", fontsize=8.5,
              framealpha=0.92, edgecolor="#dddddd",
              bbox_to_anchor=(0.99, 0.01))

    ax.set_xlabel("RS 20D vs 코스피200 (%p)", fontsize=11, color="#555555", labelpad=8)
    ax.set_ylabel("Acceleration (bps/day)",    fontsize=11, color="#555555", labelpad=8)
    ax.tick_params(colors="#888888", labelsize=9)
    ax.set_title(
        f"Momentum Movement  :  "
        f"{YESTERDAY_STR[:4]}-{YESTERDAY_STR[4:6]}-{YESTERDAY_STR[6:]}  →  "
        f"{TODAY_STR[:4]}-{TODAY_STR[4:6]}-{TODAY_STR[6:]}",
        fontsize=14, fontweight="bold", pad=16, color="#1a1a1a",
    )

    plt.tight_layout()
    plt.savefig(save_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close()
    print(f"차트 저장: {save_path}")

def generate_analysis(mv):
    notable = mv.nlargest(12, "dist")[["Sector","Quadrant_prev","Quadrant_today","RS_20(%p)_prev","RS_20(%p)_today","Acceleration(bps/day)_prev","Acceleration(bps/day)_today","dRS","dAcc","dScore","changed"]].to_dict(orient="records")
    changed = mv[mv["changed"]][["Sector","Quadrant_prev","Quadrant_today","dRS","dAcc"]].to_dict(orient="records")

    prompt = f"""아래 데이터를 보고 섹터 모멘텀 변화를 분석해서 지정된 형식으로만 출력하세요.

날짜: {YESTERDAY_STR[:4]}-{YESTERDAY_STR[4:6]}-{YESTERDAY_STR[6:]} → {TODAY_STR[:4]}-{TODAY_STR[4:6]}-{TODAY_STR[6:]}

[사분면 변화]
{json.dumps(changed, ensure_ascii=False)}

[주요 변화 TOP12]
{json.dumps(notable, ensure_ascii=False)}

출력 형식 (이 형식 외 다른 텍스트 금지):

[{DATE_LABEL}] 무브먼트 분석

🔴 중요 변화
- 섹터명: 키워드

🟢 강세 / 개선
- 섹터명: 키워드

🟠 둔화 / 주의
- 섹터명: 키워드

💡 핵심 해석: (1문장)

규칙:
- 수치 언급 금지
- 각 섹터당 키워드 3단어 이내
- 핵심 해석은 1문장"""

    try:
        api_key = os.environ.get("ANTHROPIC_API_KEY", "")
        if os.environ.get("MOMENTUM_DISABLE_AI") == "1" or not api_key:
            raise RuntimeError("Anthropic analysis disabled")

        resp = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={"Content-Type":"application/json","anthropic-version":"2023-06-01","x-api-key":api_key},
            json={"model":"claude-sonnet-4-5","max_tokens":1000,
                  "messages":[{"role":"user","content":prompt}]},
            timeout=30)
        return resp.json()["content"][0]["text"]
    except Exception as e:
        print(f"API 오류: {e}")
        lines = [f"[{DATE_LABEL}] 무브먼트 분석\n"]
        changed_list = mv[mv["changed"]][["Sector","Quadrant_prev","Quadrant_today","dRS","dAcc"]]
        if not changed_list.empty:
            lines.append("🔴 사분면 변화")
            for _, r in changed_list.iterrows():
                lines.append(f"• {r['Sector']}: {r['Quadrant_prev']}→{r['Quadrant_today']} (RS{r['dRS']:+.1f}, 가속도{r['dAcc']:+.0f})")
        top_up = mv[mv["dAcc"]>10].nlargest(3,"dAcc")
        if not top_up.empty:
            lines.append("\n🟢 가속도 개선")
            for _, r in top_up.iterrows():
                lines.append(f"• {r['Sector']}: +{r['dAcc']:.0f}bps")
        top_dn = mv[mv["dAcc"]<-10].nsmallest(3,"dAcc")
        if not top_dn.empty:
            lines.append("\n🟠 가속도 둔화")
            for _, r in top_dn.iterrows():
                lines.append(f"• {r['Sector']}: {r['dAcc']:.0f}bps")
        return "\n".join(lines)

def main():
    print(f"어제: {YESTERDAY_STR}, 오늘: {TODAY_STR}")
    df_prev = load_map(YESTERDAY_STR)
    df_today = load_map(TODAY_STR)
    if df_prev is None:
        send_message(f"⚠️ 어제({YESTERDAY_STR}) CSV 없음"); return
    if df_today is None:
        send_message(f"⚠️ 오늘({TODAY_STR}) CSV 없음"); return
    mv = calc_movement(df_prev, df_today)
    print(f"비교 섹터: {len(mv)}개")
    chart_path = os.path.join(SAVE_DIR, f"KR_Movement_{YESTERDAY_STR}_to_{TODAY_STR}.png")
    build_chart(mv, chart_path)
    print("분석 중...")
    text = generate_analysis(mv)
    print(text)
    send_photo(chart_path, caption=f"📊 무브먼트 ({YESTERDAY_STR[4:6]}/{YESTERDAY_STR[6:]} → {TODAY_STR[4:6]}/{TODAY_STR[6:]})")
    send_message(text)
    print("전송 완료!")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        err = f"⚠️ movement_analysis 실패\n{e}"
        print(err)
        send_message(err)
