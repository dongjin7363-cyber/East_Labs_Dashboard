import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatReportDate } from "@/lib/weekly-report/model";
import { getWeeklyReports } from "@/lib/weekly-report/server";
import { getEquityReports } from "@/lib/equity-report/server";

export const metadata: Metadata = { title: "Weekly Report | EAST", description: "Weekly Macro와 Weekly Equity로 읽는 한 주의 경제와 시장." };
export const dynamic = "force-static";

export default async function WeeklyReportPage() {
  const [macroReports, equityReports] = await Promise.all([getWeeklyReports(), getEquityReports()]);
  const categories = [
    { id: "macro", label: "🌏 Weekly Macro", base: "/weekly-report", reports: macroReports },
    { id: "equity", label: "📊 Weekly Equity", base: "/equity-report", reports: equityReports },
  ];
  const archive = categories.flatMap(category => category.reports.slice(1).map(report => ({
    report, category: category.id, label: category.label, href: `${category.base}/${report.published_date}`,
  }))).sort((a, b) => b.report.published_date.localeCompare(a.report.published_date) || a.category.localeCompare(b.category));
  return <section>
    <PageHeader title="Weekly Report" description="경제의 흐름부터 주식과 자산시장까지, 한 주의 핵심을 정리합니다." actions={<span className="weekly-schedule">매주 토요일 07:00 KST</span>} />
    <div className="weekly-latest">
      {categories.map(category => {
        const latest = category.reports[0];
        return latest ? <Link key={category.id} className={`weekly-feature weekly-feature-${category.id}`} href={`${category.base}/${latest.published_date}`}>
          <div className="weekly-eyebrow">LATEST REPORT <span>{category.label}</span></div>
          <time dateTime={latest.published_date}>{formatReportDate(latest.published_date)}</time>
          <h2>{latest.headline}</h2>
          <p>{category.label} · {latest.published_date.replace(/-/g, ".")}</p>
          <span className="weekly-read">리포트 읽기 <span aria-hidden="true">↗</span></span>
        </Link> : <div key={category.id} className="weekly-empty">
          <span className="weekly-eyebrow">{category.label}</span>
          <h2>첫 리포트를 준비하고 있습니다.</h2>
          <p>리포트가 발행되면 이곳에서 볼 수 있습니다.</p>
        </div>;
      })}
    </div>
    <div className="weekly-archive-title"><h2>지난 리포트</h2><span>{archive.length}개</span></div>
    {archive.length ? <div className="weekly-archive">{archive.map(({ report, label, href }) => <Link key={href} className="weekly-card" href={href}>
      <time dateTime={report.published_date}>{formatReportDate(report.published_date)}</time>
      <h3>{report.headline}</h3><p>{label}</p><span className="weekly-read">전체 읽기 <span aria-hidden="true">→</span></span>
    </Link>)}</div> : <p className="weekly-note">이전 리포트가 발행되면 이곳에서 볼 수 있습니다.</p>}
  </section>;
}
