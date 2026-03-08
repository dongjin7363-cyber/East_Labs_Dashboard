"use client";

import { EmptyState } from "@/components/common/EmptyState";
import { InlineFilterRow } from "@/components/common/InlineFilterRow";
import { SectionCard } from "@/components/common/SectionCard";
import { useEffect, useMemo, useState } from "react";
import { MarketSnapshotFilters } from "@/components/market/MarketSnapshotFilters";
import { MarketSnapshotGridView } from "@/components/market/MarketSnapshotGridView";
import { MarketSnapshotHeader } from "@/components/market/MarketSnapshotHeader";
import { MarketSnapshotListView } from "@/components/market/MarketSnapshotListView";
import { Modal } from "@/components/Modal";
import { MarketRegion, MarketSnapshot } from "@/lib/models/types";
import { createMarketSnapshotRepository } from "@/lib/repository/marketSnapshotRepository";
import { todayKstYmd } from "@/lib/utils/date";

type ViewMode = "grid" | "list";

interface MarketSnapshotViewerProps {
  title: string;
  marketRegion: MarketRegion | string;
  pageSlug: string;
}

export function MarketSnapshotViewer({
  title,
  marketRegion,
  pageSlug,
}: MarketSnapshotViewerProps) {
  const repository = useMemo(() => createMarketSnapshotRepository(), []);
  const [selectedDate, setSelectedDate] = useState(() => todayKstYmd());
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [items, setItems] = useState<MarketSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;

    const loadSnapshots = async () => {
      setLoading(true);

      try {
        const parsed = await repository.listByRunDate({
          marketRegion,
          pageSlug,
          runDate: selectedDate,
        });

        if (cancelled) {
          return;
        }

        setItems(parsed);
        setSelectedId(parsed.length > 0 ? parsed[0].id : null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("[market] failed to load snapshots", error);
        setItems([]);
        setSelectedId(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadSnapshots();

    return () => {
      cancelled = true;
    };
  }, [marketRegion, pageSlug, repository, selectedDate]);

  const sections = useMemo(() => {
    const seen = new Set<string>();
    const next: string[] = [];

    items.forEach((item) => {
      if (seen.has(item.section)) {
        return;
      }

      seen.add(item.section);
      next.push(item.section);
    });

    return next;
  }, [items]);

  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};

      sections.forEach((section) => {
        if (section in prev) {
          next[section] = prev[section];
          return;
        }

        next[section] = section === "Main Watchlist";
      });

      return next;
    });
  }, [sections]);

  const searchedItems = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    if (!keyword) {
      return items;
    }

    return items.filter((item) => {
      return (
        item.title.toLowerCase().includes(keyword) ||
        item.symbol.toLowerCase().includes(keyword) ||
        item.snapshotKey.toLowerCase().includes(keyword)
      );
    });
  }, [items, search]);

  const filteredItems = useMemo(() => {
    if (sectionFilter === "ALL") {
      return searchedItems;
    }

    return searchedItems.filter((item) => item.section === sectionFilter);
  }, [searchedItems, sectionFilter]);

  const sectionCounts = useMemo(() => {
    const counts = new Map<string, number>();

    searchedItems.forEach((item) => {
      counts.set(item.section, (counts.get(item.section) ?? 0) + 1);
    });

    return counts;
  }, [searchedItems]);

  const groupedListItems = useMemo(() => {
    const target = sectionFilter === "ALL" ? filteredItems : filteredItems;
    const grouped = new Map<string, MarketSnapshot[]>();

    target.forEach((item) => {
      const current = grouped.get(item.section) ?? [];
      grouped.set(item.section, [...current, item]);
    });

    return grouped;
  }, [filteredItems, sectionFilter]);

  const selectedItem = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null,
    [filteredItems, selectedId],
  );

  useEffect(() => {
    if (!selectedItem) {
      setSelectedId(null);
      return;
    }

    if (selectedItem.id !== selectedId) {
      setSelectedId(selectedItem.id);
    }
  }, [selectedId, selectedItem]);

  const sectionOptions = useMemo(() => {
    return ["ALL", ...sections];
  }, [sections]);

  const listSectionNames = useMemo(() => {
    if (sectionFilter !== "ALL") {
      return sectionOptions.filter((section) => section === sectionFilter);
    }

    return sections;
  }, [sectionFilter, sectionOptions, sections]);

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <>
      <MarketSnapshotHeader
        title={title}
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
      />

      <SectionCard>
        <InlineFilterRow
          className="market-toolbar-row"
          leftClassName="market-toolbar-left"
          rightClassName="market-toolbar-right"
          leftControls={
            <MarketSnapshotFilters
              sectionFilter={sectionFilter}
              sectionOptions={sectionOptions}
              searchedItemsCount={searchedItems.length}
              sectionCounts={sectionCounts}
              search={search}
              viewMode={viewMode}
              onSectionFilterChange={setSectionFilter}
              onSearchChange={setSearch}
              onViewModeChange={setViewMode}
            />
          }
        />

        {loading ? <EmptyState title="로딩 중..." compact /> : null}
        {!loading && filteredItems.length === 0 ? (
          <EmptyState title="No snapshot for this date." compact className="market-etf-empty-state" />
        ) : null}

        {!loading && filteredItems.length > 0 && viewMode === "grid" ? (
          <MarketSnapshotGridView
            items={filteredItems}
            onZoomImage={setZoomImageUrl}
          />
        ) : null}

        {!loading && filteredItems.length > 0 && viewMode === "list" ? (
          <MarketSnapshotListView
            sectionFilter={sectionFilter}
            sectionOptions={sectionOptions}
            searchedItemsCount={searchedItems.length}
            sectionCounts={sectionCounts}
            filteredItemsCount={filteredItems.length}
            listSectionNames={listSectionNames}
            groupedListItems={groupedListItems}
            openSections={openSections}
            selectedItem={selectedItem}
            onSectionFilterChange={setSectionFilter}
            onToggleSection={toggleSection}
            onSelectItem={setSelectedId}
            onZoomImage={setZoomImageUrl}
          />
        ) : null}
      </SectionCard>

      <Modal
        open={Boolean(zoomImageUrl)}
        title="Snapshot"
        onClose={() => setZoomImageUrl(null)}
        cardClassName="market-zoom-modal-card"
      >
        {zoomImageUrl ? (
          <div className="market-zoom-image-wrap">
            <img className="market-zoom-image" src={zoomImageUrl} alt="snapshot zoom" />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
