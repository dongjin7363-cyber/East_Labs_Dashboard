"use client";

import { moneyFormat, percentFormat } from "@/lib/utils/money";

interface LeaderboardSummaryInlineProps {
  totalCount: number;
  winCount: number;
  winRate: number;
  monthlyTotal: number;
}

export function LeaderboardSummaryInline({
  totalCount,
  winCount,
  winRate,
  monthlyTotal,
}: LeaderboardSummaryInlineProps) {
  return (
    <div className="leaderboard-toolbar-summary">
      <div className="leaderboard-summary-block">
        <span className="leaderboard-summary-label">총 거래 수</span>
        <strong className="leaderboard-summary-value">{totalCount}건</strong>
      </div>

      <div className="leaderboard-summary-block">
        <span className="leaderboard-summary-label">수익 거래</span>
        <strong className="leaderboard-summary-value">
          {winCount}건 ({percentFormat(winRate)})
        </strong>
      </div>

      <div className="leaderboard-summary-block">
        <span className="leaderboard-summary-label">순수익</span>
        <strong
          className={`leaderboard-summary-value ${
            monthlyTotal > 0
              ? "is-positive"
              : monthlyTotal < 0
                ? "is-negative"
                : ""
          }`}
        >
          {moneyFormat("KRW", monthlyTotal)}
        </strong>
      </div>
    </div>
  );
}

export default LeaderboardSummaryInline;
