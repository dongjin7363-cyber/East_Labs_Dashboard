import { ReactNode } from "react";

type SummaryTone = "default" | "positive" | "negative" | "muted";

export interface SummaryStatRow {
  key?: string;
  label: ReactNode;
  value: ReactNode;
  subValue?: ReactNode;
  tone?: SummaryTone;
}

interface SummaryStatListProps {
  rows: SummaryStatRow[];
  className?: string;
}

function toneClassName(tone: SummaryTone | undefined): string {
  switch (tone) {
    case "positive":
      return "is-positive";
    case "negative":
      return "is-negative";
    case "muted":
      return "is-muted";
    default:
      return "";
  }
}

export function SummaryStatList({
  rows,
  className = "",
}: SummaryStatListProps) {
  return (
    <div className={`summary-stat-list ${className}`.trim()}>
      {rows.map((row, index) => (
        <div key={row.key ?? index} className="summary-stat-item">
          <div className="summary-stat-main-row">
            <span className="summary-stat-label">{row.label}</span>
            <div className={`summary-stat-value ${toneClassName(row.tone)}`.trim()}>
              {row.value}
            </div>
          </div>
          {row.subValue ? <div className="summary-stat-subvalue">{row.subValue}</div> : null}
        </div>
      ))}
    </div>
  );
}

export default SummaryStatList;
