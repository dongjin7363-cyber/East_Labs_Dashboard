"use client";

import { ExpenseBucket } from "@/lib/models/types";
import { moneyFormat } from "@/lib/utils/money";

interface WeekRow {
  date: string;
  weekday: string;
  isSunday: boolean;
  isSaturday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  INCOME: number;
  SUBSCRIPTION_ONLY: number;
  RENT: number;
  DEBT: number;
  PLUS: number;
  SPENDING: number;
  dailyTotal: number;
  isToday?: boolean;
  isOutsideSelectedMonth?: boolean;
}

interface SelectedCell {
  date: string;
  bucket: ExpenseBucket;
  subcategory?: "Subscription" | "Rent" | "Debt";
  title: string;
}

interface ExpenditureWeekTableProps {
  rows: WeekRow[];
  loading: boolean;
  isAuthed: boolean;
  weeklyTotals: {
    income: number;
    subscription: number;
    rent: number;
    debt: number;
    plus: number;
    spending: number;
    dailyTotal: number;
  };
  monthlyTotals: {
    income: number;
    subscription: number;
    rent: number;
    debt: number;
    plus: number;
    spending: number;
    dailyTotal: number;
  };
  onSelectCell: (cell: SelectedCell) => void;
}

const CELL_COLUMNS: Array<{
  key: "INCOME" | "SUBSCRIPTION_ONLY" | "RENT" | "DEBT" | "PLUS" | "SPENDING";
  label: string;
  bucket: ExpenseBucket;
  subcategory?: "Subscription" | "Rent" | "Debt";
}> = [
  { key: "INCOME", label: "Income", bucket: "INCOME" },
  {
    key: "SUBSCRIPTION_ONLY",
    label: "Subscription",
    bucket: "SUBSCRIPTION",
    subcategory: "Subscription",
  },
  { key: "RENT", label: "Rent", bucket: "SUBSCRIPTION", subcategory: "Rent" },
  { key: "DEBT", label: "Debt", bucket: "SUBSCRIPTION", subcategory: "Debt" },
  { key: "PLUS", label: "Plus", bucket: "PLUS" },
  { key: "SPENDING", label: "Spending", bucket: "SPENDING" },
];

function displayAmount(amountInt: number): string {
  if (amountInt === 0) {
    return "-";
  }

  return moneyFormat("KRW", amountInt);
}

export function ExpenditureWeekTable({
  rows,
  loading,
  isAuthed,
  weeklyTotals,
  monthlyTotals,
  onSelectCell,
}: ExpenditureWeekTableProps) {
  return (
    <div className="table-wrap">
      <table className="expense-week-table">
        <colgroup>
          <col className="expense-week-col-date" />
          <col className="expense-week-col-value" />
          <col className="expense-week-col-value" />
          <col className="expense-week-col-value" />
          <col className="expense-week-col-value" />
          <col className="expense-week-col-value" />
          <col className="expense-week-col-value" />
          <col className="expense-week-col-value" />
        </colgroup>
        <thead>
          <tr>
            <th>Date</th>
            <th>Income</th>
            <th>Subscription</th>
            <th>Rent</th>
            <th>Debt</th>
            <th>Plus</th>
            <th>Spending</th>
            <th>Daily Total</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={8}>로딩 중...</td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.date}
                className={`${row.isToday ? "expense-row-today" : ""} ${
                  row.isOutsideSelectedMonth ? "expense-row-outside-month" : ""
                }`}
              >
                <td>
                  <span
                    className={`expense-date-cell ${
                      row.isHoliday || row.isSunday
                        ? "is-red"
                        : row.isSaturday
                          ? "is-blue"
                          : ""
                    }`}
                    title={row.holidayName ? row.holidayName : undefined}
                  >
                    {row.date}
                    <span className="expense-weekday">({row.weekday})</span>
                  </span>
                </td>
                {CELL_COLUMNS.map((column) => {
                  const amount = row[column.key];

                  return (
                    <td key={`${row.date}-${column.key}`}>
                      <button
                        type="button"
                        className={`expense-sheet-cell ${amount !== 0 ? "has-value" : ""}`}
                        onClick={() => {
                          if (!isAuthed) {
                            window.alert("로그인 후 사용 가능합니다.");
                            return;
                          }

                          onSelectCell({
                            date: row.date,
                            bucket: column.bucket,
                            subcategory: column.subcategory,
                            title: column.label,
                          });
                        }}
                      >
                        {displayAmount(amount)}
                      </button>
                    </td>
                  );
                })}
                <td
                  style={{
                    color:
                      row.dailyTotal > 0
                        ? "var(--positive)"
                        : row.dailyTotal < 0
                          ? "var(--negative)"
                          : "var(--muted)",
                  }}
                >
                  {displayAmount(row.dailyTotal)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr className="expense-week-total-row">
            <th>Weekly Total</th>
            <th>{displayAmount(weeklyTotals.income)}</th>
            <th>{displayAmount(weeklyTotals.subscription)}</th>
            <th>{displayAmount(weeklyTotals.rent)}</th>
            <th>{displayAmount(weeklyTotals.debt)}</th>
            <th>{displayAmount(weeklyTotals.plus)}</th>
            <th>{displayAmount(weeklyTotals.spending)}</th>
            <th
              style={{
                color:
                  weeklyTotals.dailyTotal > 0
                    ? "var(--positive)"
                    : weeklyTotals.dailyTotal < 0
                      ? "var(--negative)"
                      : "var(--muted)",
              }}
            >
              {displayAmount(weeklyTotals.dailyTotal)}
            </th>
          </tr>
          <tr className="expense-month-total-row">
            <th>Monthly Total</th>
            <th>{displayAmount(monthlyTotals.income)}</th>
            <th>{displayAmount(monthlyTotals.subscription)}</th>
            <th>{displayAmount(monthlyTotals.rent)}</th>
            <th>{displayAmount(monthlyTotals.debt)}</th>
            <th>{displayAmount(monthlyTotals.plus)}</th>
            <th>{displayAmount(monthlyTotals.spending)}</th>
            <th
              style={{
                color:
                  monthlyTotals.dailyTotal > 0
                    ? "var(--positive)"
                    : monthlyTotals.dailyTotal < 0
                      ? "var(--negative)"
                      : "var(--muted)",
              }}
            >
              {displayAmount(monthlyTotals.dailyTotal)}
            </th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
