"use client";

import { EmptyChartState } from "@/components/common/EmptyChartState";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TotalAssetTrendPoint } from "@/lib/services/totalAssetService";
import { moneyFormat } from "@/lib/utils/money";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
}

interface TotalAssetTrendChartProps {
  data: TotalAssetTrendPoint[];
  calendarMap: Record<string, CalendarDayInfo>;
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

export function TotalAssetTrendChart({ data, calendarMap }: TotalAssetTrendChartProps) {
  if (data.length === 0) {
    return <EmptyChartState />;
  }

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
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 10, right: 16, left: 24, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
          <XAxis
            dataKey="date"
            tick={renderDateTick}
            interval="preserveStartEnd"
            height={56}
          />
          <YAxis
            width={80}
            tick={{ fontSize: 12 }}
            tickFormatter={(value) =>
              typeof value === "number"
                ? new Intl.NumberFormat("ko-KR").format(value)
                : `${value}`
            }
          />
          <Tooltip
            formatter={(value) => {
              if (value === null || value === undefined) {
                return "-";
              }

              const amount = Number(value);

              if (!Number.isFinite(amount)) {
                return "-";
              }

              return moneyFormat("KRW", amount);
            }}
          />
          <Line
            type="monotone"
            dataKey="totalAssetKrwInt"
            stroke="#0d3b66"
            strokeWidth={2.2}
            dot={{ r: 2 }}
            activeDot={{ r: 4 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
