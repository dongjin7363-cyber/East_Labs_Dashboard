import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EquityBody } from "@/components/equity-report/EquityBody";
import { formatReportDate } from "@/lib/weekly-report/model";
import { getEquityReports } from "@/lib/equity-report/server";

export const dynamic = "force-static";
export async function generateStaticParams() {
  return (await getEquityReports()).map((report) => ({ date: report.published_date }));
}
export async function generateMetadata({ params }: { params: { date: string } }): Promise<Metadata> {
  const report = (await getEquityReports()).find((item) => item.published_date === params.date);
  return report ? { title: `${report.headline} | EAST Weekly Equity Report`, description: report.title } : { title: "리포트를 찾을 수 없습니다 | EAST" };
}

export default async function WeeklyReportDetail({ params }: { params: { date: string } }) {
  const reports = await getEquityReports();
  const index = reports.findIndex((item) => item.published_date === params.date);
  if (index === -1) notFound();
  const report = reports[index];
  const previous = reports[index + 1];
  return <article className="weekly-article">
    <Link className="weekly-back" href="/equity-report">← EAST Weekly Equity Report</Link>
    <header className="weekly-article-header">
      <div className="weekly-eyebrow">EAST RESEARCH <span>KR · US · CROSS-ASSET</span></div>
      <time dateTime={report.published_date}>{formatReportDate(report.published_date)} · KST</time>
      <h1>{report.headline}</h1><p>{report.title}</p>
    </header>
    <EquityBody report={report} />
    <footer className="weekly-article-footer">
      <Link href="/equity-report">목록으로</Link>
      {previous ? <Link href={`/equity-report/${previous.published_date}`}>이전 리포트 · {previous.published_date} →</Link> : null}
    </footer>
  </article>;
}
