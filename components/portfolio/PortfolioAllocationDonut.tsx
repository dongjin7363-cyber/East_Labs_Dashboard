"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PortfolioHolding } from "@/lib/models/types";
import { calcHoldingComputed } from "@/lib/services/portfolioService";
import { moneyFormat, percentFormat, usdCentsToUsdFloat, usdToKrw } from "@/lib/utils/money";

type DonutMode = "SECTOR" | "TICKER" | "COUNTRY";

interface SliceRow {
  key: string;
  label: string;
  amountKrw: number;
  color: string;
}

interface PortfolioAllocationDonutProps {
  holdings: PortfolioHolding[];
  fxRate: number;
  totalAssetKrw: number;
  accountPnlKrw: number;
  totalPnlPct: number | null;
}

const COLORS = [
  "#0d3b66",
  "#1f9d69",
  "#f59e0b",
  "#7c3aed",
  "#0ea5e9",
  "#ef4444",
  "#475569",
];

function toAmountKrw(holding: PortfolioHolding, fxRate: number): number {
  const marketValue = calcHoldingComputed(holding).marketValue;

  if (holding.market === "US") {
    return usdToKrw(usdCentsToUsdFloat(marketValue), fxRate);
  }

  return marketValue;
}

function buildSlices(
  holdings: PortfolioHolding[],
  fxRate: number,
  mode: DonutMode,
): SliceRow[] {
  const grouped = new Map<string, number>();

  holdings.forEach((holding) => {
    const amountKrw = toAmountKrw(holding, fxRate);

    if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
      return;
    }

    const key =
      mode === "SECTOR"
        ? holding.sector ?? "Other"
        : mode === "COUNTRY"
          ? holding.market
          : holding.ticker;
    grouped.set(key, (grouped.get(key) ?? 0) + amountKrw);
  });

  return Array.from(grouped.entries())
    .map(([key, amountKrw], index) => ({
      key,
      label: key,
      amountKrw,
      color:
        mode === "COUNTRY"
          ? key === "KR"
            ? "#0d3b66"
            : "#1f9d69"
          : COLORS[index % COLORS.length],
    }))
    .sort((a, b) => b.amountKrw - a.amountKrw);
}

export function PortfolioAllocationDonut({
  holdings,
  fxRate,
  totalAssetKrw,
  accountPnlKrw,
  totalPnlPct,
}: PortfolioAllocationDonutProps) {
  const [mode, setMode] = useState<DonutMode>("SECTOR");
  const data = useMemo(() => buildSlices(holdings, fxRate, mode), [holdings, fxRate, mode]);
  const total = useMemo(() => data.reduce((sum, row) => sum + row.amountKrw, 0), [data]);

  return (
    <section className="panel portfolio-donut-panel">
      <div className="panel-header-inline">
        <h3>투자 현황</h3>
        <div className="portfolio-donut-toggle">
          <button
            type="button"
            className={mode === "SECTOR" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("SECTOR")}
          >
            섹터별
          </button>
          <button
            type="button"
            className={mode === "TICKER" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("TICKER")}
          >
            종목별
          </button>
          <button
            type="button"
            className={mode === "COUNTRY" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("COUNTRY")}
          >
            국가별
          </button>
        </div>
      </div>

      <div className="portfolio-donut-layout">
        <div className="portfolio-donut-summary">
          <div className="portfolio-donut-summary-row">
            <span>총 자산</span>
            <strong>{moneyFormat("KRW", totalAssetKrw)}</strong>
          </div>
          <div className="portfolio-donut-summary-row">
            <span>총 계좌 손익</span>
            <strong className={accountPnlKrw >= 0 ? "is-positive" : "is-negative"}>
              {moneyFormat("KRW", accountPnlKrw)}
            </strong>
          </div>
          <div className="portfolio-donut-summary-row">
            <span>총 PnL%</span>
            <strong
              className={
                totalPnlPct === null ? "" : totalPnlPct >= 0 ? "is-positive" : "is-negative"
              }
            >
              {totalPnlPct === null ? "—" : percentFormat(totalPnlPct)}
            </strong>
          </div>
        </div>

        <div className="portfolio-donut-chart-wrap">
          {data.length === 0 ? (
            <div className="empty-state">데이터가 없습니다.</div>
          ) : (
            <>
              <div className="portfolio-donut-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={data}
                      dataKey="amountKrw"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={66}
                      outerRadius={98}
                    >
                      {data.map((row) => (
                        <Cell key={row.key} fill={row.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name, payload) => {
                        const amount = Number(value);
                        const ratio =
                          total > 0
                            ? `${((amount / total) * 100).toFixed(2)}%`
                            : "0.00%";
                        return [`${moneyFormat("KRW", amount)} (${ratio})`, payload?.payload?.label ?? "비중"];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="portfolio-donut-legend">
                {data.map((row) => (
                  <li key={row.key}>
                    <span className="portfolio-donut-legend-dot" style={{ backgroundColor: row.color }} />
                    <span className="portfolio-donut-legend-label">{row.label}</span>
                    <span className="portfolio-donut-legend-value">
                      {moneyFormat("KRW", row.amountKrw)}
                    </span>
                    <span className="portfolio-donut-legend-ratio">
                      {total > 0 ? `${((row.amountKrw / total) * 100).toFixed(2)}%` : "0.00%"}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

export default PortfolioAllocationDonut;

