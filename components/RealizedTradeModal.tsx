"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FormattedNumberInput } from "@/components/FormattedNumberInput";
import { Modal } from "@/components/Modal";
import { Currency, Market, RealizedTrade, TradeRating } from "@/lib/models/types";
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
  buyAmountInt: string;
  sellPriceInt: string;
  sellAmountInt: string;
  returnPct: string;
  rating: TradeRating;
  content: string;
}

const EMPTY_FORM: RealizedTradeFormState = {
  date: todayYmd(),
  market: "KR",
  ticker: "",
  qty: "",
  buyPriceInt: "",
  buyAmountInt: "",
  sellPriceInt: "",
  sellAmountInt: "",
  returnPct: "",
  rating: "",
  content: "",
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
        buyAmountInt: priceIntToInput(tradeCurrency, trade.buyAmountInt),
        sellPriceInt: priceIntToInput(tradeCurrency, trade.sellPriceInt),
        sellAmountInt: priceIntToInput(tradeCurrency, trade.sellAmountInt),
        returnPct: `${trade.returnPct}`,
        rating: trade.rating,
        content: trade.content,
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

    const buyAmountInt = form.buyAmountInt.trim()
      ? parsePriceInputToInt(currency, form.buyAmountInt)
      : undefined;
    if (form.buyAmountInt.trim() && buyAmountInt === null) {
      window.alert(
        currency === "KRW"
          ? "Buy Amount는 KRW 정수(원)로 입력하세요."
          : "Buy Amount는 USD 소수점 2자리까지 입력하세요.",
      );
      return;
    }

    const sellAmountInt = form.sellAmountInt.trim()
      ? parsePriceInputToInt(currency, form.sellAmountInt)
      : undefined;
    if (form.sellAmountInt.trim() && sellAmountInt === null) {
      window.alert(
        currency === "KRW"
          ? "Sell Amount는 KRW 정수(원)로 입력하세요."
          : "Sell Amount는 USD 소수점 2자리까지 입력하세요.",
      );
      return;
    }

    const normalizedBuyAmountInt =
      buyAmountInt === null ? undefined : buyAmountInt;
    const normalizedSellAmountInt =
      sellAmountInt === null ? undefined : sellAmountInt;

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
      buyAmountInt: normalizedBuyAmountInt,
      sellPriceInt,
      sellAmountInt: normalizedSellAmountInt,
      returnPct,
      content: form.content,
      rating: form.rating,
    });

    onClose();
  };

  return (
    <Modal
      open={open}
      title={mode === "create" ? "실현 거래 추가" : "실현 거래 수정"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, date: event.target.value }))
              }
            />
          </label>

          <label>
            Market
            <select
              value={form.market}
              onChange={(event) => {
                const nextMarket = event.target.value as Market;

                setForm((prev) => ({
                  ...prev,
                  market: nextMarket,
                  buyPriceInt: "",
                  buyAmountInt: "",
                  sellPriceInt: "",
                  sellAmountInt: "",
                }));
              }}
            >
              <option value="KR">KR</option>
              <option value="US">US</option>
            </select>
          </label>

          <label>
            Ticker
            <input
              value={form.ticker}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, ticker: event.target.value }))
              }
              placeholder="AAPL / POET / 삼성전자"
            />
          </label>

          <label>
            Qty
            <FormattedNumberInput
              value={form.qty}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, qty: rawValue }))
              }
            />
          </label>

          <label>
            Buy Price ({currency === "KRW" ? "KRW" : "USD"})
            <FormattedNumberInput
              value={form.buyPriceInt}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, buyPriceInt: rawValue }))
              }
              placeholder={currency === "KRW" ? "예: 75400" : "예: 13.61"}
            />
          </label>

          <label>
            Buy Amount (선택)
            <FormattedNumberInput
              value={form.buyAmountInt}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, buyAmountInt: rawValue }))
              }
              placeholder={currency === "KRW" ? "예: 300000" : "예: 1200.50"}
            />
          </label>

          <label>
            Sell Price ({currency === "KRW" ? "KRW" : "USD"})
            <FormattedNumberInput
              value={form.sellPriceInt}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, sellPriceInt: rawValue }))
              }
              placeholder={currency === "KRW" ? "예: 76000" : "예: 14.05"}
            />
          </label>

          <label>
            Sell Amount (선택)
            <FormattedNumberInput
              value={form.sellAmountInt}
              allowDecimal={currency === "USD"}
              maxDecimals={currency === "USD" ? 2 : undefined}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, sellAmountInt: rawValue }))
              }
              placeholder={currency === "KRW" ? "예: 310000" : "예: 1280.20"}
            />
          </label>

          <label>
            Return% (선택)
            <FormattedNumberInput
              value={form.returnPct}
              allowDecimal
              maxDecimals={2}
              onValueChange={(rawValue) =>
                setForm((prev) => ({ ...prev, returnPct: rawValue }))
              }
              placeholder="비우면 자동 계산"
            />
          </label>

          <label>
            Rating
            <select
              value={form.rating}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, rating: event.target.value as TradeRating }))
              }
            >
              <option value="">-</option>
              <option value="Best">Best</option>
              <option value="Good">Good</option>
              <option value="Normal">Normal</option>
              <option value="Bad">Bad</option>
            </select>
          </label>

          <label className="full">
            Content
            <textarea
              rows={3}
              value={form.content}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, content: event.target.value }))
              }
              placeholder="매매 코멘트"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            취소
          </button>
          <button type="submit" className="primary-button">
            저장
          </button>
        </div>
      </form>
    </Modal>
  );
}
