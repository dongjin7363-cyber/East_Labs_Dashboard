"use client";
import { CalendarHeaderBar } from "@/components/common/CalendarHeaderBar";

interface MemoHeaderBarProps {
  selectedMonth: string;
  selectedDate: string;
  onMonthChange: (value: string) => void;
}

export function MemoHeaderBar({
  selectedMonth,
  selectedDate,
  onMonthChange,
}: MemoHeaderBarProps) {
  return (
    <CalendarHeaderBar
      title="Memo"
      className="memo-page-header"
      monthValue={selectedMonth}
      onMonthChange={onMonthChange}
      selectedDate={selectedDate}
    />
  );
}

export default MemoHeaderBar;
