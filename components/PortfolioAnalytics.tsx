import { useMemo } from "react";
import { AllocationSummary } from "@/components/AllocationSummary";
import { SectorNavChart } from "@/components/SectorNavChart";
import { PortfolioHolding } from "@/lib/models/types";
import {
  calcEquityCashTotal,
  calcKrwTotals,
  calcRegionSplit,
  calcSectorRatiosKR,
  calcSectorRatiosTotal,
  calcSectorRatiosUS,
  SectorRatioRow,
} from "@/lib/services/portfolioAnalytics";

interface PortfolioAnalyticsProps {
  holdings: PortfolioHolding[];
  depositKrw: number;
  cashKrw: number;
  fxRate: number;
}

function ratioText(value: number): string {
  return `${value.toFixed(2)}%`;
}

interface SectorPanelProps {
  title: string;
  rows: SectorRatioRow[];
  color: string;
}

function SectorPanel({ title, rows, color }: SectorPanelProps) {
  return (
    <article className="portfolio-sector-panel">
      <h4>{title}</h4>
      <div className="table-wrap portfolio-sector-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Sector</th>
              <th>NAV Ratio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${title}-${row.sector}`}>
                <td>{row.sector}</td>
                <td>{ratioText(row.ratioPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SectorNavChart data={rows} barColor={color} />
    </article>
  );
}

export function PortfolioAnalytics({
  holdings,
  depositKrw,
  cashKrw,
  fxRate,
}: PortfolioAnalyticsProps) {
  const totals = useMemo(
    () => calcKrwTotals(holdings, depositKrw, cashKrw, fxRate),
    [cashKrw, depositKrw, fxRate, holdings],
  );
  const krSectorRows = useMemo(
    () => calcSectorRatiosKR(holdings, depositKrw),
    [depositKrw, holdings],
  );
  const usSectorRows = useMemo(
    () => calcSectorRatiosUS(holdings, fxRate),
    [fxRate, holdings],
  );
  const totalSectorRows = useMemo(
    () => calcSectorRatiosTotal(holdings, depositKrw, fxRate),
    [depositKrw, fxRate, holdings],
  );
  const regionSplit = useMemo(() => calcRegionSplit(totals), [totals]);
  const equityCashSummary = useMemo(() => calcEquityCashTotal(totals), [totals]);

  return (
    <section className="panel">
      <div className="panel-header-inline">
        <h3>포트폴리오 분석</h3>
      </div>

      <div className="portfolio-sector-grid">
        <SectorPanel title="KR NAV Ratio" rows={krSectorRows} color="#0d3b66" />
        <SectorPanel title="US NAV Ratio" rows={usSectorRows} color="#1f9d69" />
        <SectorPanel title="Total NAV Ratio (Equity)" rows={totalSectorRows} color="#f59e0b" />
      </div>

      <AllocationSummary regionSplit={regionSplit} equityCashSummary={equityCashSummary} />
    </section>
  );
}
