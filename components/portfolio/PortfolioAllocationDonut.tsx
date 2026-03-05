"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PortfolioHolding } from "@/lib/models/types";
import { calcHoldingComputed } from "@/lib/services/portfolioService";
import { moneyFormat, percentFormat, usdCentsToUsdFloat, usdToKrw } from "@/lib/utils/money";

type AllocationMode = "SECTOR" | "TICKER" | "COUNTRY";

interface AllocationSlice {
  key: string;
  label: string;
  amountKrw: number;
  ratioPct: number;
  color: string;
}

interface PortfolioAllocationDonutProps {
  holdings: PortfolioHolding[];
  fxRate: number;
  totalAssetKrw: number;
  accountPnlKrw: number;
  totalPnlPct: number | null;
}

const COLOR_PALETTE = [
  "#0d3b66",
  "#1f9d69",
  "#f59e0b",
  "#7c3aed",
  "#0ea5e9",
  "#ef4444",
  "#0f766e",
  "#9333ea",
  "#2563eb",
  "#ea580c",
  "#065f46",
  "#475569",
];

function aggregateAllocation(
  holdings: PortfolioHolding[],
  fxRate: number,
  mode: AllocationMode,
): AllocationSlice[] {
  const amountMap = new Map<string, { label: string; amountKrw: number }>();

  holdings.forEach((holding) => {
    const marketValueInt = calcHoldingComputed(holding).marketValue;

    if (!Number.isFinite(marketValueInt) || marketValueInt <= 0) {
      return;
    }

    const amountKrw =
      holding.market === "US"
        ? usdToKrw(usdCentsToUsdFloat(marketValueInt), fxRate)
        : marketValueInt;

    if (amountKrw <= 0) {
      return;
    }

    const key =
      mode === "SECTOR"
        ? holding.sector ?? "Other"
        : mode === "COUNTRY"
          ? holding.market
          : holding.ticker;
    const label =
      mode === "SECTOR"
        ? holding.sector ?? "Other"
        : mode === "COUNTRY"
          ? holding.market
          : holding.displayName?.trim() || holding.ticker;

    const prev = amountMap.get(key);

    if (prev) {
      amountMap.set(key, {
        label: prev.label,
        amountKrw: prev.amountKrw + amountKrw,
      });
      return;
    }

    amountMap.set(key, { label, amountKrw });
  });

  const rows = Array.from(amountMap.entries())
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => b.amountKrw - a.amountKrw);

  const collapsedRows =
    mode === "TICKER" && rows.length > 12
      ? [
          ...rows.slice(0, 11),
          {
            key: "others",
            label: "Others",
            amountKrw: rows.slice(11).reduce((sum, row) => sum + row.amountKrw, 0),
          },
        ]
      : rows;
  const total = collapsedRows.reduce((sum, row) => sum + row.amountKrw, 0);

  return collapsedRows.map((row, index) => ({
    key: row.key,
    label: row.label,
    amountKrw: row.amountKrw,
    ratioPct: total > 0 ? (row.amountKrw / total) * 100 : 0,
    color:
      mode === "COUNTRY"
        ? row.key === "KR"
          ? "#0d3b66"
          : "#1f9d69"
        : COLOR_PALETTE[index % COLOR_PALETTE.length],
  }));
}

export function PortfolioAllocationDonut({
  holdings,
  fxRate,
  totalAssetKrw,
  accountPnlKrw,
  totalPnlPct,
}: PortfolioAllocationDonutProps) {
  const [mode, setMode] = useState<AllocationMode>("SECTOR");
  const slices = useMemo(
    () => aggregateAllocation(holdings, fxRate, mode),
    [fxRate, holdings, mode],
  );

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
            <strong
              className={accountPnlKrw >= 0 ? "is-positive" : "is-negative"}
            >
              {moneyFormat("KRW", accountPnlKrw)}
            </strong>
          </div>
          <div className="portfolio-donut-summary-row">
            <span>총 PnL%</span>
            <strong
              className={
                totalPnlPct === null
                  ? ""
                  : totalPnlPct >= 0
                    ? "is-positive"
                    : "is-negative"
              }
            >
              {totalPnlPct === null ? "—" : percentFormat(totalPnlPct)}
            </strong>
          </div>
        </div>

        <div className="portfolio-donut-chart-wrap">
          {slices.length === 0 ? (
            <div className="empty-state">데이터가 없습니다.</div>
          ) : (
            <>
              <div className="portfolio-donut-chart">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie
                      data={slices}
                      dataKey="amountKrw"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={68}
                      outerRadius={100}
                    >
                      {slices.map((slice) => (
                        <Cell key={slice.key} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, _name: string, payload) => {
                        const data = payload?.payload as AllocationSlice | undefined;
                        const amountKrw = Number(value);
                        const ratioText =
                          data && Number.isFinite(data.ratioPct)
                            ? ` (${data.ratioPct.toFixed(2)}%)`
                            : "";

                        return [`${moneyFormat("KRW", amountKrw)}${ratioText}`, "비중"];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="portfolio-donut-legend">
                {slices.map((slice) => (
                  <li key={slice.key}>
                    <span
                      className="portfolio-donut-legend-dot"
                      style={{ backgroundColor: slice.color }}
                    />
                    <span className="portfolio-donut-legend-label">{slice.label}</span>
                    <span className="portfolio-donut-legend-value">
                      {moneyFormat("KRW", slice.amountKrw)}
                    </span>
                    <span className="portfolio-donut-legend-ratio">
                      {slice.ratioPct.toFixed(2)}%
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

