"use client";

import { useEffect, useMemo, useState } from "react";
import { EarningsChart } from "@/components/EarningsChart";
import { PageHeader } from "@/components/PageHeader";
import { SalaryChart } from "@/components/SalaryChart";
import { YearPicker } from "@/components/YearPicker";
import { useExpenses } from "@/lib/hooks/useExpenses";
import { useRealizedTrades } from "@/lib/hooks/useRealizedTrades";
import {
  buildEarningsChartData,
  buildSalaryChartData,
  getYearSummary,
} from "@/lib/services/salaryService";
import {
  DEFAULT_USDKRW_FX_RATE,
  PORTFOLIO_FX_STORAGE_KEY,
} from "@/lib/services/totalAssetService";
import { moneyFormat } from "@/lib/utils/money";

interface FxApiResponse {
  rate: number;
}

function emptyCell(value: number): string {
  if (value === 0) {
    return "-";
  }

  return moneyFormat("KRW", value);
}

export function AssetManagementClient() {
  const {
    entries,
    loading: expensesLoading,
    authLoading: expensesAuthLoading,
    isAuthenticated: expensesAuthenticated,
  } = useExpenses();
  const {
    trades,
    loading: tradesLoading,
    authLoading: tradesAuthLoading,
    isAuthenticated: tradesAuthenticated,
  } = useRealizedTrades();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [fxRate, setFxRate] = useState(DEFAULT_USDKRW_FX_RATE);

  useEffect(() => {
    const savedFx = window.localStorage.getItem(PORTFOLIO_FX_STORAGE_KEY);

    if (savedFx) {
      const parsed = Number(savedFx);

      if (Number.isFinite(parsed) && parsed > 0) {
        setFxRate(parsed);
      }
    }

    let mounted = true;

    const loadFx = async () => {
      try {
        const response = await fetch("/api/fx", { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`FX API error: ${response.status}`);
        }

        const data = (await response.json()) as Partial<FxApiResponse>;
        const nextRate = Number(data.rate);

        if (!mounted || !Number.isFinite(nextRate) || nextRate <= 0) {
          return;
        }

        setFxRate(nextRate);
        window.localStorage.setItem(PORTFOLIO_FX_STORAGE_KEY, `${nextRate}`);
      } catch {
        // Keep localStorage/default fx rate.
      }
    };

    void loadFx();

    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(
    () =>
      getYearSummary({
        year: selectedYear,
        entries,
        trades,
        fxRate,
      }),
    [entries, fxRate, selectedYear, trades],
  );

  const earningsChartData = useMemo(
    () => buildEarningsChartData(summary.months),
    [summary.months],
  );
  const salaryChartData = useMemo(
    () => buildSalaryChartData(summary.months),
    [summary.months],
  );
  const loading = expensesLoading || tradesLoading;
  const authLoading = expensesAuthLoading || tradesAuthLoading;
  const isAuthenticated = expensesAuthenticated && tradesAuthenticated;

  return (
    <>
      <PageHeader title="Asset Management" />

      {!authLoading && !isAuthenticated ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="filter-row">
          <YearPicker year={selectedYear} onYearChange={setSelectedYear} />
          <div className="fx-meta">USDKRW {new Intl.NumberFormat("ko-KR").format(Math.round(fxRate))}</div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Stock</th>
                <th>Total Earnings</th>
                <th>Rent</th>
                <th>Debt</th>
                <th>Plus</th>
                <th>Total Spending</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>로딩 중...</td>
                </tr>
              ) : (
                summary.months.map((row) => (
                  <tr key={row.month}>
                    <td>{row.month}월</td>
                    <td>{emptyCell(row.income)}</td>
                    <td>{emptyCell(row.stock)}</td>
                    <td>
                      <strong>{emptyCell(row.earnings)}</strong>
                    </td>
                    <td>{emptyCell(row.rent)}</td>
                    <td>{emptyCell(row.debt)}</td>
                    <td>{emptyCell(row.plus)}</td>
                    <td>
                      <strong>{emptyCell(row.spending)}</strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <th>{moneyFormat("KRW", summary.totals.income)}</th>
                <th>{moneyFormat("KRW", summary.totals.stock)}</th>
                <th>
                  <strong>{moneyFormat("KRW", summary.totals.earnings)}</strong>
                </th>
                <th>{moneyFormat("KRW", summary.totals.rent)}</th>
                <th>{moneyFormat("KRW", summary.totals.debt)}</th>
                <th>{moneyFormat("KRW", summary.totals.plus)}</th>
                <th>
                  <strong>{moneyFormat("KRW", summary.totals.spending)}</strong>
                </th>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="salary-chart-grid">
          <article className="salary-chart-card">
            <h3 className="salary-chart-title">Earnings</h3>
            <EarningsChart data={earningsChartData} />
          </article>
          <article className="salary-chart-card">
            <h3 className="salary-chart-title">Salary</h3>
            <SalaryChart data={salaryChartData} />
          </article>
        </div>
      </section>
    </>
  );
}
