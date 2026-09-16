"use client";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LineChart,
  Line,
  LabelList,
} from "recharts";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  QUALITY,
  DELTA,
  LABELS,
  nextUpdate,
  rankSnapshots,
  weekDate,
  type Snapshot,
  type Watch,
  type Ranked,
} from "@/lib/super-stock/model";
import styles from "./super-stock.module.css";
type Data = {
  watchlist: Watch[];
  snapshots: Snapshot[];
  cohorts: { week_date: string; tickers: string[] }[];
  configured: boolean;
  run: {
    status: string;
    completed: string[];
    failed: Record<string, string>;
  } | null;
};
const signed = (value: number | null) =>
  value === null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
const kst = (value: string) =>
  new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
export default function SuperStockPage() {
  const { session, userId, loading: authLoading } = useAuth();
  const [stored, setData] = useState<(Data & { owner: string | null }) | null>(
      null,
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [input, setInput] = useState(""),
    [selected, setSelected] = useState(""),
    [week, setWeek] = useState(""),
    [query, setQuery] = useState("");
  const data = stored?.owner === userId ? stored : null;
  const generation = useRef(0);
  const token = session?.access_token;
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    if (!token) {
      setData(null);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/super-stock", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (id === generation.current) setData({ ...result, owner: userId });
    } catch (e) {
      if (id === generation.current)
        setError(e instanceof Error ? e.message : "연결 실패");
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }, [token, userId]);
  useEffect(() => {
    setData(null);
    setSelected("");
    setWeek("");
    void refresh();
    const counter = generation;
    return () => {
      counter.current++;
    };
  }, [userId, refresh]);
  const mutate = async (ticker: string, active: boolean) => {
    const id = generation.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/super-stock", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ticker, active }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (id === generation.current) {
        setInput("");
        await refresh();
      }
    } catch (e) {
      if (id === generation.current)
        setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    void mutate(input, true);
  };
  const active = data?.watchlist.filter((w) => w.active) ?? [];
  const weeks = useMemo(
    () => data?.cohorts.map((c) => c.week_date) ?? [],
    [data],
  );
  const chosen = week || weeks[0] || weekDate();
  const cohort =
    data?.cohorts.find((c) => c.week_date === chosen)?.tickers ?? [];
  const rows = useMemo(
    () =>
      rankSnapshots(
        data?.snapshots ?? [],
        chosen,
        data?.cohorts.find((c) => c.week_date === chosen)?.tickers ?? [],
      ).map((row) => {
        const previousWeek = new Date(Date.parse(chosen) - 7 * 86400000)
          .toISOString()
          .slice(0, 10);
        const previousCohort =
          data?.cohorts.find((c) => c.week_date === previousWeek)?.tickers ??
          [];
        const prior = rankSnapshots(
          data?.snapshots ?? [],
          previousWeek,
          previousCohort,
        ).find((p) => p.ticker === row.ticker);
        return { ...row, rankChange: prior ? prior.rank - row.rank : null };
      }),
    [data, chosen],
  );
  const filtered = rows.filter((r) => r.ticker.includes(query.toUpperCase()));
  const detail = rows.find((r) => r.ticker === selected) ?? rows[0];
  const history = useMemo(
    () =>
      data?.snapshots
        .filter((s) => s.ticker === detail?.ticker)
        .sort((a, b) => a.week_date.localeCompare(b.week_date)) ?? [],
    [data, detail?.ticker],
  );
  const biggest = [...rows]
    .filter((r) => r.fourWeek !== null)
    .sort((a, b) => (b.fourWeek ?? 0) - (a.fourWeek ?? 0))[0];
  const average = (key: "quality_score" | "delta_score") =>
    rows.length
      ? (rows.reduce((s, r) => s + r[key], 0) / rows.length).toFixed(1)
      : "—";
  return (
    <section className={styles.page}>
      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>
            EAST RESEARCH / WEEKLY INTELLIGENCE
          </span>
          <h1>
            Super Stock<span className={styles.dot}>.</span>
          </h1>
          <p>좋은 기업을 넘어, 빠르게 달라지는 기업을 발견하세요.</p>
        </div>
        <div className={styles.schedule}>
          <span>WEEKLY SNAPSHOT</span>
          <strong>매주 토요일 09:00 KST</strong>
          <small>다음 기준 시각 {kst(nextUpdate())} KST</small>
          <small>최근 분석 {data?.snapshots.length ? kst(data.snapshots.reduce((latest,s)=>s.created_at > latest ? s.created_at : latest,data.snapshots[0].created_at)) + " KST" : "아직 없음"}</small>
        </div>
      </header>
      <div className={styles.formRow}>
        <form onSubmit={add}>
          <label htmlFor="ticker">WATCHLIST</label>
          <div>
            <input
              id="ticker"
              placeholder="티커 입력 · NVDA, BE"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={9}
              disabled={!userId || busy}
            />
            <button disabled={!userId || busy || !input.trim()} type="submit">
              + 종목 추가
            </button>
          </div>
        </form>
        <button
          className={styles.secondary}
          onClick={() => void refresh()}
          disabled={!userId || loading}
        >
          {loading ? "불러오는 중…" : "데이터 새로고침"}
        </button>
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <button onClick={() => void refresh()}>다시 시도</button>
        </div>
      )}
      {authLoading ? (
        <div className={styles.notice}>로그인 상태 확인 중…</div>
      ) : !userId ? (
        <div className={styles.notice}>
          로그인하면 관심종목을 등록하고 나만의 주간 랭킹을 확인할 수 있습니다.
        </div>
      ) : data && !data.configured ? (
        <div className={styles.notice}>
          OpenAI 연결 대기 · 관심종목은 저장할 수 있습니다. 연결 완료 후 주간
          분석이 시작됩니다.
        </div>
      ) : null}
      {!!active.length && (
        <div className={styles.chips}>
          {active.map((w) => (
            <span key={w.ticker}>
              {w.ticker}
              <button
                aria-label={`${w.ticker} 관심종목에서 제외`}
                disabled={busy}
                onClick={() => void mutate(w.ticker, false)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.kpis}>
        <Kpi
          label="WATCHLIST"
          value={String(active.length)}
          sub="등록한 관심종목"
        />
        <Kpi
          label="AVG QUALITY"
          value={average("quality_score")}
          sub="기업의 현재 경쟁력 / 40"
        />
        <Kpi
          label="AVG DELTA"
          value={average("delta_score")}
          sub="변화와 가속의 강도 / 40"
        />
        <Kpi
          label="TOP SUPER STOCK"
          value={rows[0]?.ticker ?? "—"}
          sub={
            rows[0]
              ? `${rows[0].super_score.toFixed(1)} / 100`
              : "첫 분석을 기다립니다"
          }
        />
        <Kpi
          label="BIGGEST 4W Δ"
          value={biggest ? signed(biggest.fourWeek) : "—"}
          sub={biggest?.ticker ?? "4주 전 기록이 필요합니다"}
          accent
        />
      </div>
      <div className={styles.mainGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Weekly ranking</h2>
              <p>Quality 30% · Delta 45% · Narrative 15% · Market 10%</p>
            </div>
            <label className={styles.weekLabel}>
              기준 주
              <select
                aria-label="기준 주 선택"
                value={chosen}
                onChange={(e) => {
                  setWeek(e.target.value);
                  setSelected("");
                }}
              >
                {weeks.length ? (
                  weeks.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))
                ) : (
                  <option value={chosen}>{chosen}</option>
                )}
              </select>
            </label>
          </div>
          <div className={styles.tableTools}>
            <input
              aria-label="랭킹 종목 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="종목 검색"
            />
            <span>
              {rows.length} / {cohort.length} 분석 완료
              {rows.length < cohort.length ? " · 미완료 순위" : ""}
            </span>
          </div>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {[
                    "Rank",
                    "Ticker",
                    "Quality",
                    "Delta",
                    "Super Score",
                    "WoW Δ",
                    "4W Δ",
                    "Rank Δ",
                    "Classification",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.ticker}
                    className={
                      detail?.ticker === r.ticker ? styles.selected : ""
                    }
                  >
                    <td>{r.rank.toString().padStart(2, "0")}</td>
                    <td>
                      <button
                        className={styles.tickerButton}
                        onClick={() => setSelected(r.ticker)}
                      >
                        {r.ticker}
                      </button>
                    </td>
                    <td>{r.quality_score.toFixed(1)}</td>
                    <td>{r.delta_score.toFixed(1)}</td>
                    <td>
                      <strong>{r.super_score.toFixed(1)}</strong>
                    </td>
                    <td>
                      <Change value={r.wow} />
                    </td>
                    <td>
                      <Change value={r.fourWeek} />
                    </td>
                    <td>
                      {r.rankChange === null
                        ? "NEW"
                        : r.rankChange === 0
                          ? "—"
                          : `${r.rankChange > 0 ? "▲" : "▼"}${Math.abs(r.rankChange)}`}
                    </td>
                    <td>
                      <span className={styles.badge}>{r.classification}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <div className={styles.empty}>
              <span>↗</span>
              <h3>
                {rows.length
                  ? "검색 결과가 없습니다"
                  : "다음 Super Stock을 찾아보세요"}
              </h3>
              <p>
                {active.length
                  ? "등록한 종목은 다음 토요일 기준 분석에 포함됩니다. 완료된 점수만 랭킹에 표시합니다."
                  : "위에서 관심종목 티커를 추가하면 주간 점수와 변화 이력이 쌓입니다."}
              </p>
            </div>
          )}
          {!!data?.run && (
            <p className={styles.footnote}>
              이번 주 분석:{" "}
              {(
                {
                  running: "진행 중",
                  complete: "완료",
                  partial: "일부 분석 실패",
                  pending: "대기",
                  blocked: "연결 대기",
                } as Record<string, string>
              )[data.run.status] ?? data.run.status}
              {Object.keys(data.run.failed).length
                ? ` · 분석 실패: ${Object.keys(data.run.failed).join(", ")}`
                : ""}
            </p>
          )}
        </article>
        <article className={styles.panel}>
          <div className={styles.panelHead}>
            <div>
              <h2>Quality × Delta</h2>
              <p>기업의 질과 변화의 속도를 함께 봅니다.</p>
            </div>
          </div>
          <div className={styles.mapLegend}>
            <span>↖ High-risk Inflection</span>
            <span>Super Stock ↗</span>
          </div>
          <div className={styles.chart}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart
                margin={{ top: 24, right: 32, bottom: 15, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf2" />
                <XAxis
                  type="number"
                  dataKey="quality_score"
                  domain={[0, 40]}
                  ticks={[0, 10, 20, 30, 40]}
                  name="Quality"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  type="number"
                  dataKey="delta_score"
                  domain={[0, 40]}
                  ticks={[0, 10, 20, 30, 40]}
                  name="Delta"
                  tick={{ fontSize: 11 }}
                  width={30}
                />
                <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                <ReferenceLine x={30} stroke="#94a3b8" strokeDasharray="4 4" />
                <ReferenceLine y={30} stroke="#94a3b8" strokeDasharray="4 4" />
                <Scatter data={rows} fill="#2457e8">
                  <LabelList dataKey="ticker" position="top" fontSize={10} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className={styles.mapLegend}>
            <span>Story / Early Stage</span>
            <span>Compounder →</span>
          </div>
          <p className={styles.footnote}>
            경계 기준: Quality 30 / Delta 30 · 점수가 없는 종목은 표시하지
            않습니다.
          </p>
        </article>
      </div>
      {detail ? (
        <Detail detail={detail} history={history} />
      ) : (
        <div className={styles.method}>
          <h2>From evidence to conviction</h2>
          <div>
            <p>
              <b>01 / Evidence</b>실적·공시·경영진 발언에서 사실과 출처를
              수집합니다.
            </p>
            <p>
              <b>02 / Analyst</b>16개 항목을 평가하고 새 정보의 중요도를
              구분합니다.
            </p>
            <p>
              <b>03 / Judge</b>지난주 근거와 비교해 과도한 변화를 검토합니다.
            </p>
          </div>
        </div>
      )}
      <p className={styles.disclaimer}>
        점수는 공개 자료를 바탕으로 한 AI 분석입니다. 유료 보고서와 비공개
        자료는 포함되지 않을 수 있습니다. 4W Δ는 정확히 4주 전 기록이 있을 때
        표시하며, 과거 점수를 소급 생성하지 않습니다.
      </p>
    </section>
  );
}
function Change({ value }: { value: number | null }) {
  return (
    <span
      className={
        value !== null && value > 0
          ? styles.positive
          : value !== null && value < 0
            ? styles.negative
            : ""
      }
    >
      {signed(value)}
    </span>
  );
}
function Kpi({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div className={`${styles.kpi} ${accent ? styles.accent : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </div>
  );
}
function Detail({
  detail: d,
  history,
}: {
  detail: Ranked;
  history: Snapshot[];
}) {
  return (
    <article className={`${styles.panel} ${styles.detail}`}>
      <div className={styles.detailHead}>
        <div>
          <span className={styles.eyebrow}>STOCK DEEP DIVE</span>
          <h2>
            {d.ticker}
            <span className={styles.badge}>{d.classification}</span>
          </h2>
          <p>{d.thesis}</p>
        </div>
        <div>
          <strong>{d.super_score.toFixed(1)}</strong>
          <span>SUPER SCORE / 100</span>
          <small>분석 신뢰도 {Math.round(d.confidence * 100)}%</small>
        </div>
      </div>
      <div className={styles.detailGrid}>
        <div>
          <h3>
            Quality breakdown <small>{d.quality_score} / 40</small>
          </h3>
          {QUALITY.map((k) => (
            <ComponentBar
              key={k}
              label={LABELS[k]}
              score={d.components[k].score}
              reason={d.components[k].reason}
            />
          ))}
          <h3>
            Delta breakdown <small>{d.delta_score} / 40</small>
          </h3>
          {DELTA.map((k) => (
            <ComponentBar
              key={k}
              label={LABELS[k]}
              score={d.components[k].score}
              reason={d.components[k].reason}
            />
          ))}
        </div>
        <div>
          <h3>
            Score history <small>Weekly snapshot</small>
          </h3>
          <div className={styles.history}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={history}
                margin={{ top: 16, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="week_date"
                  tickFormatter={(v) => v.slice(5)}
                  tick={{ fontSize: 11 }}
                />
                <YAxis domain={[0, 100]} width={30} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  name="Super Score"
                  type="linear"
                  dataKey="super_score"
                  stroke="#2457e8"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <h3>Score change drivers</h3>
          <p className={styles.footnote}>
            각 요인의 기여도는 AI 추정이며 실제 점수 변화의 합계와 다를 수
            있습니다.
          </p>
          {d.drivers.map((v, i) => (
            <div className={styles.driver} key={i}>
              <Change value={v.impact} />
              <span>{v.label}</span>
            </div>
          ))}
          <h3>확인할 리스크</h3>
          <ul className={styles.risks}>
            {d.risks.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.evidenceHeader}>
        <h3>Evidence feed</h3>
        <span>
          {d.evidence.length} SOURCES · {kst(d.created_at)} KST 분석 완료
        </span>
      </div>
      <div className={styles.evidenceGrid}>
        {d.evidence.map((e) => (
          <a
            key={e.id}
            href={e.url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.evidence}
          >
            <div>
              <span>
                {e.source_type.toUpperCase()} · {e.published_at.slice(0, 10)}
              </span>
              <span>↗</span>
            </div>
            <h4>{e.headline}</h4>
            <p>{e.summary}</p>
            <small>
              {e.source} · 중요도 {Math.round(e.materiality * 100)}% ·{" "}
              {e.sentiment}
            </small>
          </a>
        ))}
      </div>
    </article>
  );
}
function ComponentBar({
  label,
  score,
  reason,
}: {
  label: string;
  score: number;
  reason: string;
}) {
  return (
    <details className={styles.component}>
      <summary>
        <span>{label}</span>
        <span className={styles.track}>
          <span style={{ width: `${(score / 5) * 100}%` }} />
        </span>
        <b>{score.toFixed(1)}</b>
      </summary>
      <p>{reason}</p>
    </details>
  );
}
