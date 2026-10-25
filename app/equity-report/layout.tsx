import "../weekly-report/weekly-report.css";
import "./equity-report.css";

export default function WeeklyReportLayout({ children }: { children: React.ReactNode }) {
  return <div className="weekly-shell">{children}</div>;
}
