export type Market = "KR" | "US";
export type Currency = "KRW" | "USD";
export const PORTFOLIO_SECTORS = [
  "AI",
  "Semi",
  "Biotech",
  "EV",
  "Robotics",
  "Energy",
  "Space",
  "Small-Cap",
  "Index",
  "Cash",
  "Other",
] as const;
export type PortfolioSector = (typeof PORTFOLIO_SECTORS)[number];

export interface PortfolioHolding {
  id: string;
  market: Market;
  currency: Currency;
  ticker: string;
  krCode?: string;
  quoteDisabled?: boolean;
  sector: PortfolioSector;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  priceUpdatedAt?: string;
  updatedAt: string;
}

export type CashTransactionType = "EXPENSE" | "DEPOSIT";

export interface CashTransaction {
  id: string;
  date: string;
  type: CashTransactionType;
  currency: Currency;
  amount: number;
  category: string;
  memo: string;
  createdAt: string;
}

export interface StorageSchema {
  schemaVersion: number;
  portfolioHoldings: PortfolioHolding[];
  cashTransactions: CashTransaction[];
  updatedAt: string;
}

export type DatePreset = "THIS_MONTH" | "LAST_MONTH" | "CUSTOM";

export interface DateRange {
  from: string;
  to: string;
}

export interface HoldingComputed {
  marketValue: number;
  pnl: number;
  pnlRate: number;
}

export type CurrencyTotals = Record<Currency, number>;

export interface TransactionSummary {
  expense: CurrencyTotals;
  deposit: CurrencyTotals;
}

export interface SalarySummary {
  deposit: CurrencyTotals;
  expense: CurrencyTotals;
  profit: CurrencyTotals;
}

export type TradeRating = "Best" | "Good" | "Normal" | "Bad" | "";

export interface RealizedTrade {
  id: string;
  date: string;
  market: Market;
  ticker: string;
  qty: number;
  buyPriceInt: number;
  buyAmountInt: number;
  sellPriceInt: number;
  sellAmountInt: number;
  returnPct: number;
  pnlInt: number;
  content: string;
  rating: TradeRating;
  createdAt: string;
}

export interface TotalAssetSnapshot {
  id: string;
  date: string;
  totalAssetKrwInt: number;
  fxRate: number;
  memo?: string;
  createdAt: string;
}

export type ExpenseBucket =
  | "INCOME"
  | "SUBSCRIPTION"
  | "PLUS"
  | "SPENDING";
export const EXPENSE_SUBCATEGORIES = [
  "Spending",
  "Debt",
  "Subscription",
  "Rent",
  "Travel",
  "Luxury",
] as const;
export type ExpenseSubcategory = (typeof EXPENSE_SUBCATEGORIES)[number];

export interface ExpenseEntry {
  id: string;
  date: string;
  bucket: ExpenseBucket;
  subcategory?: ExpenseSubcategory;
  amountInt: number;
  note: string;
  createdAt: string;
}

export interface MemoEntry {
  id: string;
  date: string;
  title?: string;
  body: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketPost {
  id: string;
  date: string;
  macroText: string;
  indicesText: string;
  notesText: string;
  createdAt: string;
  updatedAt: string;
}

export const MEMBERSHIP_CATEGORIES = ["시장", "종목", "리포트"] as const;
export type MembershipCategory = (typeof MEMBERSHIP_CATEGORIES)[number];

export interface MembershipPost {
  id: string;
  title: string;
  category: MembershipCategory;
  body: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}
