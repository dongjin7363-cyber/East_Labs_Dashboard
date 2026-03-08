"use client";

import { CalendarHeaderBar } from "@/components/common/CalendarHeaderBar";
import { moneyFormat } from "@/lib/utils/money";

interface ExpenditureHeaderBarProps {
  loading: boolean;
  monthlyTotalSpendInt: number;
  selectedMonth: string;
  selectedDate: string;
  selectedWeekLabel: string;
  onMonthChange: (value: string) => void;
}

export function ExpenditureHeaderBar({
  loading,
  monthlyTotalSpendInt,
  selectedMonth,
  selectedDate,
  selectedWeekLabel,
  onMonthChange,
}: ExpenditureHeaderBarProps) {
  return (
    <CalendarHeaderBar
      title="Expenditure"
      titleMeta={
        <span className="inline-title-metric">
          <span className="inline-title-divider">|</span>
          <span className="inline-title-metric-label">총 소비(월)</span>
          <strong>{loading ? "—" : moneyFormat("KRW", monthlyTotalSpendInt)}</strong>
        </span>
      }
      monthValue={selectedMonth}
      onMonthChange={onMonthChange}
      selectedDate={selectedDate}
      rightExtra={
        <div className="calendar-header-meta">
          <span>선택 주</span>
          <div className="calendar-header-meta-content">{selectedWeekLabel}</div>
        </div>
      }
    />
  );
}

export default ExpenditureHeaderBar;
