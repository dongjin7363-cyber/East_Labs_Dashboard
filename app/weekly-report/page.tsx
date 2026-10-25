import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatReportDate } from "@/lib/weekly-report/model";
import { getWeeklyReports } from "@/lib/weekly-report/server";
import { getEquityReports } from "@/lib/equity-report/server";

export const metadata: Metadata = { title: "Weekly Report | EAST", description: "Weekly Macro와 Weekly Equity로 읽는 한 주의 경제와 시장." };
// The selected category is encoded in the URL so back/forward and shared links preserve it.
export const dynamic = "force-dynamic";

export default async function WeeklyReportPage({ searchParams }: { searchParams: { type?: string } }) {
  const equity = searchParams.type === "equity";
  const [macroReports, equityReports] = await Promise.all([getWeeklyReports(), getEquityReports()]);
  const [latest, ...archive] = equity ? equityReports : macroReports;
  const label = equity ? "📊 Weekly Equity" : "🌏 Weekly Macro";
  const base = equity ? "/equity-report" : "/weekly-report";
  return <section className={equity ? "weekly-library weekly-library-equity" : "weekly-library"}>
    <PageHeader title="Weekly Report" description="경제의 흐름부터 주식과 자산시장까지, 한 주의 핵심을 정리합니다." actions={<span className="weekly-schedule">매주 토요일 07:00 KST</span>} />
    <nav className="weekly-categories" aria-label="리포트 종류">
      <Link href="/weekly-report?type=macro" aria-current={!equity ? "page" : undefined}>🌏 Weekly Macro <span>{macroReports.length}</span></Link>
      <Link href="/weekly-report?type=equity" aria-current={equity ? "page" : undefined}>📊 Weekly Equity <span>{equityReports.length}</span></Link>
    </nav>
    <div className="weekly-category-intro">
      <h2>{label}</h2>
      <p>{equity ? "한국·미국 주식과 주요 기업 실적, 국채·금·비트코인을 연결해 읽습니다." : "미국 경제지표와 연준 정책, 금리 변화가 시장에 주는 의미를 읽습니다."}</p>
    </div>
    {latest ? <>
      <Link className="weekly-feature" href={`${base}/${latest.published_date}`}>
        <div className="weekly-eyebrow">LATEST REPORT <span>{label}</span></div>
        <time dateTime={latest.published_date}>{formatReportDate(latest.published_date)}</time>
        <h2>{latest.headline}</h2>
        <p>{label} · {latest.published_date.replace(/-/g, ".")}</p>
        <span className="weekly-read">리포트 읽기 <span aria-hidden="true">↗</span></span>
      </Link>
      <div className="weekly-archive-title"><h2>지난 {equity ? "Equity" : "Macro"} 리포트</h2><span>{archive.length}개</span></div>
      {archive.length ? <div className="weekly-archive">{archive.map(report => <Link key={report.published_date} className="weekly-card" href={`${base}/${report.published_date}`}>
        <time dateTime={report.published_date}>{formatReportDate(report.published_date)}</time>
        <h3>{report.headline}</h3><p>{label}</p><span className="weekly-read">전체 읽기 <span aria-hidden="true">→</span></span>
      </Link>)}</div> : <p className="weekly-note">이전 리포트가 발행되면 이곳에서 볼 수 있습니다.</p>}
    </> : <div className="weekly-empty">
      <span className="weekly-eyebrow">{label}</span>
      <h2>첫 {equity ? "Equity" : "Macro"} 리포트를 준비하고 있습니다.</h2>
      <p>{equity ? "주요 기업의 실적과 모멘텀, 크로스에셋 흐름을 담은 리포트가 발행되면 이곳에 표시됩니다." : "주요 경제지표와 정책 변화, 다음 주 핵심 변수를 담은 리포트가 발행되면 이곳에 표시됩니다."}</p>
      <span className="weekly-schedule">매주 토요일 07:00 KST · 완성 후 게시</span>
    </div>}
  </section>;
}
