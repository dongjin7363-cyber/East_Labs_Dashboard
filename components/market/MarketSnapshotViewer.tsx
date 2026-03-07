"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { MarketRegion, MarketSnapshot } from "@/lib/models/types";
import { getMarketCategoryBadgeTone } from "@/lib/repository/mappers/marketSnapshotMapper";
import { createMarketSnapshotRepository } from "@/lib/repository/marketSnapshotRepository";
import { todayKstYmd } from "@/lib/utils/date";
import { formatKST } from "@/lib/utils/time";

type ViewMode = "grid" | "list";

interface MarketSnapshotViewerProps {
  title: string;
  marketRegion: MarketRegion | string;
  pageSlug: string;
}

function categoryBadgeClass(category: string): string {
  return `market-category-badge ${getMarketCategoryBadgeTone(category)}`;
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
      <PageHeader
        title={title}
        actions={
          <div className="market-date-picker">
            <span>Date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value || todayKstYmd())}
            />
          </div>
        }
      />

      <section className="panel">
        <div className="market-toolbar-row">
          <div className="market-toolbar-left">
            <label className="market-section-select">
              <span>Section</span>
              <select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value)}
              >
                {sectionOptions.map((section) => {
                  if (section === "ALL") {
                    return (
                      <option key={section} value={section}>
                        All ({searchedItems.length})
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
                onChange={(event) => setSearch(event.target.value)}
                placeholder="title / symbol / key"
              />
            </label>
          </div>

          <div className="market-toolbar-right">
            <div className="market-view-toggle">
              <button
                type="button"
                className={`market-category-tab${viewMode === "grid" ? " is-active" : ""}`}
                onClick={() => setViewMode("grid")}
              >
                Grid
              </button>
              <button
                type="button"
                className={`market-category-tab${viewMode === "list" ? " is-active" : ""}`}
                onClick={() => setViewMode("list")}
              >
                List
              </button>
            </div>
          </div>
        </div>

        {loading ? <p className="empty-state">로딩 중...</p> : null}
        {!loading && filteredItems.length === 0 ? (
          <p className="market-etf-empty-state">No snapshot for this date.</p>
        ) : null}

        {!loading && filteredItems.length > 0 && viewMode === "grid" ? (
          <div className="market-snapshot-grid">
            {filteredItems.map((item) => (
              <article key={item.id} className="market-snapshot-card">
                <div className="market-snapshot-head">
                  <strong className="market-snapshot-title">{item.title}</strong>
                  <span className={categoryBadgeClass(item.category)}>{item.category}</span>
                </div>
                <button
                  type="button"
                  className="market-snapshot-image-button"
                  onClick={() => setZoomImageUrl(item.imageUrl)}
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
        ) : null}

        {!loading && filteredItems.length > 0 && viewMode === "list" ? (
          <section className="market-list-mode-panel">
            <div className="market-list-outer">
              <div className="market-list-layout">
                <aside className="market-list-left-pane">
                  <div className="market-list-left-header">
                    <label className="market-section-select market-section-select-left">
                      <span>Section</span>
                      <select
                        value={sectionFilter}
                        onChange={(event) => setSectionFilter(event.target.value)}
                      >
                        {sectionOptions.map((section) => {
                          if (section === "ALL") {
                            return (
                              <option key={section} value={section}>
                                All ({searchedItems.length})
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
                    <div className="market-list-info-label">{filteredItems.length} items</div>
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
                                toggleSection(section);
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
                                  onClick={() => setSelectedId(item.id)}
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

                <section className="market-detail-panel">
                  {selectedItem ? (
                    <>
                      <button
                        type="button"
                        className="market-snapshot-image-button market-detail-image-button"
                        onClick={() => setZoomImageUrl(selectedItem.imageUrl)}
                      >
                        <img
                          className="market-snapshot-image"
                          src={selectedItem.imageUrl}
                          alt={selectedItem.title}
                        />
                      </button>

                      <div className="market-detail-meta-grid">
                        <div className="market-kv-row">
                          <span>Title</span>
                          <strong>{selectedItem.title}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Symbol</span>
                          <strong>{selectedItem.symbol}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Category</span>
                          <strong>{selectedItem.category}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Section</span>
                          <strong>{selectedItem.section}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Updated At</span>
                          <strong>{formatKST(selectedItem.updatedAt)}</strong>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="empty-state">선택된 항목이 없습니다.</p>
                  )}
                </section>
              </div>
            </div>
          </section>
        ) : null}
      </section>

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
