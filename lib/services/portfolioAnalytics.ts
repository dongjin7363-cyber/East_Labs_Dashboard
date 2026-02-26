import { PortfolioHolding, PORTFOLIO_SECTORS, PortfolioSector } from "@/lib/models/types";
import { calcHoldingComputed } from "@/lib/services/portfolioService";
import { usdCentsToUsdFloat, usdToKrw } from "@/lib/utils/money";

export interface PortfolioKrwTotals {
  krHoldingsKrw: number;
  usHoldingsKrw: number;
  depositKrw: number;
  cashKrw: number;
  krWithDepositKrw: number;
  equityKrw: number;
  totalKrw: number;
}

export interface SectorRatioRow {
  sector: PortfolioSector;
  amountKrw: number;
  ratioPct: number;
}

export interface RegionSplitRow {
  region: "KR" | "US";
  amountKrw: number;
  ratioPct: number;
}

export interface EquityCashSummaryRow {
  category: "Equity" | "Cash" | "Total";
  amountKrw: number;
  ratioPct: number;
}

function ratioOf(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }

  return (numerator / denominator) * 100;
}

function holdingMarketValueKrw(holding: PortfolioHolding, fxRate: number): number {
  const marketValueInt = calcHoldingComputed(holding).marketValue;

  if (holding.market === "US") {
    return usdToKrw(usdCentsToUsdFloat(marketValueInt), fxRate);
  }

  return marketValueInt;
}

function emptySectorMap(): Record<PortfolioSector, number> {
  return PORTFOLIO_SECTORS.reduce(
    (acc, sector) => ({
      ...acc,
      [sector]: 0,
    }),
    {} as Record<PortfolioSector, number>,
  );
}

function toSectorRows(
  sectorMap: Record<PortfolioSector, number>,
  denominator: number,
): SectorRatioRow[] {
  return PORTFOLIO_SECTORS.map((sector) => {
    const amountKrw = sectorMap[sector] ?? 0;

    return {
      sector,
      amountKrw,
      ratioPct: ratioOf(amountKrw, denominator),
    };
  });
}

export function calcKrwTotals(
  holdings: PortfolioHolding[],
  depositKrw: number,
  cashKrw: number,
  fxRate: number,
): PortfolioKrwTotals {
  const normalizedDeposit = Math.max(Math.round(depositKrw), 0);
  const normalizedCash = Math.max(Math.round(cashKrw), 0);

  const krHoldingsKrw = holdings
    .filter((holding) => holding.market === "KR")
    .reduce((sum, holding) => sum + holdingMarketValueKrw(holding, fxRate), 0);

  const usHoldingsKrw = holdings
    .filter((holding) => holding.market === "US")
    .reduce((sum, holding) => sum + holdingMarketValueKrw(holding, fxRate), 0);

  const krWithDepositKrw = krHoldingsKrw + normalizedDeposit;
  const equityKrw = krWithDepositKrw + usHoldingsKrw;
  const totalKrw = equityKrw + normalizedCash;

  return {
    krHoldingsKrw,
    usHoldingsKrw,
    depositKrw: normalizedDeposit,
    cashKrw: normalizedCash,
    krWithDepositKrw,
    equityKrw,
    totalKrw,
  };
}

export function calcSectorRatiosKR(
  holdings: PortfolioHolding[],
  depositKrw: number,
): SectorRatioRow[] {
  const sectorMap = emptySectorMap();

  holdings
    .filter((holding) => holding.market === "KR")
    .forEach((holding) => {
      const amount = holding.qty * holding.currentPrice;
      sectorMap[holding.sector] += amount;
    });

  const normalizedDeposit = Math.max(Math.round(depositKrw), 0);
  sectorMap.Cash += normalizedDeposit;

  const denominator = Object.values(sectorMap).reduce((sum, amount) => sum + amount, 0);

  return toSectorRows(sectorMap, denominator);
}

export function calcSectorRatiosUS(
  holdings: PortfolioHolding[],
  fxRate: number,
): SectorRatioRow[] {
  const sectorMap = emptySectorMap();

  holdings
    .filter((holding) => holding.market === "US")
    .forEach((holding) => {
      sectorMap[holding.sector] += holdingMarketValueKrw(holding, fxRate);
    });

  const denominator = Object.values(sectorMap).reduce((sum, amount) => sum + amount, 0);

  return toSectorRows(sectorMap, denominator);
}

export function calcSectorRatiosTotal(
  holdings: PortfolioHolding[],
  depositKrw: number,
  fxRate: number,
): SectorRatioRow[] {
  const sectorMap = emptySectorMap();

  holdings.forEach((holding) => {
    sectorMap[holding.sector] += holdingMarketValueKrw(holding, fxRate);
  });

  const normalizedDeposit = Math.max(Math.round(depositKrw), 0);
  sectorMap.Cash += normalizedDeposit;

  const denominator = Object.values(sectorMap).reduce((sum, amount) => sum + amount, 0);

  return toSectorRows(sectorMap, denominator);
}

export function calcRegionSplit(totals: PortfolioKrwTotals): RegionSplitRow[] {
  return [
    {
      region: "KR",
      amountKrw: totals.krWithDepositKrw,
      ratioPct: ratioOf(totals.krWithDepositKrw, totals.equityKrw),
    },
    {
      region: "US",
      amountKrw: totals.usHoldingsKrw,
      ratioPct: ratioOf(totals.usHoldingsKrw, totals.equityKrw),
    },
  ];
}

export function calcEquityCashTotal(
  totals: PortfolioKrwTotals,
): EquityCashSummaryRow[] {
  const ratioToTotal = (amountKrw: number): number => ratioOf(amountKrw, totals.totalKrw);

  return [
    {
      category: "Equity",
      amountKrw: totals.equityKrw,
      ratioPct: ratioToTotal(totals.equityKrw),
    },
    {
      category: "Cash",
      amountKrw: totals.cashKrw,
      ratioPct: ratioToTotal(totals.cashKrw),
    },
    {
      category: "Total",
      amountKrw: totals.totalKrw,
      ratioPct: totals.totalKrw > 0 ? 100 : 0,
    },
  ];
}
