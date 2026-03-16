"use client";

import { Currency } from "@/lib/models/types";
import { moneyFormatParts } from "@/lib/utils/money";

interface CurrencyAmountProps {
  currency: Currency;
  amountInt: number;
  className?: string;
  mode?: "default" | "table";
}

export function CurrencyAmount({
  currency,
  amountInt,
  className,
  mode = "default",
}: CurrencyAmountProps) {
  const parts = moneyFormatParts(currency, amountInt);

  return (
    <span
      className={`money-inline portfolio-money ${mode === "table" ? "is-table" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      <span className="money-symbol">{parts.symbol}</span>
      <span className="money-value">{parts.valueText}</span>
    </span>
  );
}

export default CurrencyAmount;
