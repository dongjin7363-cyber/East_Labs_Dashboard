import { ReactNode } from "react";

interface InlineFilterRowProps {
  leftControls: ReactNode;
  rightSummary?: ReactNode;
  className?: string;
  leftClassName?: string;
  rightClassName?: string;
}

export function InlineFilterRow({
  leftControls,
  rightSummary,
  className = "",
  leftClassName = "",
  rightClassName = "",
}: InlineFilterRowProps) {
  return (
    <div className={`inline-filter-row ${className}`.trim()}>
      <div className={`inline-filter-row-left ${leftClassName}`.trim()}>{leftControls}</div>
      {rightSummary ? (
        <div className={`inline-filter-row-right ${rightClassName}`.trim()}>
          {rightSummary}
        </div>
      ) : null}
    </div>
  );
}

export default InlineFilterRow;
