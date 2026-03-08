"use client";

import { EmptyState } from "@/components/common/EmptyState";
import { MarketSnapshot } from "@/lib/models/types";
import { formatKST } from "@/lib/utils/time";

interface MarketSnapshotDetailPanelProps {
  item: MarketSnapshot | null;
  onZoomImage: (url: string) => void;
}

export function MarketSnapshotDetailPanel({
  item,
  onZoomImage,
}: MarketSnapshotDetailPanelProps) {
  if (!item) {
    return (
      <section className="market-detail-panel">
        <EmptyState title="선택된 항목이 없습니다." compact />
      </section>
    );
  }

  return (
    <section className="market-detail-panel">
      <button
        type="button"
        className="market-snapshot-image-button market-detail-image-button"
        onClick={() => onZoomImage(item.imageUrl)}
      >
        <img
          className="market-snapshot-image"
          src={item.imageUrl}
          alt={item.title}
        />
      </button>

      <div className="market-detail-meta-grid">
        <div className="market-kv-row">
          <span>Title</span>
          <strong>{item.title}</strong>
        </div>
        <div className="market-kv-row">
          <span>Symbol</span>
          <strong>{item.symbol}</strong>
        </div>
        <div className="market-kv-row">
          <span>Category</span>
          <strong>{item.category}</strong>
        </div>
        <div className="market-kv-row">
          <span>Section</span>
          <strong>{item.section}</strong>
        </div>
        <div className="market-kv-row">
          <span>Updated At</span>
          <strong>{formatKST(item.updatedAt)}</strong>
        </div>
      </div>
    </section>
  );
}

export default MarketSnapshotDetailPanel;
