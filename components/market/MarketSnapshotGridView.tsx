"use client";

import { MarketSnapshot } from "@/lib/models/types";
import { categoryBadgeClass } from "@/components/market/marketSnapshotUi";

interface MarketSnapshotGridViewProps {
  items: MarketSnapshot[];
  onZoomImage: (url: string) => void;
}

export function MarketSnapshotGridView({
  items,
  onZoomImage,
}: MarketSnapshotGridViewProps) {
  return (
    <div className="market-snapshot-grid">
      {items.map((item) => (
        <article key={item.id} className="market-snapshot-card">
          <div className="market-snapshot-head">
            <strong className="market-snapshot-title">{item.title}</strong>
            <span className={categoryBadgeClass(item.category)}>{item.category}</span>
          </div>
          <button
            type="button"
            className="market-snapshot-image-button"
            onClick={() => onZoomImage(item.imageUrl)}
          >
            <img className="market-snapshot-image" src={item.imageUrl} alt={item.title} />
          </button>
          <div className="market-snapshot-foot">
            <span>{item.symbol}</span>
            <span className="market-snapshot-section">{item.section}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

export default MarketSnapshotGridView;
