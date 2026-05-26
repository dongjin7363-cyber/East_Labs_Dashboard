"use client";

import { useMemo, useState } from "react";
import { FinvizWatchlistItem } from "@/lib/models/types";
import { useFinvizWatchlist } from "@/lib/hooks/useFinvizWatchlist";

const ALL_SECTOR = "전체";
const ALL_IMPORTANCE = "ALL";
const IMPORTANCE_OPTIONS = [ALL_IMPORTANCE, "★★★", "★★", "★"] as const;
const INITIAL_VISIBLE_COUNT = 36;
const VISIBLE_INCREMENT = 36;

function quoteUrl(ticker: string): string {
  return `https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`;
}

function matchesSearch(item: FinvizWatchlistItem, query: string): boolean {
  if (!query) return true;
  const haystack = [item.ticker, item.displayName, item.keywords, item.sector]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function matchesImportance(item: FinvizWatchlistItem, importance: string): boolean {
  return importance === ALL_IMPORTANCE || item.star === importance;
}

function FinvizChartCard({ item }: { item: FinvizWatchlistItem }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = item.chartUrl;

  return (
    <article className="finviz-card">
      <div className="finviz-card-meta">
        <div className="finviz-card-title-row">
          <div className="finviz-card-title-main">
            <span className="finviz-ticker-text">{item.ticker}</span>
            {item.displayName ? (
              <span className="finviz-display-name">{item.displayName}</span>
            ) : null}
          </div>
          <div className="finviz-card-badges">
            {item.star ? <span className="finviz-star-badge">{item.star}</span> : null}
            <span className="finviz-sector-badge">{item.sector}</span>
          </div>
        </div>
        <p className="finviz-keywords">{item.keywords}</p>
      </div>

      <div className="finviz-chart-frame">
        {imageFailed ? (
          <div className="finviz-chart-fallback">
            <span>차트를 불러오지 못했습니다</span>
            <a href={quoteUrl(item.ticker)} target="_blank" rel="noreferrer">
              Finviz에서 {item.ticker} 보기
            </a>
          </div>
        ) : (
          <img
            src={src}
            alt={`${item.ticker} Finviz chart`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>
    </article>
  );
}

export function MarketFinvizScreeningBoard() {
  const { items, sectors, loading, error } = useFinvizWatchlist();
  const [activeSector, setActiveSector] = useState(ALL_SECTOR);
  const [activeImportance, setActiveImportance] = useState(ALL_IMPORTANCE);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const sectorMatch = activeSector === ALL_SECTOR || item.sector === activeSector;
      return (
        sectorMatch &&
        matchesImportance(item, activeImportance) &&
        matchesSearch(item, query.trim())
      );
    });
  }, [activeImportance, activeSector, items, query]);

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleItems.length < filteredItems.length;

  function handleSectorClick(sector: string) {
    setActiveSector(sector);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }

  function handleImportanceClick(importance: string) {
    setActiveImportance(importance);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    setVisibleCount(INITIAL_VISIBLE_COUNT);
  }

  if (loading) {
    return <div className="panel finviz-loading">Finviz watchlist 로딩 중…</div>;
  }

  if (error) {
    return <div className="panel finviz-error">Finviz watchlist 로딩 실패: {error}</div>;
  }

  return (
    <div className="finviz-board">
      <div className="panel finviz-controls">
        <div className="finviz-control-header">
          <div>
            <h3>Finviz Watchlist</h3>
            <p>{items.length}개 ETF·종목</p>
          </div>
          <input
            className="finviz-search-input"
            value={query}
            onChange={(event) => handleQueryChange(event.target.value)}
            placeholder="ticker / 종목명 / keyword 검색"
          />
        </div>
        <div className="finviz-sector-tabs">
          {[ALL_SECTOR, ...sectors].map((sector) => (
            <button
              key={sector}
              type="button"
              className={`market-category-tab${activeSector === sector ? " is-active" : ""}`}
              onClick={() => handleSectorClick(sector)}
            >
              {sector}
            </button>
          ))}
        </div>
        <div className="finviz-importance-tabs">
          {IMPORTANCE_OPTIONS.map((importance) => (
            <button
              key={importance}
              type="button"
              className={`market-category-tab${activeImportance === importance ? " is-active" : ""}`}
              onClick={() => handleImportanceClick(importance)}
            >
              {importance}
            </button>
          ))}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="panel finviz-loading">조건에 맞는 종목이 없습니다</div>
      ) : (
        <>
          <div className="finviz-card-grid">
            {visibleItems.map((item) => (
              <FinvizChartCard key={item.id} item={item} />
            ))}
          </div>
          {hasMore ? (
            <div className="finviz-load-more-wrap">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setVisibleCount((prev) => prev + VISIBLE_INCREMENT)}
              >
                더보기 ({visibleItems.length}/{filteredItems.length})
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
