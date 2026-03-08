import { ReactNode } from "react";

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({
  title,
  description,
  compact = false,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state${compact ? " is-compact" : ""} ${className}`.trim()}
    >
      <div>{title}</div>
      {description ? <div className="empty-state-description">{description}</div> : null}
    </div>
  );
}

export default EmptyState;
