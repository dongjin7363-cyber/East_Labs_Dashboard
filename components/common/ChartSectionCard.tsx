import { ReactNode } from "react";

interface ChartSectionCardProps {
  title?: ReactNode;
  rightSlot?: ReactNode;
  children: ReactNode;
  className?: string;
  variant?: "panel" | "compact";
}

export function ChartSectionCard({
  title,
  rightSlot,
  children,
  className = "",
  variant = "panel",
}: ChartSectionCardProps) {
  const baseClassName =
    variant === "compact"
      ? "chart-section-card chart-section-card-compact"
      : "panel chart-section-card";

  return (
    <section className={`${baseClassName} ${className}`.trim()}>
      {title || rightSlot ? (
        <div className="chart-section-card-header">
          {title ? <h3 className="chart-section-card-title">{title}</h3> : <span />}
          {rightSlot ? <div className="chart-section-card-right">{rightSlot}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default ChartSectionCard;
