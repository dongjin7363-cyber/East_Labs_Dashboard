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
    <ReportBody markdown={report.body_markdown.slice(offset)} />
  </>;
}
