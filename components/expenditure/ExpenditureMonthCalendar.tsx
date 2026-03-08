"use client";

import { SectionCard } from "@/components/common/SectionCard";
import { ExpenditureCalendar } from "@/components/expenditure/ExpenditureCalendar";
import { ComponentProps } from "react";

type CalendarProps = ComponentProps<typeof ExpenditureCalendar>;
type ExpenditureMonthCalendarProps = CalendarProps;

export function ExpenditureMonthCalendar({
  ...calendarProps
}: ExpenditureMonthCalendarProps) {
  return (
    <SectionCard>
      <ExpenditureCalendar {...calendarProps} />
    </SectionCard>
  );
}

export default ExpenditureMonthCalendar;
