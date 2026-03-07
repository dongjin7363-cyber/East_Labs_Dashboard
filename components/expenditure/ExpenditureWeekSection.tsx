"use client";

import { ComponentProps } from "react";
import { ExpenditureWeekTable } from "@/components/expenditure/ExpenditureWeekTable";

type WeekTableProps = ComponentProps<typeof ExpenditureWeekTable>;

interface ExpenditureWeekSectionProps extends WeekTableProps {
  rangeLabel: string;
}

export function ExpenditureWeekSection({
  rangeLabel,
  ...tableProps
}: ExpenditureWeekSectionProps) {
  return (
    <section className="panel">
      <div className="panel-header-inline">
        <h3>주간 입력</h3>
        <span className="expense-week-range-label">{rangeLabel}</span>
      </div>
      <ExpenditureWeekTable {...tableProps} />
    </section>
  );
}

export default ExpenditureWeekSection;
