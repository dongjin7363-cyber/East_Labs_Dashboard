"use client";

import { ReactNode } from "react";
import { Currency } from "@/lib/models/types";
import { percentFormat } from "@/lib/utils/money";
import { PageHeader } from "@/components/PageHeader";

type RenderMoney = (
  currency: Currency,
  amountInt: number,
  mode?: "default" | "table",
) => ReactNode;

interface PortfolioHeaderBarProps {
  totalAssetKrw: number;
  totalPnlPct: number | null;
  accountPnlKrw: number;
  renderMoney: RenderMoney;
  isAuthed: boolean;
  isRefreshingQuotes: boolean;
  onRefreshQuotes: () => void | Promise<void>;
  onCreate: () => void;
}

export function PortfolioHeaderBar({
  totalAssetKrw,
  totalPnlPct,
  accountPnlKrw,
  renderMoney,
  isAuthed,
  isRefreshingQuotes,
  onRefreshQuotes,
  onCreate,
}: PortfolioHeaderBarProps) {
  return (
    <PageHeader
      title="Portfolio"
      titleMeta={
        <span className="inline-title-metric">
          <span className="inline-title-divider">|</span>
          <span className="inline-title-metric-label">총 자산(KRW)</span>
          {renderMoney("KRW", totalAssetKrw)}
          <span className="inline-title-divider">|</span>
          <span className="inline-title-metric-label">총 PNL %</span>
          <strong
            style={{
              color:
                totalPnlPct === null
                  ? "var(--muted)"
                  : totalPnlPct >= 0
                    ? "var(--positive)"
                    : "var(--negative)",
            }}
          >
            {totalPnlPct === null ? "—" : percentFormat(totalPnlPct)}
          </strong>
          <span className="inline-title-divider">|</span>
          <span className="inline-title-metric-label">총 계좌 손익(KRW)</span>
          <span
            style={{
              color:
                accountPnlKrw >= 0 ? "var(--positive)" : "var(--negative)",
            }}
          >
            {renderMoney("KRW", accountPnlKrw)}
          </span>
        </span>
      }
      actions={
        <>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              void onRefreshQuotes();
            }}
            disabled={!isAuthed || isRefreshingQuotes}
          >
            {isRefreshingQuotes ? "현재가 갱신 중..." : "현재가 갱신"}
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onCreate}
            disabled={!isAuthed}
          >
            추가
          </button>
        </>
      }
    />
  );
}

export default PortfolioHeaderBar;
