import { PortfolioHolding, CashTransaction, RealizedTrade } from "@/lib/models/types";
import { addHolding, listHoldings, replaceHoldings } from "@/lib/services/portfolioService";
import {
  addTransaction,
  listTransactions,
  replaceTransactions,
} from "@/lib/services/transactionService";
import {
  listRealizedTrades,
  seedFebruaryRealizedTrades,
  replaceRealizedTrades,
} from "@/lib/services/realizedTradeService";

const today = new Date();
const thisYear = today.getFullYear();
const thisMonth = `${today.getMonth() + 1}`.padStart(2, "0");

function day(value: number): string {
  return `${thisYear}-${thisMonth}-${`${value}`.padStart(2, "0")}`;
}

export function seedDemoData(): {
  holdings: PortfolioHolding[];
  transactions: CashTransaction[];
  realizedTrades: RealizedTrade[];
} {
  replaceHoldings([]);
  replaceTransactions([]);
  replaceRealizedTrades([]);

  addHolding({
    market: "KR",
    ticker: "005930",
    sector: "Semi",
    qty: 12,
    avgPrice: 71200,
    currentPrice: 75400,
  });

  addHolding({
    market: "US",
    ticker: "AAPL",
    sector: "Index",
    qty: 10,
    avgPrice: 18500,
    currentPrice: 20140,
  });

  addHolding({
    market: "US",
    ticker: "MSFT",
    sector: "AI",
    qty: 5,
    avgPrice: 41000,
    currentPrice: 40450,
  });

  addTransaction({
    date: day(2),
    type: "DEPOSIT",
    currency: "KRW",
    amount: 3200000,
    category: "급여",
    memo: "월급 입금",
  });

  addTransaction({
    date: day(3),
    type: "EXPENSE",
    currency: "KRW",
    amount: 12000,
    category: "교통",
    memo: "지하철",
  });

  addTransaction({
    date: day(5),
    type: "EXPENSE",
    currency: "KRW",
    amount: 28000,
    category: "식비",
    memo: "점심",
  });

  addTransaction({
    date: day(7),
    type: "DEPOSIT",
    currency: "USD",
    amount: 500000,
    category: "투자",
    memo: "해외계좌 입금",
  });

  addTransaction({
    date: day(8),
    type: "EXPENSE",
    currency: "USD",
    amount: 8500,
    category: "구독",
    memo: "Software subscription",
  });

  seedFebruaryRealizedTrades({ overwrite: true });

  return {
    holdings: listHoldings(),
    transactions: listTransactions(),
    realizedTrades: listRealizedTrades(),
  };
}
