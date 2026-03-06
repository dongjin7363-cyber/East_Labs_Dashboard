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
import { moneyFormat } from "@/lib/utils/money";

const FX_STORAGE_KEY = "pf_fx_usdkrw_v1";
const DEFAULT_FX_RATE = 1350;

interface FxApiResponse {
  rate: number;
}

export default function SalaryPage() {
  const {
    entries,
    loading: expensesLoading,
    authLoading: expensesAuthLoading,
    isAuthenticated: expensesAuthed,
  } = useExpenses();
  const {
    trades,
    loading: tradesLoading,
    authLoading: tradesAuthLoading,
    isAuthenticated: tradesAuthed,
  } = useRealizedTrades();
  const [year, setYear] = useState(new Date().getFullYear());
  const [fxRate, setFxRate] = useState(DEFAULT_FX_RATE);
  const loading = expensesLoading || tradesLoading;
  const authLoading = expensesAuthLoading || tradesAuthLoading;
  const isAuthed = expensesAuthed && tradesAuthed;

  useEffect(() => {
    const saved = window.localStorage.getItem(FX_STORAGE_KEY);

    if (saved) {
      const parsed = Number(saved);

      if (Number.isFinite(parsed) && parsed > 0) {
        setFxRate(parsed);
      }
    }

    let cancelled = false;

    const loadFx = async () => {
      try {
        const response = await fetch("/api/fx");

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as Partial<FxApiResponse>;
        const nextRate = Number(data.rate);

        if (cancelled || !Number.isFinite(nextRate) || nextRate <= 0) {
          return;
        }

        setFxRate(nextRate);
        window.localStorage.setItem(FX_STORAGE_KEY, `${nextRate}`);
      } catch {
        // Keep local/default FX rate.
      }
    };

    void loadFx();

    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(
    () =>
      getYearSummary({
        year,
        entries: isAuthed ? entries : [],
        trades: isAuthed ? trades : [],
        fxRate,
      }),
    [entries, fxRate, isAuthed, trades, year],
  );

  const earningsChartData = useMemo(
    () => buildEarningsChartData(summary.months),
    [summary.months],
  );
  const salaryChartData = useMemo(
    () => buildSalaryChartData(summary.months),
    [summary.months],
  );

  return (
    <>
      <PageHeader
        title="Salary"
        actions={<YearPicker year={year} onYearChange={setYear} />}
      />

      {!authLoading && !isAuthed ? (
        <section className="panel">
          <p className="auth-gate-message">로그인 후 데이터를 확인할 수 있습니다.</p>
        </section>
      ) : null}

      <section className="panel">
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
                <th>Spending</th>
                <th>Total Spending</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9}>로딩 중...</td>
                </tr>
              ) : summary.months.map((row) => (
                <tr key={row.month}>
                  <td>{row.month}</td>
                  <td>{moneyFormat("KRW", row.income)}</td>
                  <td>{moneyFormat("KRW", row.stock)}</td>
                  <td style={{ fontWeight: 700 }}>{moneyFormat("KRW", row.earnings)}</td>
                  <td>{moneyFormat("KRW", row.rent)}</td>
                  <td>{moneyFormat("KRW", row.debt)}</td>
                  <td>{moneyFormat("KRW", row.plus)}</td>
                  <td>{moneyFormat("KRW", row.spendingOnly)}</td>
                  <td style={{ fontWeight: 700 }}>{moneyFormat("KRW", row.spending)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>Total</th>
                <td>{moneyFormat("KRW", summary.totals.income)}</td>
                <td>{moneyFormat("KRW", summary.totals.stock)}</td>
                <td style={{ fontWeight: 700 }}>
                  {moneyFormat("KRW", summary.totals.earnings)}
                </td>
                <td>{moneyFormat("KRW", summary.totals.rent)}</td>
                <td>{moneyFormat("KRW", summary.totals.debt)}</td>
                <td>{moneyFormat("KRW", summary.totals.plus)}</td>
                <td>{moneyFormat("KRW", summary.totals.spendingOnly)}</td>
                <td style={{ fontWeight: 700 }}>
                  {moneyFormat("KRW", summary.totals.spending)}
                </td>
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
