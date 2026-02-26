import { Currency } from "@/lib/models/types";

function getFormatter(currency: Currency): Intl.NumberFormat {
  if (currency === "KRW") {
    return new Intl.NumberFormat("ko-KR", {
      style: "currency",
      currency: "KRW",
      maximumFractionDigits: 0,
    });
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toDisplayAmount(currency: Currency, amountInt: number): number {
  return currency === "USD" ? amountInt / 100 : amountInt;
}

export function moneyFormat(currency: Currency, amountInt: number): string {
  return getFormatter(currency).format(toDisplayAmount(currency, amountInt));
}

export function usdCentsToUsdFloat(usdCents: number): number {
  return usdCents / 100;
}

export function usdToKrw(usdAmountFloat: number, fxRate: number): number {
  return Math.round(usdAmountFloat * fxRate);
}

export interface MoneyFormatParts {
  symbol: string;
  valueText: string;
  formatted: string;
}

export function moneyFormatParts(
  currency: Currency,
  amountInt: number,
): MoneyFormatParts {
  const formatter = getFormatter(currency);
  const amount = toDisplayAmount(currency, amountInt);
  const parts = formatter.formatToParts(amount);
  const symbol =
    parts.find((part) => part.type === "currency")?.value ??
    (currency === "KRW" ? "₩" : "$");
  const valueText = parts
    .filter((part) => part.type !== "currency")
    .map((part) => part.value)
    .join("")
    .replace(/\u00a0/g, " ")
    .trim();

  return {
    symbol,
    valueText,
    formatted: formatter.format(amount),
  };
}

export function amountPlaceholder(currency: Currency): string {
  return currency === "KRW" ? "예: 1500000 (원)" : "예: 125050 (센트)";
}

export function priceInputPlaceholder(currency: Currency): string {
  return currency === "KRW" ? "예: 75400 (원)" : "예: 13.61 (달러)";
}

export function priceIntToInput(currency: Currency, amountInt: number): string {
  if (currency === "USD") {
    return (amountInt / 100).toFixed(2);
  }

  return `${amountInt}`;
}

export function parsePriceInputToInt(
  currency: Currency,
  rawValue: string,
): number | null {
  const value = rawValue.trim().replace(/,/g, "");

  if (!value) {
    return null;
  }

  if (currency === "KRW") {
    if (!/^\d+$/.test(value)) {
      return null;
    }

    return Number.parseInt(value, 10);
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [wholePart, decimalPart = ""] = value.split(".");
  const dollars = Number.parseInt(wholePart, 10);
  const cents = Number.parseInt((decimalPart + "00").slice(0, 2), 10);

  return dollars * 100 + cents;
}

export function percentFormat(value: number): string {
  return `${value.toFixed(2)}%`;
}
