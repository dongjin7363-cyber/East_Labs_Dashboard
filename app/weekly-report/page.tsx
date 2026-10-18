import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { formatReportDate } from "@/lib/weekly-report/model";
import { getWeeklyReports } from "@/lib/weekly-report/server";

export const metadata: Metadata = { title: "Weekly Report | EAST", description: "한 주의 매크로 지표, 시장 내러티브 변화와 다음 주 핵심 변수." };
export const dynamic = "force-static";

export default async function WeeklyReportPage() {
  const [latest, ...archive] = await getWeeklyReports();
  return <section>
    <PageHeader title="Weekly Report" description="한 주의 매크로 변화, 다음 주 시장의 핵심 변수." titleMeta={<span className="weekly-schedule">매주 일요일 10:00 KST</span>} />
    {latest ? <>
      <Link className="weekly-feature" href={`/weekly-report/${latest.published_date}`}>
        <div className="weekly-eyebrow">LATEST REPORT <span>US MACRO</span></div>
        <time dateTime={latest.published_date}>{formatReportDate(latest.published_date)}</time>
        <h2>{latest.headline}</h2>
        <p>{latest.title}</p>
        <span className="weekly-read">리포트 읽기 <span aria-hidden="true">↗</span></span>
      </Link>
      <div className="weekly-archive-title"><h2>지난 리포트</h2><span>{archive.length}개</span></div>
      {archive.length ? <div className="weekly-archive">{archive.map((report) => <Link key={report.published_date} className="weekly-card" href={`/weekly-report/${report.published_date}`}>
        <time dateTime={report.published_date}>{formatReportDate(report.published_date)}</time>
        <h3>{report.headline}</h3><p>{report.title}</p><span className="weekly-read">전체 읽기 <span aria-hidden="true">→</span></span>
      </Link>)}</div> : <p className="weekly-note">발행된 리포트가 주차별로 이곳에 쌓입니다.</p>}
    </> : <div className="weekly-empty">
      <span className="weekly-eyebrow">EAST RESEARCH · US MACRO</span>
      <h2>일요일 아침, 한 주의 매크로를 정리합니다.</h2>
      <p>주요 지표와 시장 내러티브의 변화, 다음 주 핵심 변수를 담은<br />Macro Weekly 리포트가 발행되면 이곳에서 볼 수 있습니다.</p>
      <span className="weekly-schedule">매주 일요일 10:00 KST · 완성 후 게시</span>
    </div>}
  </section>;
}
