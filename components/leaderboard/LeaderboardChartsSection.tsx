"use client";

import { SectionCard } from "@/components/common/SectionCard";
import { DailyNetChart } from "@/components/DailyNetChart";
import { MonthlyNetChart } from "@/components/MonthlyNetChart";
import {
  DailyNetPoint,
  MonthlyNetPoint,
} from "@/lib/services/realizedTradeService";
import { moneyFormat } from "@/lib/utils/money";

interface LeaderboardChartsSectionProps {
  dailyNet: DailyNetPoint[];
  monthlyTotal: number;
  monthlyNet: MonthlyNetPoint[];
  selectedYear: number;
  yearlyCumulative: number;
}

export function LeaderboardChartsSection({
  dailyNet,
  monthlyTotal,
  monthlyNet,
  selectedYear,
  yearlyCumulative,
}: LeaderboardChartsSectionProps) {
  return (
    <>
      <SectionCard
        title="일별 순수익"
        rightSlot={
          <div className="panel-submetric">
            월 누적 순수익(KRW 환산): {moneyFormat("KRW", monthlyTotal)}
          </div>
        }
      >
        <DailyNetChart data={dailyNet} />
      </SectionCard>

      <SectionCard
        title={`월별 순수익 (${selectedYear})`}
        rightSlot={
          <div className="panel-submetric">
            연 누적 순수익: {moneyFormat("KRW", yearlyCumulative)}
          </div>
        }
      >
        <MonthlyNetChart data={monthlyNet} />
      </SectionCard>
    </>
  );
}

export default LeaderboardChartsSection;
