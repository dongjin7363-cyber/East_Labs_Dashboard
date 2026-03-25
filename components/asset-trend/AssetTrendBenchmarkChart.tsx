"use client";

import { ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyChartState } from "@/components/common/EmptyChartState";
import {
  ASSET_TREND_BENCHMARK_META,
  AssetTrendBenchmarkKey,
  AssetTrendBenchmarkPoint,
  AssetTrendBenchmarkSummaryValue,
} from "@/lib/asset-trend/benchmark";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

interface AssetTrendBenchmarkChartProps {
  title?: ReactNode;
  periodControls?: ReactNode;
  data: AssetTrendBenchmarkPoint[];
  summary: Record<AssetTrendBenchmarkKey, AssetTrendBenchmarkSummaryValue>;
  calendarMap: Record<string, CalendarDayInfo>;
  visibleSeries: Record<AssetTrendBenchmarkKey, boolean>;
  onToggleSeries: (key: AssetTrendBenchmarkKey) => void;
  errorMessage?: string;
}

interface TickPayload {
  value?: string;
}

interface DateTickProps {
  x?: number;
  y?: number;
  payload?: TickPayload;
}

function resolveDateColor(dayInfo: CalendarDayInfo | undefined): string {
  if (!dayInfo) {
    return "#64748b";
  }

  if (dayInfo.isHoliday || dayInfo.dow === 0) {
    return "var(--negative)";
  }

  if (dayInfo.dow === 6) {
    return "#2563eb";
  }

  return "#64748b";
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function AssetTrendBenchmarkChart({
  title,
  periodControls,
  data,
  summary,
  calendarMap,
  visibleSeries,
  onToggleSeries,
  errorMessage,
}: AssetTrendBenchmarkChartProps) {
  const seriesKeys = Object.keys(ASSET_TREND_BENCHMARK_META) as AssetTrendBenchmarkKey[];
  const hasAnyVisibleData = data.some((point) =>
    seriesKeys.some((key) => visibleSeries[key] && typeof point[key] === "number"),
  );
  const summaryRows = seriesKeys
    .map((key) => {
      const meta = ASSET_TREND_BENCHMARK_META[key];
      const summaryValue = summary[key];

      return {
        key,
        label: meta.label,
        color: meta.color,
        value: summaryValue?.periodReturnPct ?? null,
      };
    })
    .sort((a, b) => {
      if (a.value === null && b.value === null) {
        return a.label.localeCompare(b.label);
      }

      if (a.value === null) {
        return 1;
      }

      if (b.value === null) {
        return -1;
      }

      return b.value - a.value;
    });
  const dailyRows = summaryRows.map((row) => {
    return {
      ...row,
      value: summary[row.key]?.dailyReturnPct ?? null,
    };
  });

  const renderDateTick = (props: DateTickProps) => {
    const { x = 0, y = 0, payload } = props;
    const rawDate = typeof payload?.value === "string" ? payload.value : "";
    const dayInfo = calendarMap[rawDate];
    const fill = resolveDateColor(dayInfo);

    return (
      <text
        x={x}
        y={y}
        dy={16}
        textAnchor="end"
        fill={fill}
        fontSize={11}
        transform={`rotate(-30, ${x}, ${y})`}
      >
        {rawDate}
      </text>
    );
  };

  return (
    <div className="ta-benchmark-chart-block">
      <div className="ta-benchmark-top-row">
        <div className="ta-benchmark-heading-row">
          <div className="ta-benchmark-heading-left">
            {title ? <h3 className="ta-benchmark-title">{title}</h3> : null}
            {periodControls ? <div className="ta-benchmark-heading-controls">{periodControls}</div> : null}
          </div>
        </div>
        <div className="ta-benchmark-summary-row">
          <div className="ta-benchmark-summary ta-benchmark-summary-daily">
            <div className="ta-benchmark-summary-title">당일 수익률</div>
            <ul className="ta-benchmark-summary-list">
              {dailyRows.map((row) => (
                <li key={row.key}>
                  <div className="ta-benchmark-summary-left">
                    <span
                      className="ta-benchmark-summary-dot"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                    <span>{row.label}</span>
                  </div>
                  <strong
                    className={
                      row.value === null
                        ? ""
                        : row.value > 0
                          ? "is-positive"
                          : row.value < 0
                            ? "is-negative"
                            : ""
                    }
                  >
                    {row.value === null ? "—" : formatPct(row.value)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>

          <div className="ta-benchmark-summary">
            <div className="ta-benchmark-summary-title">기간 수익률</div>
            <ul className="ta-benchmark-summary-list">
              {summaryRows.map((row) => (
                <li key={row.key}>
                  <div className="ta-benchmark-summary-left">
                    <span
                      className="ta-benchmark-summary-dot"
                      style={{ backgroundColor: row.color }}
                      aria-hidden="true"
                    />
                    <span>{row.label}</span>
                  </div>
                  <strong
                    className={
                      row.value === null
                        ? ""
                        : row.value > 0
                          ? "is-positive"
                          : row.value < 0
                            ? "is-negative"
                            : ""
                    }
                  >
                    {row.value === null ? "—" : formatPct(row.value)}
                  </strong>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="ta-benchmark-toggle-row">
          {seriesKeys.map((key) => {
            const meta = ASSET_TREND_BENCHMARK_META[key];

            return (
              <button
                key={key}
                type="button"
                className={`ta-benchmark-toggle ${visibleSeries[key] ? "is-active" : ""}`}
                onClick={() => onToggleSeries(key)}
              >
                <span
                  className="ta-benchmark-toggle-dot"
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      {errorMessage ? <p className="ta-benchmark-error">{errorMessage}</p> : null}

      {hasAnyVisibleData ? (
        <div className="chart-wrap ta-benchmark-chart-wrap">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 18, left: 18, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
              <XAxis
                dataKey="date"
                tick={renderDateTick}
                interval="preserveStartEnd"
                height={56}
              />
              <YAxis
                width={70}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) =>
                  typeof value === "number" ? `${value.toFixed(1)}%` : `${value}`
                }
              />
              <ReferenceLine
                y={0}
                stroke="#7f8da3"
                strokeWidth={1}
                strokeOpacity={0.5}
                strokeDasharray="6 4"
              />
              <Tooltip
                formatter={(value, name) => {
                  const amount = Number(value);

                  if (!Number.isFinite(amount)) {
                    return "-";
                  }

                  return [formatPct(amount), String(name)];
                }}
              />
              {seriesKeys.map((key) => {
                const meta = ASSET_TREND_BENCHMARK_META[key];

                return (
                  <Line
                    key={key}
                    type="linear"
                    dataKey={key}
                    name={meta.label}
                    stroke={meta.color}
                    strokeWidth={key === "portfolio" ? 3.1 : 2}
                    strokeOpacity={key === "portfolio" ? 0.96 : 0.86}
                    dot={false}
                    activeDot={{ r: 3 }}
                    connectNulls
                    hide={!visibleSeries[key]}
                  />
              );
            })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyChartState title={errorMessage || "선택한 기간의 비교 데이터가 없습니다."} />
      )}
    </div>
  );
}

export default AssetTrendBenchmarkChart;
