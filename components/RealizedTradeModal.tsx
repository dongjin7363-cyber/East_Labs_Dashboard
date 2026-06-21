"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Modal } from "@/components/Modal";
import { Currency, Market, RealizedTrade } from "@/lib/models/types";
import { RealizedTradeInput } from "@/lib/services/realizedTradeService";
import { todayYmd } from "@/lib/utils/date";
import { parsePriceInputToInt, priceIntToInput } from "@/lib/utils/money";

interface RealizedTradeModalProps {
  open: boolean;
  mode: "create" | "edit";
  trade?: RealizedTrade;
  onClose: () => void;
  onSubmit: (input: RealizedTradeInput) => void;
}

interface RealizedTradeFormState {
  date: string;
  market: Market;
  ticker: string;
  qty: string;
  buyPriceInt: string;
  sellPriceInt: string;
  returnPct: string;
}

const EMPTY_FORM: RealizedTradeFormState = {
  date: todayYmd(),
  market: "KR",
  ticker: "",
  qty: "",
  buyPriceInt: "",
  sellPriceInt: "",
  returnPct: "",
};

function currencyByMarket(market: Market): Currency {
  return market === "US" ? "USD" : "KRW";
}

function toPositiveInt(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

export function RealizedTradeModal({
  open,
  mode,
  trade,
  onClose,
  onSubmit,
}: RealizedTradeModalProps) {
  const [form, setForm] = useState<RealizedTradeFormState>(EMPTY_FORM);

  const currency = useMemo(() => currencyByMarket(form.market), [form.market]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (trade) {
      const tradeCurrency = currencyByMarket(trade.market);

      setForm({
        date: trade.date,
        market: trade.market,
        ticker: trade.ticker,
        qty: `${trade.qty}`,
        buyPriceInt: priceIntToInput(tradeCurrency, trade.buyPriceInt),
        sellPriceInt: priceIntToInput(tradeCurrency, trade.sellPriceInt),
        returnPct: `${trade.returnPct}`,
      });
      return;
    }

    setForm({ ...EMPTY_FORM, date: todayYmd() });
  }, [open, trade]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.date) {
      window.alert("Date를 입력하세요.");
      return;
    }

    if (!form.ticker.trim()) {
      window.alert("Ticker를 입력하세요.");
      return;
    }

    const qty = toPositiveInt(form.qty);
    if (qty === null) {
      window.alert("Qty는 1 이상의 정수여야 합니다.");
      return;
    }

    const buyPriceInt = parsePriceInputToInt(currency, form.buyPriceInt);
    const sellPriceInt = parsePriceInputToInt(currency, form.sellPriceInt);

    if (buyPriceInt === null || sellPriceInt === null) {
      window.alert(
        currency === "KRW"
          ? "Buy/Sell Price는 KRW 정수(원)로 입력하세요."
          : "Buy/Sell Price는 USD 소수점 2자리까지 입력하세요.",
      );
      return;
    }

    const returnPct = form.returnPct.trim()
      ? Number(form.returnPct.replace(/,/g, ""))
      : undefined;
    if (form.returnPct.trim() && !Number.isFinite(returnPct)) {
      window.alert("Return%는 숫자여야 합니다.");
      return;
    }

    onSubmit({
      date: form.date,
      market: form.market,
      ticker: form.ticker,
      qty,
      buyPriceInt,
      buyAmountInt: undefined,
      sellPriceInt,
      sellAmountInt: undefined,
      returnPct,
      content: "",
      rating: "",
    });

    onClose();
  };

  return (
    <Modal
      open={open}
      title={mode === "create" ? "Realized Position" : "Realized Position 수정"}
      onClose={onClose}
      cardClassName="rtm-form-modal"
    >
      <form onSubmit={handleSubmit}>
        <div className="rtm-grid">
          <label className="rtm-label">
            Date
            <input
              type="date"
              className="rtm-input"
              value={form.date}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, date: event.target.value }))
              }
            />
          </label>

          <label className="rtm-label">
            Market
            <select
              className="rtm-input"
              value={form.market}
              onChange={(event) => {
                const nextMarket = event.target.value as Market;
                setForm((prev) => ({
                  ...prev,
                  market: nextMarket,
                  buyPriceInt: "",
                  sellPriceInt: "",
                }));
              }}
            >
              <option value="KR">KR</option>
              <option value="US">US</option>
            </select>
          </label>

          <label className="rtm-label">
            Ticker
            <input
              className="rtm-input"
              value={form.ticker}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, ticker: event.target.value }))
              }
              placeholder="AAPL / POET / 삼성전자"
            />
          </label>

          <label className="rtm-label">
            Qty
            <FormattedNumberInput
              className="rtm-input"
              value={form.qty}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, qty: rawValue }))
              }
            />
          </label>

          <label className="rtm-label">
            Buy Price ({currency === "KRW" ? "KRW" : "USD"})
            <FormattedNumberInput
              className="rtm-input"
              value={form.buyPriceInt}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, buyPriceInt: rawValue }))
              }
              placeholder={currency === "KRW" ? "예: 75400" : "예: 13.61"}
            />
          </label>

          <label className="rtm-label">
            Sell Price ({currency === "KRW" ? "KRW" : "USD"})
            <FormattedNumberInput
              className="rtm-input"
              value={form.sellPriceInt}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, sellPriceInt: rawValue }))
              }
              placeholder={currency === "KRW" ? "예: 76000" : "예: 14.05"}
            />
          </label>

          <label className="rtm-label">
            Return% (선택)
            <FormattedNumberInput
              className="rtm-input"
              value={form.returnPct}
              allowDecimal
              maxDecimals={2}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, returnPct: rawValue }))
              }
              placeholder="비우면 자동 계산"
            />
          </label>
        </div>

        <div className="rtm-actions">
          <button type="button" className="rtm-btn-cancel" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="rtm-btn-save">
            저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
