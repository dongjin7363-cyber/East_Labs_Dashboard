import { ReportBody } from "@/components/weekly-report/ReportBody";
import { EquityReport, MarketSeries, weeklyChange } from "@/lib/equity-report/model";

function Sparkline({ series }: { series: MarketSeries }) {
  const values = series.points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const points = values.map((v, i) => `${4 + i / (values.length - 1) * 152},${max === min ? 25 : 46 - (v - min) / (max - min) * 42}`).join(" ");
  return <svg viewBox="0 0 160 50" role="img" aria-label={`${series.label} 관측 추이: ${series.points.map(p => `${p.date} ${p.value}`).join(", ")}`}>
    <title>{`${series.label} · ${series.points[0].date} — ${series.points[series.points.length - 1].date}`}</title>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>;
}
export function EquityBody({ report }: { report: EquityReport }) {
  const marker = "## 01 Weekly Market Dashboard";
  const offset = report.body_markdown.indexOf(marker) + marker.length;
  if (report.schema_version === 2) return <>
    <ReportBody markdown={report.body_markdown.slice(0, offset)} />
    <figure className="equity-performance">
      <figcaption><strong>주간 주요 위험자산 수익률</strong><p>2026년 10월 16일 대비 23일 · BTC는 UTC 일별 종가 기준</p></figcaption>
      <svg viewBox="0 0 760 300" role="img" aria-label={report.performance.map(p => `${p.label} ${p.change}%`).join(", ")}>
        {[3, 0, -3, -6].map(v => <g key={v}><line x1="48" x2="750" y1={30 + (3 - v) * 25} y2={30 + (3 - v) * 25} stroke="#dce3ed" strokeDasharray={v === 0 ? undefined : "4 4"} /><text x="4" y={35 + (3 - v) * 25} fontSize="12" fill="#626b7c">{v}%</text></g>)}
        {report.performance.map((p, i) => {
          const width = 690 / report.performance.length, x = 55 + i * width;
          return <g key={p.label}><rect x={x + 12} y={p.change >= 0 ? 105 - p.change * 25 : 105} width={width - 24} height={Math.abs(p.change) * 25} rx="5" fill="#538fff" /><text x={x + width / 2} y={p.change >= 0 ? 95 - p.change * 25 : 122 - p.change * 25} textAnchor="middle" fontSize="12" fill="#253248">{p.change > 0 ? "+" : ""}{p.change}%</text><text x={x + width / 2} y="286" textAnchor="middle" fontSize="12" fill="#626b7c">{p.label}</text></g>;
        })}
      </svg>
      <p>원문 표에 주간 변화율이 명시된 자산 · 금은 약 -4.0%</p>
    </figure>
    <ReportBody markdown={report.body_markdown.slice(offset)} initialMarketData />
  </>;
  return <>
    <ReportBody markdown={report.body_markdown.slice(0, offset)} />
    <div className="equity-dashboard">{report.dashboard.map(s => {
      const change = weeklyChange(s), last = s.points[s.points.length - 1];
      return <section className="equity-asset" key={s.id}>
        <h3>{s.label}</h3>
        <div className="equity-close">{last.value.toLocaleString("en-US", { maximumFractionDigits: 3 })} <small>{s.unit}</small></div>
        <div className={change > 0 ? "equity-up" : change < 0 ? "equity-down" : ""}>{change > 0 ? "+" : ""}{change.toFixed(2)}{s.kind === "yield" ? " bp · 주간 금리 변화" : "% · 주간 수익률"}</div>
        <Sparkline series={s} />
        <details><summary>관측치 · 출처</summary><table><caption>{s.label} {s.unit}</caption><thead><tr><th>기준일</th><th>종가 / 금리</th></tr></thead><tbody>{s.points.map(p => <tr key={p.date}><td>{p.date}</td><td>{p.value}</td></tr>)}</tbody></table></details>
        <p>{s.points[0].date} → {last.date}</p>
        <a href={s.source_url} target="_blank" rel="noopener noreferrer">{s.source_name} ↗</a>
        {s.note && <p>{s.note}</p>}
      </section>;
    })}</div>
    <ReportBody markdown={report.body_markdown.slice(offset)} initialMarketData />
  </>;
}
