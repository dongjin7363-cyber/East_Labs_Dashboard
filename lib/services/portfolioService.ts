import {
  Currency,
  CurrencyTotals,
  HoldingComputed,
  Market,
  PortfolioHolding,
  PORTFOLIO_SECTORS,
  PortfolioSector,
} from "@/lib/models/types";
import { createId } from "@/lib/utils/id";
import { financeRepository } from "@/lib/services/repository";
import { usdCentsToUsdFloat, usdToKrw } from "@/lib/utils/money";

export interface PortfolioInput {
  market: Market;
  currency?: Currency;
  ticker: string;
  krCode?: string;
  quoteDisabled?: boolean;
  sector?: PortfolioSector;
  qty: number;
  avgPrice: number;
  currentPrice: number;
}

export interface HoldingQuoteUpdate {
  id: string;
  currentPrice: number;
  krCode?: string;
  asOf?: string;
}

export interface PortfolioFilter {
  market?: Market | "ALL";
  currency?: Currency | "ALL";
  search?: string;
}

export interface PortfolioTotalAssetInput {
  holdings: PortfolioHolding[];
  fxRate: number;
  depositKrw: number;
  cashKrw: number;
}

export interface PortfolioTotalAssetResult {
  marketValue: CurrencyTotals;
  pnl: CurrencyTotals;
  krHoldingsMarketValueKrw: number;
  usdHoldingsMarketValueCents: number;
  krHoldingsPnlKrw: number;
  usdHoldingsPnlCents: number;
  totalKrwEval: number;
  usdTotalKrw: number;
  usdPnlKrw: number;
  totalKrwPnl: number;
  totalAssetKrw: number;
}

function sortHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  return [...holdings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listHoldings(): PortfolioHolding[] {
  return sortHoldings(financeRepository.getPortfolioHoldings());
}

export function resolveCurrency(market: Market, currency?: Currency): Currency {
  if (market === "KR") {
    return "KRW";
  }

  if (market === "US") {
    return "USD";
  }

  return currency ?? "KRW";
}

function resolveSector(sector?: PortfolioSector): PortfolioSector {
  if (!sector) {
    return "Other";
  }

  const matched = PORTFOLIO_SECTORS.find((item) => item === sector);

  return matched ?? "Other";
}

function resolveKrCodeFromTicker(ticker: string): string | undefined {
  const normalized = ticker.trim().toUpperCase();

  if (/^[A-Z0-9]{1,12}$/.test(normalized)) {
    return normalized;
  }

  return undefined;
}

function resolveKrCodeValue(
  market: Market,
  ticker: string,
  inputKrCode?: string,
): string | undefined {
  if (market !== "KR") {
    return undefined;
  }

  const normalizedInput = inputKrCode?.trim();

  if (normalizedInput) {
    const normalizedCode = normalizedInput.toUpperCase();

    if (/^[A-Z0-9]{1,12}$/.test(normalizedCode)) {
      return normalizedCode;
    }
  }

  return resolveKrCodeFromTicker(ticker);
}

export function addHolding(input: PortfolioInput): PortfolioHolding[] {
  const nowIso = new Date().toISOString();
  const next: PortfolioHolding = {
    id: createId(),
    market: input.market,
    currency: resolveCurrency(input.market, input.currency),
    ticker: input.ticker.trim(),
    krCode: resolveKrCodeValue(input.market, input.ticker, input.krCode),
    quoteDisabled: input.quoteDisabled ? true : undefined,
    sector: resolveSector(input.sector),
    qty: input.qty,
    avgPrice: input.avgPrice,
    currentPrice: input.currentPrice,
    priceUpdatedAt: input.currentPrice > 0 ? nowIso : undefined,
    updatedAt: nowIso,
  };

  const holdings = listHoldings();
  const updated = sortHoldings([next, ...holdings]);
  financeRepository.savePortfolioHoldings(updated);

  return updated;
}

export function updateHolding(
  id: string,
  input: PortfolioInput,
): PortfolioHolding[] {
  const holdings = listHoldings();
  const nowIso = new Date().toISOString();

  const updated = sortHoldings(
    holdings.map((item) => {
      if (item.id !== id) {
        return item;
      }

      return {
        id: item.id,
        market: input.market,
        currency: resolveCurrency(input.market, input.currency),
        ticker: input.ticker.trim(),
        krCode:
          input.market === "KR"
            ? resolveKrCodeValue(input.market, input.ticker, input.krCode) ??
              (item.market === "KR" && item.ticker.trim() === input.ticker.trim()
                ? item.krCode
                : undefined)
            : undefined,
        quoteDisabled: input.quoteDisabled ? true : undefined,
        sector: resolveSector(input.sector),
        qty: input.qty,
        avgPrice: input.avgPrice,
        currentPrice: input.currentPrice,
        priceUpdatedAt: input.currentPrice > 0 ? nowIso : undefined,
        updatedAt: nowIso,
      };
    }),
  );

  financeRepository.savePortfolioHoldings(updated);
  return updated;
}

export function deleteHolding(id: string): PortfolioHolding[] {
  const updated = sortHoldings(listHoldings().filter((item) => item.id !== id));
  financeRepository.savePortfolioHoldings(updated);

  return updated;
}

export function updateHoldingQuotes(
  quoteUpdates: HoldingQuoteUpdate[],
): PortfolioHolding[] {
  if (quoteUpdates.length === 0) {
    return listHoldings();
  }

  const refreshedAt = new Date().toISOString();
  const updateMap = new Map(quoteUpdates.map((item) => [item.id, item]));
  const holdings = listHoldings();
  const updated = sortHoldings(
    holdings.map((holding) => {
      const quote = updateMap.get(holding.id);

      if (!quote) {
        return holding;
      }

      return {
        ...holding,
        currentPrice: quote.currentPrice,
        krCode:
          holding.market === "KR"
            ? quote.krCode ?? holding.krCode
            : undefined,
        priceUpdatedAt: quote.asOf ?? refreshedAt,
        updatedAt: refreshedAt,
      };
    }),
  );

  financeRepository.savePortfolioHoldings(updated);
  return updated;
}

export function replaceHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  financeRepository.savePortfolioHoldings(holdings);
  return listHoldings();
}

// Source of truth for per-holding valuation and pnl.
export function calcHoldingComputed(holding: PortfolioHolding): HoldingComputed {
  const marketValue = holding.qty * holding.currentPrice;
  const pnl = holding.qty * (holding.currentPrice - holding.avgPrice);
  const pnlRate =
    holding.avgPrice <= 0
      ? 0
      : ((holding.currentPrice - holding.avgPrice) / holding.avgPrice) * 100;

  return {
    marketValue,
    pnl,
    pnlRate,
  };
}

export function computeHolding(holding: PortfolioHolding): HoldingComputed {
  return calcHoldingComputed(holding);
}

export function filterHoldings(
  holdings: PortfolioHolding[],
  filter: PortfolioFilter,
): PortfolioHolding[] {
  const keyword = filter.search?.trim().toLowerCase() ?? "";

  return holdings.filter((holding) => {
    if (filter.market && filter.market !== "ALL" && holding.market !== filter.market) {
      return false;
    }

    if (
      filter.currency &&
      filter.currency !== "ALL" &&
      holding.currency !== filter.currency
    ) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return (
      holding.ticker.toLowerCase().includes(keyword)
    );
  });
}

function emptyTotals(): CurrencyTotals {
  return {
    KRW: 0,
    USD: 0,
  };
}

export function summarizePortfolio(holdings: PortfolioHolding[]): {
  marketValue: CurrencyTotals;
  pnl: CurrencyTotals;
} {
  const marketValue = emptyTotals();
  const pnl = emptyTotals();

  holdings.forEach((holding) => {
    const computed = calcHoldingComputed(holding);
    marketValue[holding.currency] += computed.marketValue;
    pnl[holding.currency] += computed.pnl;
  });

  return {
    marketValue,
    pnl,
  };
}

export function calculatePortfolioTotalAsset(
  input: PortfolioTotalAssetInput,
): PortfolioTotalAssetResult {
  const summary = summarizePortfolio(input.holdings);
  const normalizedDeposit = Math.max(Math.round(input.depositKrw), 0);
  const normalizedCash = Math.max(Math.round(input.cashKrw), 0);
  const krHoldingsMarketValueKrw = summary.marketValue.KRW;
  const usdHoldingsMarketValueCents = summary.marketValue.USD;
  const krHoldingsPnlKrw = summary.pnl.KRW;
  const usdHoldingsPnlCents = summary.pnl.USD;

  const totalKrwEval = krHoldingsMarketValueKrw + normalizedDeposit;
  const usdTotalKrw = usdToKrw(usdCentsToUsdFloat(usdHoldingsMarketValueCents), input.fxRate);
  const usdPnlKrw = usdToKrw(usdCentsToUsdFloat(usdHoldingsPnlCents), input.fxRate);
  const totalKrwPnl = krHoldingsPnlKrw + usdPnlKrw;
  const totalAssetKrw = totalKrwEval + usdTotalKrw + normalizedCash;

  return {
    marketValue: summary.marketValue,
    pnl: summary.pnl,
    krHoldingsMarketValueKrw,
    usdHoldingsMarketValueCents,
    krHoldingsPnlKrw,
    usdHoldingsPnlCents,
    totalKrwEval,
    usdTotalKrw,
    usdPnlKrw,
    totalKrwPnl,
    totalAssetKrw,
  };
}

export interface LeaderboardRow extends PortfolioHolding {
  computed: HoldingComputed;
}

export function buildLeaderboard(holdings: PortfolioHolding[]): LeaderboardRow[] {
  return holdings
    .map((holding) => ({ holding, computed: computeHolding(holding) }))
    .sort((a, b) => b.computed.pnl - a.computed.pnl)
    .map((item) => ({ ...item.holding, computed: item.computed }));
}
