import { CashTransaction, PortfolioHolding } from "@/lib/models/types";

export interface FinanceRepository {
  getPortfolioHoldings(): PortfolioHolding[];
  savePortfolioHoldings(holdings: PortfolioHolding[]): void;
  getCashTransactions(): CashTransaction[];
  saveCashTransactions(transactions: CashTransaction[]): void;
  resetAll(): void;
}
