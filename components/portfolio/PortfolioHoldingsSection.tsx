"use client";

import { ReactNode } from "react";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineFilterRow } from "@/components/common/InlineFilterRow";
import { SectionCard } from "@/components/common/SectionCard";
import { HoldingAvatar } from "@/components/portfolio/HoldingAvatar";
import { Currency, Market, PortfolioHolding } from "@/lib/models/types";
import { resolveHoldingTickerMeta } from "@/lib/portfolio/display";
import { percentFormat } from "@/lib/utils/money";
import { SortState } from "@/lib/utils/sort";

export type PortfolioSortKey =
  | "ticker"
  | "dailyChangeRate"
  | "extendedChangeRate"
  | "avgPrice"
  | "currentPrice"
  | "qty"
  | "marketValue"
  | "pnl"
  | "pnlRate"
  | "comment";

export interface PortfolioTableRow {
  holding: PortfolioHolding;
  computed: {
    marketValue: number;
    pnl: number;
    pnlRate: number;
  };
  dailyChangeRate: number | null;
  extendedChangeRate: number | null;
  defaultIndex: number;
}

type RenderMoney = (
  currency: Currency,
  amountInt: number,
  mode?: "default" | "table",
) => ReactNode;

interface PortfolioHoldingsSectionProps {
  market: "ALL" | Market;
  search: string;
  onMarketChange: (market: "ALL" | Market) => void;
  onSearchChange: (value: string) => void;
  sortState: SortState<PortfolioSortKey>;
  onSortClick: (key: PortfolioSortKey) => void;
  loading: boolean;
  rows: PortfolioTableRow[];
  onEdit: (holding: PortfolioHolding) => void;
  renderMoney: RenderMoney;
  resolveHoldingDisplayName: (holding: PortfolioHolding) => string;
  commentDrafts: Record<string, string>;
  onCommentDraftChange: (holdingId: string, value: string) => void;
  onCommitComment: (holding: PortfolioHolding) => void;
  isAuthed: boolean;
}

function formatDailyChangeLabel(rate: number): string {
  if (rate > 0) {
    return `↑ ${percentFormat(rate)}`;
  }

  if (rate < 0) {
    return `↓ ${percentFormat(rate)}`;
  }

  return percentFormat(rate);
}

function getSortIndicator(
  sortState: SortState<PortfolioSortKey>,
  key: PortfolioSortKey,
): string {
  if (sortState.key !== key || !sortState.mode) {
    return "↑↓";
  }

  return sortState.mode === "DESC" ? "▼" : "▲";
}

function getSortIndicatorClassName(
  sortState: SortState<PortfolioSortKey>,
  key: PortfolioSortKey,
): string {
  return `sort-indicator${sortState.key === key && sortState.mode ? " is-active" : " is-hint"}`;
}

function getSortButtonClassName(
  sortState: SortState<PortfolioSortKey>,
  key: PortfolioSortKey,
): string {
  return `table-sort-button${sortState.key === key && sortState.mode ? " is-active" : ""}`;
}

function SortHeader({
  label,
  sortKey,
  sortState,
  onSortClick,
}: {
  label: string;
  sortKey: PortfolioSortKey;
  sortState: SortState<PortfolioSortKey>;
  onSortClick: (key: PortfolioSortKey) => void;
}) {
  return (
    <button
      type="button"
      className={getSortButtonClassName(sortState, sortKey)}
      onClick={() => onSortClick(sortKey)}
    >
      {label}
      <span className={getSortIndicatorClassName(sortState, sortKey)}>
        {getSortIndicator(sortState, sortKey)}
      </span>
    </button>
  );
}

export function PortfolioHoldingsSection({
  market,
  search,
  onMarketChange,
  onSearchChange,
  sortState,
  onSortClick,
  loading,
  rows,
  onEdit,
  renderMoney,
  resolveHoldingDisplayName,
  commentDrafts,
  onCommentDraftChange,
  onCommitComment,
  isAuthed,
}: PortfolioHoldingsSectionProps) {
  return (
    <SectionCard>
      <InlineFilterRow
        leftClassName="filter-row"
        leftControls={
          <>
            <label>
              Market
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={market === "ALL" ? "primary-button" : "secondary-button"}
                  onClick={() => onMarketChange("ALL")}
                >
                  ALL
                </button>
                <button
                  type="button"
                  className={market === "KR" ? "primary-button" : "secondary-button"}
                  onClick={() => onMarketChange("KR")}
                >
                  KR
                </button>
                <button
                  type="button"
                  className={market === "US" ? "primary-button" : "secondary-button"}
                  onClick={() => onMarketChange("US")}
                >
                  US
                </button>
              </div>
            </label>

            <label>
              검색
              <input
                placeholder="Ticker"
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
              />
            </label>
          </>
        }
      />

      <div className="table-wrap portfolio-table-wrap">
        <table className="portfolio-holdings-table">
          <colgroup>
            <col className="portfolio-col-holding" />
            <col className="portfolio-col-change" />
            <col className="portfolio-col-change" />
            <col className="portfolio-col-price" />
            <col className="portfolio-col-price" />
            <col className="portfolio-col-qty" />
            <col className="portfolio-col-value" />
            <col className="portfolio-col-value" />
            <col className="portfolio-col-rate" />
            <col className="portfolio-col-comment" />
          </colgroup>
          <thead>
            <tr>
              <th>
                <SortHeader
                  label="종목"
                  sortKey="ticker"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="1일 등락률"
                  sortKey="dailyChangeRate"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="장외 등락률"
                  sortKey="extendedChangeRate"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Avg Price"
                  sortKey="avgPrice"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Current Price"
                  sortKey="currentPrice"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Qty"
                  sortKey="qty"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Market Value"
                  sortKey="marketValue"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="PnL"
                  sortKey="pnl"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="PnL%"
                  sortKey="pnlRate"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Comment"
                  sortKey="comment"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10}>로딩 중...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10}>
                  <EmptyState title="데이터가 없습니다." compact />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const { holding, computed } = row;
                const displayName = resolveHoldingDisplayName(holding);

                return (
                  <tr
                    key={holding.id}
                    className="clickable-row"
                    onClick={() => onEdit(holding)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEdit(holding);
                      }
                    }}
                    tabIndex={0}
                  >
                    <td>
                      <div className="holding-info-cell">
                        <HoldingAvatar
                          market={holding.market}
                          ticker={holding.ticker}
                          logoUrl={holding.logoUrl}
                          label={displayName}
                        />
                        <div className="holding-info-text">
                          <strong className="holding-display-name">
                            <span>{displayName}</span>
                            {holding.isCredit ? (
                              <span className="holding-credit-badge">(신용)</span>
                            ) : null}
                          </strong>
                          <span className="holding-ticker-meta">
                            {resolveHoldingTickerMeta(holding)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {row.dailyChangeRate === null ? (
                        <span className="daily-change-pill is-muted">—</span>
                      ) : (
                        <span
                          className={`daily-change-pill ${
                            row.dailyChangeRate > 0
                              ? "is-positive"
                              : row.dailyChangeRate < 0
                                ? "is-negative"
                                : "is-neutral"
                          }`}
                        >
                          {formatDailyChangeLabel(row.dailyChangeRate)}
                        </span>
                      )}
                    </td>
                    <td>
                      {row.extendedChangeRate === null ? (
                        <span className="daily-change-pill is-muted">—</span>
                      ) : (
                        <span
                          className={`daily-change-pill ${
                            row.extendedChangeRate > 0
                              ? "is-positive"
                              : row.extendedChangeRate < 0
                                ? "is-negative"
                                : "is-neutral"
                          }`}
                        >
                          {formatDailyChangeLabel(row.extendedChangeRate)}
                        </span>
                      )}
                    </td>
                    <td>{renderMoney(holding.currency, holding.avgPrice, "table")}</td>
                    <td>{renderMoney(holding.currency, holding.currentPrice, "table")}</td>
                    <td>{holding.qty}</td>
                    <td>{renderMoney(holding.currency, computed.marketValue, "table")}</td>
                    <td
                      className="font-semibold"
                      style={{
                        color: computed.pnl >= 0 ? "var(--positive)" : "var(--negative)",
                      }}
                    >
                      {renderMoney(holding.currency, computed.pnl, "table")}
                    </td>
                    <td
                      className="font-semibold"
                      style={{
                        color:
                          computed.pnlRate >= 0
                            ? "var(--positive)"
                            : "var(--negative)",
                      }}
                    >
                      {percentFormat(computed.pnlRate)}
                    </td>
                    <td
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <input
                        className="portfolio-comment-input"
                        value={commentDrafts[holding.id] ?? holding.comment ?? ""}
                        placeholder="메모"
                        onChange={(event) =>
                          onCommentDraftChange(holding.id, event.target.value)
                        }
                        onBlur={() => onCommitComment(holding)}
                        onKeyDown={(event) => {
                          event.stopPropagation();

                          if (event.key === "Enter") {
                            event.preventDefault();
                            onCommitComment(holding);
                            event.currentTarget.blur();
                          }
                        }}
                        disabled={!isAuthed}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default PortfolioHoldingsSection;
