"use client";

import { MarketSnapshot } from "@/lib/models/types";
import { categoryBadgeClass } from "@/components/market/marketSnapshotUi";
import { MarketSnapshotDetailPanel } from "@/components/market/MarketSnapshotDetailPanel";

interface MarketSnapshotListViewProps {
  sectionFilter: string;
  sectionOptions: string[];
  searchedItemsCount: number;
  sectionCounts: Map<string, number>;
  filteredItemsCount: number;
  listSectionNames: string[];
  groupedListItems: Map<string, MarketSnapshot[]>;
  openSections: Record<string, boolean>;
  selectedItem: MarketSnapshot | null;
  onSectionFilterChange: (value: string) => void;
  onToggleSection: (section: string) => void;
  onSelectItem: (id: string) => void;
  onZoomImage: (url: string) => void;
}

export function MarketSnapshotListView({
  sectionFilter,
  sectionOptions,
  searchedItemsCount,
  sectionCounts,
  filteredItemsCount,
  listSectionNames,
  groupedListItems,
  openSections,
  selectedItem,
  onSectionFilterChange,
  onToggleSection,
  onSelectItem,
  onZoomImage,
}: MarketSnapshotListViewProps) {
  return (
    <section className="market-list-mode-panel">
      <div className="market-list-outer">
        <div className="market-list-layout">
          <aside className="market-list-left-pane">
            <div className="market-list-left-header">
              <label className="market-section-select market-section-select-left">
                <span>Section</span>
                <select
                  value={sectionFilter}
                  onChange={(event) => onSectionFilterChange(event.target.value)}
                >
                  {sectionOptions.map((section) => {
                    if (section === "ALL") {
                      return (
                        <option key={section} value={section}>
                          All ({searchedItemsCount})
                        </option>
                      );
                    }

                    return (
                      <option key={section} value={section}>
                        {section} ({sectionCounts.get(section) ?? 0})
                      </option>
                    );
                  })}
                </select>
              </label>
              <div className="market-list-info-label">{filteredItemsCount} items</div>
            </div>

            <div className="market-list-scroll-area">
              {listSectionNames.map((section) => {
                if (section === "ALL") {
                  return null;
                }

                const rows = groupedListItems.get(section) ?? [];
                const isOpen = sectionFilter === "ALL" ? openSections[section] : true;

                return (
                  <div key={section} className="market-section-group">
                    <button
                      type="button"
                      className="market-section-header"
                      onClick={() => {
                        if (sectionFilter === "ALL") {
                          onToggleSection(section);
                        }
                      }}
                    >
                      <strong>{section}</strong>
                      <span>{rows.length}</span>
                      <span
                        className={`market-section-chevron${isOpen ? "" : " is-collapsed"}`}
                      >
                        ▼
                      </span>
                    </button>
                    {isOpen ? (
                      <div className="market-section-rows">
                        {rows.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`market-list-row${item.id === selectedItem?.id ? " is-selected" : ""}`}
                            onClick={() => onSelectItem(item.id)}
                          >
                            <div className="market-list-row-head">
                              <strong>{item.title}</strong>
                              <span className={categoryBadgeClass(item.category)}>
                                {item.category}
                              </span>
                            </div>
                            <div className="market-list-row-meta">
                              <span>{item.symbol}</span>
                              <span>{item.snapshotKey}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </aside>

          <MarketSnapshotDetailPanel item={selectedItem} onZoomImage={onZoomImage} />
        </div>
      </div>
    </section>
  );
}

export default MarketSnapshotListView;
