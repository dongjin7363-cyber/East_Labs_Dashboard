"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SectorRatioRow } from "@/lib/services/portfolioAnalytics";
import { moneyFormat } from "@/lib/utils/money";

interface SectorNavChartProps {
  data: SectorRatioRow[];
  barColor?: string;
}

const DEFAULT_BAR_COLOR = "#0d3b66";

export function SectorNavChart({
  data,
  barColor = DEFAULT_BAR_COLOR,
}: SectorNavChartProps) {
  if (data.length === 0) {
    return <div className="empty-state">차트 데이터가 없습니다.</div>;
  }

  return (
    <div className="chart-wrap portfolio-sector-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 12, left: 4, bottom: 36 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5eaf1" />
          <XAxis
            dataKey="sector"
            tick={{ fontSize: 10 }}
            angle={-35}
            textAnchor="end"
            interval={0}
            height={52}
          />
          <YAxis
            domain={[0, 100]}
            width={42}
            tick={{ fontSize: 11 }}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            formatter={(value, _name, context) => {
              const ratioPct = Number(value);
              const amount = Number(context?.payload?.amountKrw ?? 0);

              if (!Number.isFinite(ratioPct)) {
                return "-";
              }

              return [`${ratioPct.toFixed(2)}% (${moneyFormat("KRW", amount)})`, "NAV Ratio"];
            }}
          />
          <Bar dataKey="ratioPct" radius={[4, 4, 0, 0]}>
            {data.map((item) => (
              <Cell key={item.sector} fill={barColor} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
