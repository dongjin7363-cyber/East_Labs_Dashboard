"use client";

import { SectionCard } from "@/components/common/SectionCard";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";

interface PortfolioCashInputsProps {
  depositKrwInput: string;
  depositUsdInput: string;
  cashInput: string;
  onDepositKrwChange: (value: string) => void;
  onDepositUsdChange: (value: string) => void;
  onCashChange: (value: string) => void;
  isAuthed: boolean;
  fxSummaryText: string;
  quoteWarningLine: string;
  unmatchedKrDisplayTickers: string[];
  onOpenManualKrCodeModal: (ticker: string) => void;
}

export function PortfolioCashInputs({
  depositKrwInput,
  depositUsdInput,
  cashInput,
  onDepositKrwChange,
  onDepositUsdChange,
  onCashChange,
  isAuthed,
  fxSummaryText,
  quoteWarningLine,
  unmatchedKrDisplayTickers,
  onOpenManualKrCodeModal,
}: PortfolioCashInputsProps) {
  return (
    <SectionCard className="cash-panel">
      <div className="filter-row cash-row">
        <label>
          예수금 (KRW)
          <FormattedNumberInput
            className="cash-input"
            placeholder="예: 1,000,000"
            value={depositKrwInput}
            onValueChange={onDepositKrwChange}
            disabled={!isAuthed}
          />
        </label>
        <label>
          예수금 (USD)
          <FormattedNumberInput
            className="cash-input"
            placeholder="예: 1,250.75"
            value={depositUsdInput}
            onValueChange={onDepositUsdChange}
            allowDecimal
            maxDecimals={2}
            disabled={!isAuthed}
          />
        </label>
        <label>
          현금 (KRW)
          <FormattedNumberInput
            className="cash-input"
            placeholder="예: 500,000"
            value={cashInput}
            onValueChange={onCashChange}
            disabled={!isAuthed}
          />
        </label>
        <div className="fx-meta">
          <div className="fx-meta-line">
            <strong>{fxSummaryText}</strong>
          </div>
          {quoteWarningLine ? (
            <div className="quote-warning">
              <span>{quoteWarningLine}</span>
              {unmatchedKrDisplayTickers.length > 0 ? (
                <span className="quote-warning-links">
                  {unmatchedKrDisplayTickers.map((ticker) => (
                    <button
                      key={ticker}
                      type="button"
                      className="quote-unmatched-link"
                      onClick={() => onOpenManualKrCodeModal(ticker)}
                    >
                      {ticker}
                    </button>
                  ))}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

export default PortfolioCashInputs;
