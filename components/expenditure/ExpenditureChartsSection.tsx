"use client";

import { ChartSectionCard } from "@/components/common/ChartSectionCard";
import { SectionCard } from "@/components/common/SectionCard";
import {
  MonthlyBucketBarChart,
  type MonthlyBucketBarPoint,
} from "@/components/MonthlyBucketBarChart";
import {
  MonthlySubcategoryPieChart,
  type MonthlySubcategoryPiePoint,
} from "@/components/MonthlySubcategoryPieChart";
import { moneyFormat } from "@/lib/utils/money";

interface ExpenditureChartsSectionProps {
  monthlyBucketChartData: MonthlyBucketBarPoint[];
  monthlySubcategoryPieData: MonthlySubcategoryPiePoint[];
  monthlyTotalSpendInt: number;
}

export function ExpenditureChartsSection({
  monthlyBucketChartData,
  monthlySubcategoryPieData,
  monthlyTotalSpendInt,
}: ExpenditureChartsSectionProps) {
  return (
    <SectionCard>
      <div className="expense-chart-grid">
        <ChartSectionCard title="월 카테고리 합계" variant="compact">
          <MonthlyBucketBarChart data={monthlyBucketChartData} />
        </ChartSectionCard>
        <ChartSectionCard
          title="월 세부항목 비중"
          variant="compact"
          rightSlot={
            <div className="expense-chart-total-spend">
              <span className="expense-total-spend-label">총 소비</span>
              <strong className="expense-total-spend-value">
                {moneyFormat("KRW", monthlyTotalSpendInt)}
              </strong>
            </div>
          }
        >
          <MonthlySubcategoryPieChart data={monthlySubcategoryPieData} />
        </ChartSectionCard>
      </div>
    </SectionCard>
  );
}

export default ExpenditureChartsSection;
