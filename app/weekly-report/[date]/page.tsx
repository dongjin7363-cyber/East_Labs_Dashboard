import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportBody } from "@/components/weekly-report/ReportBody";
import { formatReportDate } from "@/lib/weekly-report/model";
import { getWeeklyReports } from "@/lib/weekly-report/server";

export const dynamic = "force-static";
export async function generateStaticParams() {
  return (await getWeeklyReports()).map((report) => ({ date: report.published_date }));
}
export async function generateMetadata({ params }: { params: { date: string } }): Promise<Metadata> {
  const report = (await getWeeklyReports()).find((item) => item.published_date === params.date);
  return report ? { title: `${report.headline} | 🌏 Weekly Macro · EAST`, description: report.title } : { title: "리포트를 찾을 수 없습니다 | EAST" };
}

export default async function WeeklyReportDetail({ params }: { params: { date: string } }) {
  const reports = await getWeeklyReports();
  const index = reports.findIndex((item) => item.published_date === params.date);
  if (index === -1) notFound();
  const report = reports[index];
  const previous = reports[index + 1];
  return <article className="weekly-article">
    <Link className="weekly-back" href="/weekly-report?type=macro">← 🌏 Weekly Macro</Link>
    <header className="weekly-article-header">
      <div className="weekly-eyebrow">EAST RESEARCH <span>🌏 Weekly Macro</span></div>
      <time dateTime={report.published_date}>{formatReportDate(report.published_date)} · KST</time>
      <h1>{report.headline}</h1><p>🌏 Weekly Macro · {report.published_date.replace(/-/g, ".")}</p>
    </header>
    <ReportBody markdown={report.body_markdown} />
    <footer className="weekly-article-footer">
      <Link href="/weekly-report?type=macro">목록으로</Link>
      {previous ? <Link href={`/weekly-report/${previous.published_date}`}>이전 리포트 · {previous.published_date} →</Link> : null}
    </footer>
  </article>;
}
