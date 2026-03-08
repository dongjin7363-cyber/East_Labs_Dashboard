"use client";

type ViewMode = "grid" | "list";

interface MarketSnapshotFiltersProps {
  sectionFilter: string;
  sectionOptions: string[];
  searchedItemsCount: number;
  sectionCounts: Map<string, number>;
  search: string;
  viewMode: ViewMode;
  onSectionFilterChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onViewModeChange: (value: ViewMode) => void;
}

export function MarketSnapshotFilters({
  sectionFilter,
  sectionOptions,
  searchedItemsCount,
  sectionCounts,
  search,
  viewMode,
  onSectionFilterChange,
  onSearchChange,
  onViewModeChange,
}: MarketSnapshotFiltersProps) {
  return (
    <div className="market-toolbar-row">
      <div className="market-toolbar-left">
        <label className="market-section-select">
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

        <label className="market-search-box">
          <span>Search</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="title / symbol / key"
          />
        </label>
      </div>

      <div className="market-toolbar-right">
        <div className="market-view-toggle">
          <button
            type="button"
            className={`market-category-tab${viewMode === "grid" ? " is-active" : ""}`}
            onClick={() => onViewModeChange("grid")}
          >
            Grid
          </button>
          <button
            type="button"
            className={`market-category-tab${viewMode === "list" ? " is-active" : ""}`}
            onClick={() => onViewModeChange("list")}
          >
            List
          </button>
        </div>
      </div>
    </div>
  );
}

export default MarketSnapshotFilters;
