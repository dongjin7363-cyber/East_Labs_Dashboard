"use client";

import { PageHeaderBar } from "@/components/common/PageHeaderBar";
import { moneyFormat } from "@/lib/utils/money";

interface ExpenditureHeaderBarProps {
  loading: boolean;
  monthlyTotalSpendInt: number;
}

export function ExpenditureHeaderBar({
  loading,
  monthlyTotalSpendInt,
}: ExpenditureHeaderBarProps) {
  return (
    <PageHeaderBar
      title="Expenditure"
      titleMeta={
        <span className="inline-title-metric">
          <span className="inline-title-divider">|</span>
          <span className="inline-title-metric-label">총 소비(월)</span>
          <strong>{loading ? "—" : moneyFormat("KRW", monthlyTotalSpendInt)}</strong>
        </span>
      }
    />
  );
}

export default ExpenditureHeaderBar;
