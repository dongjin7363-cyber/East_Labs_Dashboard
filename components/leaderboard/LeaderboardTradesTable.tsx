"use client";

import { RealizedTrade } from "@/lib/models/types";
import { resolveTradeCurrency } from "@/lib/services/realizedTradeService";
import { moneyFormat, percentFormat } from "@/lib/utils/money";
import { SortState } from "@/lib/utils/sort";

export type LeaderboardSortKey =
  | "date"
  | "market"
  | "ticker"
  | "qty"
  | "buyPriceInt"
  | "sellPriceInt"
  | "returnPct"
  | "pnlInt"
  | "rating";

interface LeaderboardTradesTableProps {
  loading: boolean;
  trades: RealizedTrade[];
  sortState: SortState<LeaderboardSortKey>;
  onSortClick: (key: LeaderboardSortKey) => void;
  onSelectTrade: (trade: RealizedTrade) => void;
}

function sortIndicator(
  sortState: SortState<LeaderboardSortKey>,
  key: LeaderboardSortKey,
): string {
  if (sortState.key !== key || !sortState.mode) {
    return "";
  }

  return sortState.mode === "DESC" ? "▼" : "▲";
}

function SortHeader({
  label,
  sortKey,
  sortState,
  onSortClick,
}: {
  label: string;
  sortKey: LeaderboardSortKey;
  sortState: SortState<LeaderboardSortKey>;
  onSortClick: (key: LeaderboardSortKey) => void;
}) {
  return (
    <button
      type="button"
      className="table-sort-button"
      onClick={() => onSortClick(sortKey)}
    >
      {label}
      <span className="sort-indicator">{sortIndicator(sortState, sortKey)}</span>
    </button>
  );
}

export function LeaderboardTradesTable({
  loading,
  trades,
  sortState,
  onSortClick,
  onSelectTrade,
}: LeaderboardTradesTableProps) {
  return (
    <section className="panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>
                <SortHeader
                  label="Date"
                  sortKey="date"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Market"
                  sortKey="market"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Ticker"
                  sortKey="ticker"
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
                  label="BuyPrice"
                  sortKey="buyPriceInt"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="SellPrice"
                  sortKey="sellPriceInt"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Return%"
                  sortKey="returnPct"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="PnL"
                  sortKey="pnlInt"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>
                <SortHeader
                  label="Rating"
                  sortKey="rating"
                  sortState={sortState}
                  onSortClick={onSortClick}
                />
              </th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10}>로딩 중...</td>
              </tr>
            ) : trades.length === 0 ? (
              <tr>
                <td colSpan={10} className="empty-state">
                  데이터가 없습니다.
                </td>
              </tr>
            ) : (
              trades.map((trade) => {
                const currency = resolveTradeCurrency(trade.market);

                return (
                  <tr
                    key={trade.id}
                    className="clickable-row"
                    onClick={() => onSelectTrade(trade)}
                  >
                    <td>{trade.date}</td>
                    <td>{trade.market}</td>
                    <td>{trade.ticker}</td>
                    <td>{trade.qty}</td>
                    <td>{moneyFormat(currency, trade.buyPriceInt)}</td>
                    <td>{moneyFormat(currency, trade.sellPriceInt)}</td>
                    <td
                      style={{
                        color:
                          trade.returnPct >= 0
                            ? "var(--positive)"
                            : "var(--negative)",
                      }}
                    >
                      {percentFormat(trade.returnPct)}
                    </td>
                    <td
                      style={{
                        color:
                          trade.pnlInt >= 0 ? "var(--positive)" : "var(--negative)",
                      }}
                    >
                      {moneyFormat(currency, trade.pnlInt)}
                    </td>
                    <td>{trade.rating || "-"}</td>
                    <td>{trade.content || "-"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default LeaderboardTradesTable;
