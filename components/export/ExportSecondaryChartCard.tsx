"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  subtitle: string;
  legend?: ReactNode;
  children: ReactNode;
}

export function ExportSecondaryChartCard({ title, subtitle, legend, children }: Props) {
  return (
    <div className="export-secondary-card">
      <div className="export-secondary-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="export-secondary-legend" aria-hidden={!legend}>
        {legend}
      </div>
      <div className="export-secondary-chart">{children}</div>
    </div>
  );
}
