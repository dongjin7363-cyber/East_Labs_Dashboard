"use client";

"use client";

import { PageHeaderBar } from "@/components/common/PageHeaderBar";

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
    <PageHeaderBar
      title="Memo"
      className="memo-page-header"
      rightSlot={
        <div className="filter-row memo-header-row memo-page-actions">
          <label>
            월 선택
            <input
              type="month"
              value={selectedMonth}
              onChange={(event) => onMonthChange(event.target.value)}
            />
          </label>
          <div className="memo-selected-date">
            <span>선택 날짜</span>
            <strong>{selectedDate}</strong>
          </div>
        </div>
      }
    />
  );
}

export default MemoHeaderBar;
