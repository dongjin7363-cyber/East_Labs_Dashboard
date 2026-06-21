"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Modal } from "@/components/Modal";
import {
  Currency,
  Market,
  PortfolioHolding,
  PORTFOLIO_SECTORS,
  PortfolioSector,
} from "@/lib/models/types";
import { PortfolioInput } from "@/lib/services/portfolioService";
import {
  parsePriceInputToInt,
  priceInputPlaceholder,
  priceIntToInput,
} from "@/lib/utils/money";

interface PortfolioFormModalProps {
  open: boolean;
  mode: "create" | "edit";
  holding?: PortfolioHolding;
  onClose: () => void;
  onSubmit: (input: PortfolioInput) => void;
  onDelete?: () => void;
}

interface PortfolioFormState {
  market: Market;
  ticker: string;
  displayName: string;
  tickerCode: string;
  logoUrl: string;
  quoteDisabled: boolean;
  isCredit: boolean;
  sector: PortfolioSector;
  qty: string;
  avgPrice: string;
}

const EMPTY_FORM: PortfolioFormState = {
  market: "KR",
  ticker: "",
  displayName: "",
  tickerCode: "",
  logoUrl: "",
  quoteDisabled: false,
  isCredit: false,
  sector: "Other",
  qty: "",
  avgPrice: "",
};

function currencyByMarket(market: Market): Currency {
  return market === "KR" ? "KRW" : "USD";
}

export function PortfolioFormModal({
  open,
  mode,
  holding,
  onClose,
  onSubmit,
  onDelete,
}: PortfolioFormModalProps) {
  const [form, setForm] = useState<PortfolioFormState>(EMPTY_FORM);

  const title = mode === "create" ? "보유자산 추가" : "보유자산 수정";

  useEffect(() => {
    if (!open) {
      return;
    }

    if (holding) {
      const currency = holding.currency;

      setForm({
        market: holding.market,
        ticker: holding.ticker,
        displayName: holding.displayName ?? "",
        tickerCode: holding.tickerCode ?? holding.krCode ?? "",
        logoUrl: holding.logoUrl ?? "",
        quoteDisabled: holding.quoteDisabled ?? false,
        isCredit: holding.isCredit === true,
        sector: holding.sector ?? "Other",
        qty: `${holding.qty}`,
        avgPrice: priceIntToInput(currency, holding.avgPrice),
      });
      return;
    }

    setForm({ ...EMPTY_FORM });
  }, [open, holding]);

  const currency = useMemo(() => currencyByMarket(form.market), [form.market]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.ticker.trim()) {
      window.alert("종목코드(티커)를 입력하세요.");
      return;
    }

    if (!form.displayName.trim()) {
      window.alert("종목명을 입력하세요.");
      return;
    }

    if (!/^\d+$/.test(form.qty.trim())) {
      window.alert("Qty는 1 이상의 정수로 입력하세요.");
      return;
    }

    const qty = Number.parseInt(form.qty, 10);

    if (qty <= 0) {
      window.alert("수량은 1 이상이어야 합니다.");
      return;
    }

    const avgPrice = parsePriceInputToInt(currency, form.avgPrice);
    if (avgPrice === null) {
      window.alert(
        currency === "KRW"
          ? "AvgPrice는 KRW 정수로 입력하세요."
          : "AvgPrice는 USD 소수점 2자리까지 입력하세요. (예: 13.61)",
      );
      return;
    }

    const normalizedTicker = form.ticker.trim();

    onSubmit({
      market: form.market,
      currency,
      ticker: normalizedTicker,
      displayName: form.displayName.trim(),
      tickerCode: normalizedTicker,
      logoUrl: form.logoUrl,
      comment: holding?.comment ?? "",
      quoteDisabled: form.quoteDisabled,
      isCredit: form.isCredit,
      sector: form.sector,
      qty,
      avgPrice,
      currentPrice: 0,
    });
    onClose();
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      cardClassName="portfolio-form-modal"
    >
      <form onSubmit={handleSubmit}>
        <div className="pfm-form">
          {/* Row 1: Market | 신용종목 */}
          <div className="pfm-row pfm-row-1">
            <label className="pfm-field">
              Market
              <select
                value={form.market}
                onChange={(event) => {
                  const nextMarket = event.target.value as Market;
                  setForm((prev) => ({ ...prev, market: nextMarket }));
                }}
              >
                <option value="KR">KR</option>
                <option value="US">US</option>
              </select>
            </label>
            <label className="pfm-field pfm-credit">
              신용종목
              <input
                type="checkbox"
                checked={form.isCredit}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, isCredit: event.target.checked }))
                }
              />
            </label>
          </div>

          {/* Row 2: 종목코드(티커) | 종목명 */}
          <div className="pfm-row pfm-row-2">
            <label className="pfm-field">
              종목코드(티커)
              <input
                value={form.ticker}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ticker: event.target.value }))
                }
                placeholder="예: 475830 / AAPL"
              />
            </label>
            <label className="pfm-field">
              종목명
              <input
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, displayName: event.target.value }))
                }
                placeholder="예: 오름테라퓨틱 / Apple"
              />
            </label>
          </div>

          {/* Row 3: Sector | Qty | AvgPrice */}
          <div className="pfm-row pfm-row-3">
            <label className="pfm-field">
              Sector
              <select
                value={form.sector}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    sector: event.target.value as PortfolioSector,
                  }))
                }
              >
                {PORTFOLIO_SECTORS.map((sector) => (
                  <option key={sector} value={sector}>
                    {sector}
                  </option>
                ))}
              </select>
            </label>
            <label className="pfm-field">
              Qty
              <FormattedNumberInput
                value={form.qty}
                onValueChange={(rawValue) =>
                  setForm((prev) => ({ ...prev, qty: rawValue }))
                }
                placeholder="예: 10"
              />
            </label>
            <label className="pfm-field">
              AvgPrice
              <FormattedNumberInput
                value={form.avgPrice}
                allowDecimal={currency === "USD"}
                maxDecimals={currency === "USD" ? 2 : undefined}
                onValueChange={(rawValue) =>
                  setForm((prev) => ({ ...prev, avgPrice: rawValue }))
                }
                placeholder={priceInputPlaceholder(currency)}
              />
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            Save
          </button>
          {mode === "edit" && onDelete ? (
            <button
              type="button"
              className="danger-button"
              onClick={onDelete}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}
