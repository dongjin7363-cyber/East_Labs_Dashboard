import {
  EquityCashSummaryRow,
  RegionSplitRow,
} from "@/lib/services/portfolioAnalytics";
import { moneyFormat } from "@/lib/utils/money";

interface AllocationSummaryProps {
  regionSplit: RegionSplitRow[];
  equityCashSummary: EquityCashSummaryRow[];
}

function ratioText(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function AllocationSummary({
  regionSplit,
  equityCashSummary,
}: AllocationSummaryProps) {
  return (
    <div className="portfolio-allocation-grid">
      <article className="portfolio-allocation-card">
        <h4>KR / US 비중 (Equity 기준)</h4>
        <div className="table-wrap portfolio-allocation-table-wrap">
          <table className="portfolio-allocation-table">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "48%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Region</th>
                <th>Amount (KRW)</th>
                <th>Ratio</th>
              </tr>
            </thead>
            <tbody>
              {regionSplit.map((row) => (
                <tr key={row.region}>
                  <td>{row.region}</td>
                  <td>{moneyFormat("KRW", row.amountKrw)}</td>
                  <td>{ratioText(row.ratioPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="portfolio-allocation-card">
        <h4>Equity / Cash / Total</h4>
        <div className="table-wrap portfolio-allocation-table-wrap">
          <table className="portfolio-allocation-table">
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "46%" }} />
              <col style={{ width: "30%" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Category</th>
                <th>Amount (KRW)</th>
                <th>Ratio of Total</th>
              </tr>
            </thead>
            <tbody>
              {equityCashSummary.map((row) => (
                <tr
                  key={row.category}
                  className={row.category === "Total" ? "is-total-row" : ""}
                >
                  <td>{row.category}</td>
                  <td>{moneyFormat("KRW", row.amountKrw)}</td>
                  <td>{ratioText(row.ratioPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </div>
  );
}
