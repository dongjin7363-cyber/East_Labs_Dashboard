"use client";

import { PageHeaderBar } from "@/components/common/PageHeaderBar";
import { getTodayKST } from "@/lib/date/kst";

interface MarketSnapshotHeaderProps {
  title: string;
  selectedDate: string;
  onDateChange: (value: string) => void;
}

export function MarketSnapshotHeader({
  title,
  selectedDate,
  onDateChange,
}: MarketSnapshotHeaderProps) {
  return (
    <PageHeaderBar
      title={title}
      rightSlot={
        <div className="market-date-picker">
          <span>Date</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onDateChange(event.target.value || getTodayKST())}
          />
        </div>
      }
    />
  );
}

export default MarketSnapshotHeader;
