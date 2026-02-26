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
  quoteDisabled: boolean;
  sector: PortfolioSector;
  qty: string;
  avgPrice: string;
  currentPrice: string;
}

const EMPTY_FORM: PortfolioFormState = {
  market: "KR",
  ticker: "",
  quoteDisabled: false,
  sector: "Other",
  qty: "",
  avgPrice: "",
  currentPrice: "",
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
        quoteDisabled: holding.quoteDisabled ?? false,
        sector: holding.sector ?? "Other",
        qty: `${holding.qty}`,
        avgPrice: priceIntToInput(currency, holding.avgPrice),
        currentPrice:
          holding.currentPrice > 0
            ? priceIntToInput(currency, holding.currentPrice)
            : "",
      });
      return;
    }

    setForm({ ...EMPTY_FORM });
  }, [open, holding]);

  const currency = useMemo(() => currencyByMarket(form.market), [form.market]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.ticker.trim()) {
      window.alert("Ticker를 입력하세요.");
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

    let currentPrice = 0;
    if (form.currentPrice.trim()) {
      const parsedCurrentPrice = parsePriceInputToInt(currency, form.currentPrice);
      if (parsedCurrentPrice === null) {
        window.alert(
          currency === "KRW"
            ? "CurrentPrice는 KRW 정수로 입력하세요."
            : "CurrentPrice는 USD 소수점 2자리까지 입력하세요. (예: 13.61)",
        );
        return;
      }

      currentPrice = parsedCurrentPrice;
    }

    onSubmit({
      market: form.market,
      currency,
      ticker: form.ticker,
      quoteDisabled: form.quoteDisabled,
      sector: form.sector,
      qty,
      avgPrice,
      currentPrice,
    });
    onClose();
  };

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Market
            <select
              value={form.market}
              onChange={(event) => {
                const nextMarket = event.target.value as Market;
                setForm((prev) => ({
                  ...prev,
                  market: nextMarket,
                }));
              }}
            >
              <option value="KR">KR</option>
              <option value="US">US</option>
            </select>
          </label>

          <label>
            Currency
            <input value={currency} disabled />
          </label>

          <label>
            Ticker
            <input
              value={form.ticker}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, ticker: event.target.value }))
              }
              placeholder="005930 / AAPL"
            />
          </label>

          <label>
            Quote
            <select
              value={form.quoteDisabled ? "MANUAL" : "AUTO"}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  quoteDisabled: event.target.value === "MANUAL",
                }))
              }
            >
              <option value="AUTO">자동 시세 조회</option>
              <option value="MANUAL">수동 입력 전용</option>
            </select>
          </label>

          <label>
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

          <label>
            Qty
            <FormattedNumberInput
              value={form.qty}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, qty: rawValue }))
              }
              placeholder="예: 10"
            />
          </label>

          <label>
            AvgPrice ({currency === "KRW" ? "KRW 정수" : "USD 소수점 2자리"})
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

          <label>
            CurrentPrice ({currency === "KRW" ? "KRW 정수" : "USD 소수점 2자리"}, 비워두면 자동조회)
            <FormattedNumberInput
              value={form.currentPrice}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, currentPrice: rawValue }))
              }
              placeholder={priceInputPlaceholder(currency)}
            />
          </label>
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
