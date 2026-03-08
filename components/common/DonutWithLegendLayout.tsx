import { ReactNode } from "react";

interface DonutWithLegendLayoutProps {
  chartSlot: ReactNode;
  legendSlot: ReactNode;
  className?: string;
  chartClassName?: string;
  legendClassName?: string;
}

export function DonutWithLegendLayout({
  chartSlot,
  legendSlot,
  className = "",
  chartClassName = "",
  legendClassName = "",
}: DonutWithLegendLayoutProps) {
  return (
    <div className={`donut-legend-layout ${className}`.trim()}>
      <div className={`donut-legend-layout-chart ${chartClassName}`.trim()}>{chartSlot}</div>
      <div className={`donut-legend-layout-legend ${legendClassName}`.trim()}>{legendSlot}</div>
    </div>
  );
}

export default DonutWithLegendLayout;
