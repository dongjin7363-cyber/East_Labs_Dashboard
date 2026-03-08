"use client";

import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { EmptyState } from "@/components/common/EmptyState";
import { SectionCard } from "@/components/common/SectionCard";
import { PortfolioHolding } from "@/lib/models/types";
import { calcHoldingComputed } from "@/lib/services/portfolioService";
import {
  moneyFormat,
  percentFormat,
  usdCentsToUsdFloat,
  usdToKrw,
} from "@/lib/utils/money";

type DonutMode = "TICKER" | "SECTOR" | "COUNTRY";

interface SliceRow {
  key: string;
  label: string;
  amountKrw: number;
  color: string;
}

interface PortfolioAllocationDonutProps {
  holdings: PortfolioHolding[];
  fxRate: number;
  krNavKrw: number;
  krPnlPct: number | null;
  krAccountPnlKrw: number;
  usNavCents: number;
  usPnlPct: number | null;
  usAccountPnlCents: number;
  depositTotalKrw: number;
  cashKrw: number;
}

const BASE_COLORS = [
  "#0d3b66",
  "#1f9d69",
  "#f59e0b",
  "#7c3aed",
  "#0ea5e9",
  "#ef4444",
  "#475569",
  "#db2777",
  "#0284c7",
  "#65a30d",
];

const DEPOSIT_COLOR = "#6b7280";
const CASH_COLOR = "#9ca3af";

const SECTOR_COLOR_MAP: Record<string, string> = {
  Index: "#6b7280",
  Biotech: "#16a34a",
  Space: "#eab308",
  Robotics: "#ec4899",
  AI: "#ef4444",
  "Small-Cap": "#111827",
  Deposit: DEPOSIT_COLOR,
  Cash: CASH_COLOR,
  Other: "#cbd5e1",
};

const COUNTRY_COLOR_MAP: Record<string, string> = {
  KR: "#0d3b66",
  US: "#1f9d69",
  Deposit: DEPOSIT_COLOR,
  Cash: CASH_COLOR,
};

function toAmountKrw(holding: PortfolioHolding, fxRate: number): number {
  const marketValue = calcHoldingComputed(holding).marketValue;

  if (holding.market === "US") {
    return usdToKrw(usdCentsToUsdFloat(marketValue), fxRate);
  }

  return marketValue;
}

function getSliceColor(mode: DonutMode, label: string, index: number): string {
  if (label === "Deposit") {
    return DEPOSIT_COLOR;
  }

  if (label === "Cash") {
    return CASH_COLOR;
  }

  if (mode === "SECTOR") {
    return SECTOR_COLOR_MAP[label] ?? BASE_COLORS[index % BASE_COLORS.length];
  }

  if (mode === "COUNTRY") {
    return COUNTRY_COLOR_MAP[label] ?? BASE_COLORS[index % BASE_COLORS.length];
  }

  return BASE_COLORS[index % BASE_COLORS.length];
}

function buildSlices(
  holdings: PortfolioHolding[],
  fxRate: number,
  mode: DonutMode,
  depositTotalKrw: number,
  cashKrw: number,
): SliceRow[] {
  const grouped = new Map<string, number>();

  if (mode === "COUNTRY") {
    let krTotal = 0;
    let usTotal = 0;

    holdings.forEach((holding) => {
      const amountKrw = toAmountKrw(holding, fxRate);

      if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
        return;
      }

      if (holding.market === "US") {
        usTotal += amountKrw;
      } else {
        krTotal += amountKrw;
      }
    });

    if (krTotal > 0) {
      grouped.set("KR", krTotal);
    }

    if (usTotal > 0) {
      grouped.set("US", usTotal);
    }
  } else {
    holdings.forEach((holding) => {
      const amountKrw = toAmountKrw(holding, fxRate);

      if (!Number.isFinite(amountKrw) || amountKrw <= 0) {
        return;
      }

      const key =
        mode === "SECTOR" ? (holding.sector ?? "Other") : holding.ticker.toUpperCase();
      grouped.set(key, (grouped.get(key) ?? 0) + amountKrw);
    });
  }

  if (depositTotalKrw > 0) {
    grouped.set("Deposit", (grouped.get("Deposit") ?? 0) + depositTotalKrw);
  }

  if (cashKrw > 0) {
    grouped.set("Cash", (grouped.get("Cash") ?? 0) + cashKrw);
  }

  return Array.from(grouped.entries())
    .map(([key, amountKrw], index) => ({
      key,
      label: key,
      amountKrw,
      color: getSliceColor(mode, key, index),
    }))
    .sort((a, b) => b.amountKrw - a.amountKrw);
}

function PnlText({
  amount,
  pct,
  currency,
}: {
  amount: number;
  pct: number | null;
  currency: "KRW" | "USD";
}) {
  return (
    <div className="portfolio-donut-mini-pnl">
      <span>계좌 손익</span>
      <span className="portfolio-donut-mini-pnl-values">
        <strong className={amount >= 0 ? "is-positive" : "is-negative"}>
          {moneyFormat(currency, amount)}
        </strong>
        <span className={pct === null ? "" : pct >= 0 ? "is-positive" : "is-negative"}>
          ({pct === null ? "—" : percentFormat(pct)})
        </span>
      </span>
    </div>
  );
}

export function PortfolioAllocationDonut({
  holdings,
  fxRate,
  krNavKrw,
  krPnlPct,
  krAccountPnlKrw,
  usNavCents,
  usPnlPct,
  usAccountPnlCents,
  depositTotalKrw,
  cashKrw,
}: PortfolioAllocationDonutProps) {
  const [mode, setMode] = useState<DonutMode>("TICKER");
  const data = useMemo(
    () => buildSlices(holdings, fxRate, mode, depositTotalKrw, cashKrw),
    [holdings, fxRate, mode, depositTotalKrw, cashKrw],
  );
  const total = useMemo(() => data.reduce((sum, row) => sum + row.amountKrw, 0), [data]);

  return (
    <SectionCard
      className="portfolio-donut-panel"
      title="투자 현황"
      rightSlot={
        <div className="portfolio-donut-toggle">
          <button
            type="button"
            className={mode === "TICKER" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("TICKER")}
          >
            종목별
          </button>
          <button
            type="button"
            className={mode === "SECTOR" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("SECTOR")}
          >
            섹터별
          </button>
          <button
            type="button"
            className={mode === "COUNTRY" ? "primary-button" : "secondary-button"}
            onClick={() => setMode("COUNTRY")}
          >
            국가별
          </button>
        </div>
      }
    >

      <div className="portfolio-donut-layout">
        <div className="portfolio-donut-summary-column">
          <div className="portfolio-donut-summary-box">
            <div className="portfolio-donut-mini-block">
              <div className="portfolio-donut-mini-row">
                <h4>KR NAV</h4>
                <div className="portfolio-donut-mini-nav">{moneyFormat("KRW", krNavKrw)}</div>
              </div>
              <PnlText amount={krAccountPnlKrw} pct={krPnlPct} currency="KRW" />
            </div>
            <div className="portfolio-donut-mini-block">
              <div className="portfolio-donut-mini-row">
                <h4>US NAV</h4>
                <div className="portfolio-donut-mini-nav">{moneyFormat("USD", usNavCents)}</div>
              </div>
              <PnlText amount={usAccountPnlCents} pct={usPnlPct} currency="USD" />
            </div>
          </div>

          <div className="portfolio-donut-summary-box">
            <div className="portfolio-donut-mini-block">
              <div className="portfolio-donut-mini-row">
                <h4>예수금</h4>
                <div className="portfolio-donut-mini-nav">
                  {moneyFormat("KRW", depositTotalKrw)}
                </div>
              </div>
            </div>
            <div className="portfolio-donut-mini-block">
              <div className="portfolio-donut-mini-row">
                <h4>현금</h4>
                <div className="portfolio-donut-mini-nav">{moneyFormat("KRW", cashKrw)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="portfolio-donut-chart-wrap">
          {data.length === 0 ? (
            <EmptyState title="데이터가 없습니다." compact />
          ) : (
            <div className="portfolio-donut-chart-row">
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
                        const ratio = total > 0 ? `${((amount / total) * 100).toFixed(2)}%` : "0.00%";
                        return [
                          `${moneyFormat("KRW", amount)} (${ratio})`,
                          payload?.payload?.label ?? "비중",
                        ];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="portfolio-donut-legend">
                {data.map((row) => (
                  <li key={row.key}>
                    <div className="portfolio-donut-legend-left">
                      <span
                        className="portfolio-donut-legend-dot"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="portfolio-donut-legend-label">{row.label}</span>
                    </div>
                    <div className="portfolio-donut-legend-right">
                      <span className="portfolio-donut-legend-value">
                        {moneyFormat("KRW", row.amountKrw)}
                      </span>
                      <span className="portfolio-donut-legend-ratio">
                        {total > 0 ? `${((row.amountKrw / total) * 100).toFixed(2)}%` : "0.00%"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

export default PortfolioAllocationDonut;
