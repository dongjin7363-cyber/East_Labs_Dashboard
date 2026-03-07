import { ExpenseEntry, RealizedTrade } from "@/lib/models/types";
import { getPnlKrw } from "@/lib/services/realizedTradeService";

export interface SalaryMonthRow {
  month: number;
  income: number;
  stock: number;
  earnings: number;
  rent: number;
  debt: number;
  plus: number;
  spendingOnly: number;
  spending: number;
  presence: SalaryMonthPresence;
}

export interface SalaryYearTotals {
  income: number;
  stock: number;
  earnings: number;
  rent: number;
  debt: number;
  plus: number;
  spendingOnly: number;
  spending: number;
}

export interface SalaryYearSummary {
  year: number;
  months: SalaryMonthRow[];
  totals: SalaryYearTotals;
}

export interface SalaryMonthPresence {
  income: boolean;
  stock: boolean;
  earnings: boolean;
  rent: boolean;
  debt: boolean;
  plus: boolean;
  spendingOnly: boolean;
  spending: boolean;
}

function createMonthPresence(): SalaryMonthPresence {
  return {
    income: false,
    stock: false,
    earnings: false,
    rent: false,
    debt: false,
    plus: false,
    spendingOnly: false,
    spending: false,
  };
}

function createMonthRow(month: number): SalaryMonthRow {
  return {
    month,
    income: 0,
    stock: 0,
    earnings: 0,
    rent: 0,
    debt: 0,
    plus: 0,
    spendingOnly: 0,
    spending: 0,
    presence: createMonthPresence(),
  };
}

function createYearTotals(): SalaryYearTotals {
  return {
    income: 0,
    stock: 0,
    earnings: 0,
    rent: 0,
    debt: 0,
    plus: 0,
    spendingOnly: 0,
    spending: 0,
  };
}

function resolveMonthIndex(date: string, year: number): number | null {
  const matched = date.match(/^(\d{4})-(\d{2})-\d{2}$/);

  if (!matched) {
    return null;
  }

  const parsedYear = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);

  if (parsedYear !== year || month < 1 || month > 12) {
    return null;
  }

  return month - 1;
}

function finalizeRows(rows: SalaryMonthRow[]): SalaryMonthRow[] {
  return rows.map((row) => ({
    ...row,
    earnings: row.income + row.stock,
    presence: {
      ...row.presence,
      earnings: row.presence.income || row.presence.stock,
    },
  }));
}

function summarizeTotals(rows: SalaryMonthRow[]): SalaryYearTotals {
  return rows.reduce<SalaryYearTotals>(
    (acc, row) => ({
      income: acc.income + row.income,
      stock: acc.stock + row.stock,
      earnings: acc.earnings + row.earnings,
      rent: acc.rent + row.rent,
      debt: acc.debt + row.debt,
      plus: acc.plus + row.plus,
      spendingOnly: acc.spendingOnly + row.spendingOnly,
      spending: acc.spending + row.spending,
    }),
    createYearTotals(),
  );
}

export function getYearSummary(options: {
  year: number;
  entries: ExpenseEntry[];
  trades: RealizedTrade[];
  fxRate: number;
}): SalaryYearSummary {
  const safeYear = Number.isFinite(options.year)
    ? Math.trunc(options.year)
    : new Date().getFullYear();
  const rows = Array.from({ length: 12 }, (_, index) => createMonthRow(index + 1));

  options.entries.forEach((entry) => {
    const monthIndex = resolveMonthIndex(entry.date, safeYear);

    if (monthIndex === null) {
      return;
    }

    const target = rows[monthIndex];

    if (entry.bucket === "INCOME") {
      target.income += entry.amountInt;
      target.presence.income = true;
    }

    if (entry.bucket === "PLUS") {
      target.plus += entry.amountInt;
      target.presence.plus = true;
    }

    // Spending in Asset Management means total monthly consumption:
    // Subscription + Plus + Spending (Income excluded).
    if (
      entry.bucket === "SUBSCRIPTION" ||
      entry.bucket === "PLUS" ||
      entry.bucket === "SPENDING"
    ) {
      target.spending += entry.amountInt;
      target.presence.spending = true;
    }

    if (entry.bucket === "SPENDING") {
      target.spendingOnly += entry.amountInt;
      target.presence.spendingOnly = true;
    }

    if (entry.subcategory === "Rent") {
      target.rent += entry.amountInt;
      target.presence.rent = true;
    }

    if (entry.subcategory === "Debt") {
      target.debt += entry.amountInt;
      target.presence.debt = true;
    }
  });

  options.trades.forEach((trade) => {
    const monthIndex = resolveMonthIndex(trade.date, safeYear);

    if (monthIndex === null) {
      return;
    }

    rows[monthIndex].stock += getPnlKrw(trade, options.fxRate);
    rows[monthIndex].presence.stock = true;
  });

  const finalizedRows = finalizeRows(rows);

  return {
    year: safeYear,
    months: finalizedRows,
    totals: summarizeTotals(finalizedRows),
  };
}

export interface EarningsChartPoint {
  monthLabel: string;
  income: number;
  stock: number;
  earnings: number;
}

export interface SalaryChartPoint {
  monthLabel: string;
  earnings: number;
  spending: number;
}

export function buildEarningsChartData(rows: SalaryMonthRow[]): EarningsChartPoint[] {
  return rows.map((row) => ({
    monthLabel: `${row.month}`,
    income: row.income,
    stock: row.stock,
    earnings: row.earnings,
  }));
}

export function buildSalaryChartData(rows: SalaryMonthRow[]): SalaryChartPoint[] {
  return rows.map((row) => ({
    monthLabel: `${row.month}`,
    earnings: row.earnings,
    // Salary chart keeps using total monthly spending.
    spending: row.spending,
  }));
}
