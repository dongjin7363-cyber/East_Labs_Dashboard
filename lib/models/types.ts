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
export const PORTFOLIO_POSITIONS = ["OW", "N", "UW"] as const;
export type PortfolioPosition = (typeof PORTFOLIO_POSITIONS)[number];

export interface PortfolioHolding {
  id: string;
  market: Market;
  currency: Currency;
  ticker: string;
  // Optional human-friendly display label. Storage and UI always treat this as
  // a canonical camelCase app field, regardless of DB/local source naming.
  displayName?: string;
  comment?: string;
  tickerCode?: string;
  logoUrl?: string;
  krCode?: string;
  quoteDisabled?: boolean;
  isCredit: boolean;
  sector: PortfolioSector;
  position: PortfolioPosition;
  qty: number;
  // Integer price units:
  // - KRW: won
  // - USD: cents
  avgPrice: number;
  currentPrice: number;
  prevClose?: number;
  dayChangePct?: number;
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

export interface PortfolioAccountState {
  depositKrwInt: number;
  depositUsdCents: number;
  cashKrwInt: number;
  updatedAt: string;
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
  buyTickers: string;
  sellTickers: string;
  comment: string;
  imagePaths: string[];
  imageSignedUrls?: Record<string, string | null>;
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

export const MEMBERSHIP_CATEGORIES = ["Market", "KR", "US", "Coin"] as const;
export type MembershipCategory = (typeof MEMBERSHIP_CATEGORIES)[number];
export const MEMBERSHIP_VISIBILITIES = ["Public", "Private"] as const;
export type MembershipVisibility = (typeof MEMBERSHIP_VISIBILITIES)[number];

export interface MembershipPost {
  id: string;
  userId?: string;
  date: string;
  title: string;
  category: MembershipCategory;
  body: string;
  visibility: MembershipVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface ExportItem {
  id: string;
  sector: string;
  name: string;
  importance: number;
  description?: string;
  relatedStocks?: string;
  note?: string;
}

export interface ExportDataPoint {
  id: string;
  itemId: string;
  ym: string;
  avgExport: number | null;
  yoy: number | null;
  mom: number | null;
  priceYoy: number | null;
  qoq: number | null;
  asOfDate: string | null;
  isPartial: boolean;
}

export interface FinvizWatchlistItem {
  id: string;
  ticker: string;
  sector: string;
  displayName: string;
  keywords: string;
  chartUrl: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
