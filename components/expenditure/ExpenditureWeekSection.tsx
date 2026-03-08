"use client";

import { SectionCard } from "@/components/common/SectionCard";
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
    <SectionCard
      title="주간 입력"
      rightSlot={<span className="expense-week-range-label">{rangeLabel}</span>}
    >
      <ExpenditureWeekTable {...tableProps} />
    </SectionCard>
  );
}

export default ExpenditureWeekSection;
