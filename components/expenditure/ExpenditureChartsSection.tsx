"use client";

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
        <article className="expense-chart-card">
          <div className="expense-chart-header">
            <h3 className="expense-chart-title">월 카테고리 합계</h3>
          </div>
          <MonthlyBucketBarChart data={monthlyBucketChartData} />
        </article>
        <article className="expense-chart-card">
          <div className="expense-chart-header">
            <h3 className="expense-chart-title">월 세부항목 비중</h3>
            <div className="expense-chart-total-spend">
              <span className="expense-total-spend-label">총 소비</span>
              <strong className="expense-total-spend-value">
                {moneyFormat("KRW", monthlyTotalSpendInt)}
              </strong>
            </div>
          </div>
          <MonthlySubcategoryPieChart data={monthlySubcategoryPieData} />
        </article>
      </div>
    </SectionCard>
  );
}

export default ExpenditureChartsSection;
