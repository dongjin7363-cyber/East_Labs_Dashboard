"use client";

import { PageHeader } from "@/components/PageHeader";
import { Market } from "@/lib/models/types";
import { LeaderboardSummaryInline } from "@/components/leaderboard/LeaderboardSummaryInline";

interface LeaderboardHeaderBarProps {
  selectedMonth: string;
  market: "ALL" | Market;
  search: string;
  onMonthChange: (value: string) => void;
  onMarketChange: (value: "ALL" | Market) => void;
  onSearchChange: (value: string) => void;
  totalCount: number;
  winCount: number;
  winRate: number;
  monthlyTotal: number;
  isAuthed: boolean;
  onCreate: () => void;
}

export function LeaderboardHeaderBar({
  selectedMonth,
  market,
  search,
  onMonthChange,
  onMarketChange,
  onSearchChange,
  totalCount,
  winCount,
  winRate,
  monthlyTotal,
  isAuthed,
  onCreate,
}: LeaderboardHeaderBarProps) {
  return (
    <>
      <PageHeader
        title="Leaderboard"
        actions={
          <button
            type="button"
            className="primary-button"
            onClick={onCreate}
            disabled={!isAuthed}
          >
            거래 추가
          </button>
        }
      />

      <section className="panel">
        <div className="leaderboard-toolbar">
          <div className="filter-row leaderboard-toolbar-controls">
            <label className="leaderboard-control">
              월 선택
              <input
                type="month"
                value={selectedMonth}
                onChange={(event) => onMonthChange(event.target.value)}
              />
            </label>

            <label className="leaderboard-control leaderboard-control-market">
              Market
              <select
                value={market}
                onChange={(event) => onMarketChange(event.target.value as "ALL" | Market)}
                className="leaderboard-market-select"
              >
                <option value="ALL">ALL</option>
                <option value="KR">KR</option>
                <option value="US">US</option>
              </select>
            </label>

            <label className="leaderboard-control leaderboard-control-search">
              Search
              <input
                placeholder="ticker / content"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
          </div>

          <LeaderboardSummaryInline
            totalCount={totalCount}
            winCount={winCount}
            winRate={winRate}
            monthlyTotal={monthlyTotal}
          />
        </div>
      </section>
    </>
  );
}

export default LeaderboardHeaderBar;
