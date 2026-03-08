"use client";

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
      <section className="panel">
        <div className="panel-header-inline">
          <h3>일별 순수익</h3>
          <div className="panel-submetric">
            월 누적 순수익(KRW 환산): {moneyFormat("KRW", monthlyTotal)}
          </div>
        </div>
        <DailyNetChart data={dailyNet} />
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>월별 순수익 ({selectedYear})</h3>
          <div className="panel-submetric">
            연 누적 순수익: {moneyFormat("KRW", yearlyCumulative)}
          </div>
        </div>
        <MonthlyNetChart data={monthlyNet} />
      </section>
    </>
  );
}

export default LeaderboardChartsSection;
