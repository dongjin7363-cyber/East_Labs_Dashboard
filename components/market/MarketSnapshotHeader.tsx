"use client";

import { PageHeaderBar } from "@/components/common/PageHeaderBar";
import { todayKstYmd } from "@/lib/utils/date";

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
            onChange={(event) => onDateChange(event.target.value || todayKstYmd())}
          />
        </div>
      }
    />
  );
}

export default MarketSnapshotHeader;
