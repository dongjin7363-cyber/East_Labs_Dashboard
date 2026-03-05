"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { todayKstYmd } from "@/lib/utils/date";
import { formatKST } from "@/lib/utils/time";

const MARKET_REGION = "us";
const PAGE_SLUG = "sector-etf-trend";
const ALL_SECTIONS = "ALL";
const MAIN_WATCHLIST_BLOCKED_SYMBOLS = new Set([
  "KLAC",
  "HPE",
  "STX",
  "PSTG",
  "AMKR",
  "ASX",
  "BKR",
  "SLB",
]);

type ViewMode = "GRID" | "LIST";

interface MarketSnapshotRow {
  snapshot_key: string;
  title: string;
  symbol: string;
  category: string | null;
  section: string | null;
  sort_order: number | null;
  image_url: string;
  updated_at: string | null;
}

interface ZoomState {
  title: string;
  imageUrl: string;
}

interface SectionGroup {
  section: string;
  rows: MarketSnapshotRow[];
}

function sortSnapshots(rows: MarketSnapshotRow[]): MarketSnapshotRow[] {
  return [...rows].sort((a, b) => {
    const orderA = typeof a.sort_order === "number" ? a.sort_order : Number.MAX_SAFE_INTEGER;
    const orderB = typeof b.sort_order === "number" ? b.sort_order : Number.MAX_SAFE_INTEGER;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.snapshot_key.localeCompare(b.snapshot_key);
  });
}

function normalizeCategory(value: string | null | undefined): "Index" | "Sector" | "Stock" | "Other" {
  const normalized = (value ?? "").trim().toLowerCase();

  if (normalized === "index") {
    return "Index";
  }

  if (normalized === "sector") {
    return "Sector";
  }

  if (normalized === "stock") {
    return "Stock";
  }

  return "Other";
}

function categoryBadgeClass(category: "Index" | "Sector" | "Stock" | "Other"): string {
  if (category === "Index") {
    return "is-index";
  }

  if (category === "Sector") {
    return "is-sector";
  }

  if (category === "Stock") {
    return "is-stock";
  }

  return "is-other";
}

function normalizeSectionKey(section: string | null | undefined): string {
  const value = (section ?? "").trim();
  return value || "Uncategorized";
}

function displaySectionLabel(section: string): string {
  const compact = section.replace(/\s+/g, "").toLowerCase();

  if (compact === "주요살피는종목군" || compact === "mainwatchlist") {
    return "Main Watchlist";
  }

  return section;
}

function isMainWatchlistSection(section: string | null | undefined): boolean {
  return displaySectionLabel(normalizeSectionKey(section)) === "Main Watchlist";
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

function shouldHideMainWatchlistSymbol(snapshot: MarketSnapshotRow): boolean {
  if (!isMainWatchlistSection(snapshot.section)) {
    return false;
  }

  return MAIN_WATCHLIST_BLOCKED_SYMBOLS.has(normalizeSymbol(snapshot.symbol));
}

function isSnapshotMatched(snapshot: MarketSnapshotRow, keyword: string): boolean {
  const query = keyword.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const section = normalizeSectionKey(snapshot.section).toLowerCase();

  return (
    snapshot.title.toLowerCase().includes(query) ||
    snapshot.symbol.toLowerCase().includes(query) ||
    snapshot.snapshot_key.toLowerCase().includes(query) ||
    section.includes(query)
  );
}

export default function UsSectorEtfTrendPage() {
  const [selectedDate, setSelectedDate] = useState("");
  const [latestAvailableDate, setLatestAvailableDate] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<MarketSnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [brokenImageMap, setBrokenImageMap] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>(ALL_SECTIONS);
  const [selectedSnapshotKey, setSelectedSnapshotKey] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const leftScrollAreaRef = useRef<HTMLDivElement | null>(null);
  const hasSelectedDate = selectedDate !== "";

  useEffect(() => {
    setSelectedDate(todayKstYmd());
  }, []);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const snapshotQuery = supabase
          .from("market_snapshots")
          .select("snapshot_key,title,symbol,category,section,sort_order,image_url,updated_at")
          .eq("market_region", MARKET_REGION)
          .eq("page_slug", PAGE_SLUG)
          .eq("run_date", selectedDate)
          .order("sort_order", { ascending: true })
          .order("snapshot_key", { ascending: true });

        const latestQuery = supabase
          .from("market_snapshots")
          .select("run_date")
          .eq("market_region", MARKET_REGION)
          .eq("page_slug", PAGE_SLUG)
          .order("run_date", { ascending: false })
          .limit(1);

        const [snapshotResult, latestResult] = await Promise.all([snapshotQuery, latestQuery]);

        if (snapshotResult.error) {
          throw snapshotResult.error;
        }

        if (latestResult.error) {
          throw latestResult.error;
        }

        if (cancelled) {
          return;
        }

        const nextSnapshots = sortSnapshots((snapshotResult.data ?? []) as MarketSnapshotRow[]).filter(
          (snapshot) => !shouldHideMainWatchlistSymbol(snapshot),
        );
        setSnapshots(nextSnapshots);

        const latestDate = latestResult.data?.[0]?.run_date;
        setLatestAvailableDate(typeof latestDate === "string" ? latestDate : null);
      } catch (fetchError) {
        if (!cancelled) {
          const message =
            fetchError && typeof fetchError === "object" && "message" in fetchError
              ? String((fetchError as { message?: unknown }).message)
              : "Failed to load snapshots";
          setError(message);
          setSnapshots([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedDate]);

  const headerActions = useMemo(
    () => (
      <div className="market-etf-header-meta">
        <label className="market-date-picker">
          Date
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
      </div>
    ),
    [selectedDate],
  );

  const sectionOptions = useMemo(() => {
    const sections: string[] = [];
    const seen = new Set<string>();

    for (const snapshot of snapshots) {
      const section = normalizeSectionKey(snapshot.section);

      if (!seen.has(section)) {
        seen.add(section);
        sections.push(section);
      }
    }

    return sections;
  }, [snapshots]);

  useEffect(() => {
    if (selectedSection !== ALL_SECTIONS && !sectionOptions.includes(selectedSection)) {
      setSelectedSection(ALL_SECTIONS);
    }
  }, [sectionOptions, selectedSection]);

  useEffect(() => {
    setOpenSections((prev) => {
      const next: Record<string, boolean> = {};

      for (const section of sectionOptions) {
        const defaultOpen = isMainWatchlistSection(section);
        next[section] = prev[section] ?? defaultOpen;
      }

      return next;
    });
  }, [sectionOptions]);

  const filteredSnapshots = useMemo(() => {
    return snapshots
      .filter((snapshot) => {
        if (selectedSection === ALL_SECTIONS) {
          return true;
        }

        return normalizeSectionKey(snapshot.section) === selectedSection;
      })
      .filter((snapshot) => isSnapshotMatched(snapshot, searchQuery));
  }, [searchQuery, selectedSection, snapshots]);

  const groupedSnapshots = useMemo<SectionGroup[]>(() => {
    const grouped = new Map<string, MarketSnapshotRow[]>();

    for (const snapshot of filteredSnapshots) {
      const section = normalizeSectionKey(snapshot.section);

      if (!grouped.has(section)) {
        grouped.set(section, []);
      }

      grouped.get(section)?.push(snapshot);
    }

    return Array.from(grouped.entries()).map(([section, rows]) => ({ section, rows }));
  }, [filteredSnapshots]);

  const selectedSnapshot = useMemo(() => {
    return filteredSnapshots.find((snapshot) => snapshot.snapshot_key === selectedSnapshotKey) ?? null;
  }, [filteredSnapshots, selectedSnapshotKey]);

  useEffect(() => {
    if (filteredSnapshots.length === 0) {
      setSelectedSnapshotKey(null);
      return;
    }

    const exists = filteredSnapshots.some((item) => item.snapshot_key === selectedSnapshotKey);

    if (!exists) {
      setSelectedSnapshotKey(filteredSnapshots[0].snapshot_key);
    }
  }, [filteredSnapshots, selectedSnapshotKey]);

  const toggleSectionOpen = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !Boolean(prev[section]),
    }));
  };

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    if (viewMode !== "LIST") {
      return;
    }

    const height = leftScrollAreaRef.current?.clientHeight ?? 0;
    console.log("[market] leftScrollArea.clientHeight", height);
  }, [viewMode, selectedSection, groupedSnapshots.length]);

  return (
    <>
      <PageHeader title="US Market ETF Screening" actions={headerActions} />

      {!hasSelectedDate ? (
        <section className="panel">
          <div className="empty-state">Loading snapshots...</div>
        </section>
      ) : null}

      {hasSelectedDate && loading ? (
        <section className="panel">
          <div className="empty-state">Loading snapshots...</div>
        </section>
      ) : null}

      {hasSelectedDate && !loading && error ? (
        <section className="panel">
          <div className="empty-state">{error}</div>
        </section>
      ) : null}

      {hasSelectedDate && !loading && !error && snapshots.length === 0 ? (
        <section className="panel">
          <div className="empty-state">No snapshot for this date</div>
          <div className="market-empty-actions">
            <button
              type="button"
              className="secondary-button"
              disabled={!latestAvailableDate || latestAvailableDate === selectedDate}
              onClick={() => {
                if (latestAvailableDate) {
                  setSelectedDate(latestAvailableDate);
                }
              }}
            >
              Go to latest ({latestAvailableDate ?? "-"})
            </button>
          </div>
        </section>
      ) : null}

      {hasSelectedDate && !loading && !error && snapshots.length > 0 ? (
        <section className={`panel ${viewMode === "LIST" ? "market-list-mode-panel" : ""}`}>
          <div className="market-toolbar-row">
            <div className="market-toolbar-left">
              {viewMode === "GRID" ? (
                <label className="market-section-select">
                  Section
                  <select
                    value={selectedSection}
                    onChange={(event) => setSelectedSection(event.target.value)}
                  >
                    <option value={ALL_SECTIONS}>All ({snapshots.length})</option>
                    {sectionOptions.map((section) => {
                      const count = snapshots.filter(
                        (snapshot) => normalizeSectionKey(snapshot.section) === section,
                      ).length;
                      return (
                        <option key={section} value={section}>
                          {displaySectionLabel(section)} ({count})
                        </option>
                      );
                    })}
                  </select>
                </label>
              ) : (
                <span className="market-list-info-label">List View ({filteredSnapshots.length})</span>
              )}
            </div>

            <div className="market-toolbar-right">
              <label className="market-search-box">
                Search
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="title / symbol / snapshot_key / section"
                />
              </label>

              <div className="market-view-toggle">
                <button
                  type="button"
                  className={`market-category-tab ${viewMode === "GRID" ? "is-active" : ""}`}
                  onClick={() => setViewMode("GRID")}
                >
                  Grid
                </button>
                <button
                  type="button"
                  className={`market-category-tab ${viewMode === "LIST" ? "is-active" : ""}`}
                  onClick={() => setViewMode("LIST")}
                >
                  List
                </button>
              </div>
            </div>
          </div>

          {filteredSnapshots.length === 0 ? (
            <div className="empty-state">검색/섹션 조건에 맞는 항목이 없습니다.</div>
          ) : null}

          {filteredSnapshots.length > 0 && viewMode === "GRID" ? (
            <div className="market-snapshot-grid">
              {filteredSnapshots.map((snapshot) => {
                const key = snapshot.snapshot_key;
                const broken = brokenImageMap[key];
                const normalizedCategory = normalizeCategory(snapshot.category);

                return (
                  <article key={key} className="market-snapshot-card">
                    <div className="market-snapshot-head">
                      <strong className="market-snapshot-title">{snapshot.title}</strong>
                      <span
                        className={`market-tag market-category-badge ${categoryBadgeClass(
                          normalizedCategory,
                        )}`}
                      >
                        {normalizedCategory}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="market-snapshot-image-button"
                      onClick={() =>
                        setZoom({
                          title: snapshot.title,
                          imageUrl: snapshot.image_url,
                        })
                      }
                      disabled={broken}
                    >
                      {broken ? (
                        <div className="market-etf-empty-state">Image unavailable</div>
                      ) : (
                        <img
                          src={snapshot.image_url}
                          alt={snapshot.title}
                          className="market-snapshot-image"
                          onError={() =>
                            setBrokenImageMap((prev) => ({
                              ...prev,
                              [key]: true,
                            }))
                          }
                        />
                      )}
                    </button>

                    <div className="market-snapshot-foot">
                      <span>{snapshot.symbol}</span>
                      <span>{snapshot.snapshot_key}</span>
                    </div>
                    <div className="market-snapshot-section">
                      {displaySectionLabel(normalizeSectionKey(snapshot.section))}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {filteredSnapshots.length > 0 && viewMode === "LIST" ? (
            <div className="market-list-outer">
              <div className="market-list-layout">
                <aside className="market-list-panel">
                  <div className="market-list-left-header">
                    <label className="market-section-select market-section-select-left">
                      Section
                      <select
                        value={selectedSection}
                        onChange={(event) => setSelectedSection(event.target.value)}
                      >
                        <option value={ALL_SECTIONS}>All ({snapshots.length})</option>
                        {sectionOptions.map((section) => {
                          const count = snapshots.filter(
                            (snapshot) => normalizeSectionKey(snapshot.section) === section,
                          ).length;
                          return (
                            <option key={section} value={section}>
                              {displaySectionLabel(section)} ({count})
                            </option>
                          );
                        })}
                      </select>
                    </label>
                    <span className="market-list-info-label">
                      Rows {filteredSnapshots.length}
                    </span>
                  </div>

                  <div className="market-list-scroll-area" ref={leftScrollAreaRef}>
                    {groupedSnapshots.map((group) => {
                      const forceOpen = selectedSection !== ALL_SECTIONS;
                      const isOpen = forceOpen ? true : Boolean(openSections[group.section]);

                      return (
                        <section key={group.section} className="market-section-group">
                          <button
                            type="button"
                            className="market-section-header"
                            onClick={() => {
                              if (!forceOpen) {
                                toggleSectionOpen(group.section);
                              }
                            }}
                            aria-expanded={isOpen}
                          >
                            <strong>{displaySectionLabel(group.section)}</strong>
                            <span>{group.rows.length}</span>
                            <span
                              className={`market-section-chevron ${isOpen ? "" : "is-collapsed"}`}
                            >
                              ▾
                            </span>
                          </button>

                          {isOpen ? (
                            <div className="market-section-rows">
                              {group.rows.map((snapshot) => {
                                const normalizedCategory = normalizeCategory(snapshot.category);
                                const selected = selectedSnapshotKey === snapshot.snapshot_key;

                                return (
                                  <button
                                    key={snapshot.snapshot_key}
                                    type="button"
                                    className={`market-list-row ${selected ? "is-selected" : ""}`}
                                    onClick={() => setSelectedSnapshotKey(snapshot.snapshot_key)}
                                  >
                                    <div className="market-list-row-head">
                                      <strong>{snapshot.title}</strong>
                                      <span
                                        className={`market-tag market-category-badge ${categoryBadgeClass(
                                          normalizedCategory,
                                        )}`}
                                      >
                                        {normalizedCategory}
                                      </span>
                                    </div>
                                    <div className="market-list-row-meta">
                                      <span>{snapshot.symbol}</span>
                                      <span>{snapshot.snapshot_key}</span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                </aside>

                <article className="market-detail-panel">
                  {selectedSnapshot ? (
                    <>
                      <button
                        type="button"
                        className="market-snapshot-image-button market-detail-image-button"
                        onClick={() =>
                          setZoom({
                            title: selectedSnapshot.title,
                            imageUrl: selectedSnapshot.image_url,
                          })
                        }
                      >
                        <img
                          src={selectedSnapshot.image_url}
                          alt={selectedSnapshot.title}
                          className="market-snapshot-image"
                        />
                      </button>

                      <div className="market-detail-meta-grid">
                        <div className="market-kv-row">
                          <span>Title</span>
                          <strong>{selectedSnapshot.title}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Symbol</span>
                          <strong>{selectedSnapshot.symbol}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Category</span>
                          <strong>{normalizeCategory(selectedSnapshot.category)}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Section</span>
                          <strong>{displaySectionLabel(normalizeSectionKey(selectedSnapshot.section))}</strong>
                        </div>
                        <div className="market-kv-row">
                          <span>Updated At</span>
                          <strong>
                            {selectedSnapshot.updated_at ? formatKST(selectedSnapshot.updated_at) : "-"}
                          </strong>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">선택된 항목이 없습니다.</div>
                  )}
                </article>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <Modal
        open={Boolean(zoom)}
        title={zoom?.title ?? "Snapshot"}
        onClose={() => setZoom(null)}
        cardClassName="market-zoom-modal-card"
      >
        <div className="market-zoom-image-wrap">
          {zoom ? <img src={zoom.imageUrl} alt={zoom.title} className="market-zoom-image" /> : null}
        </div>
      </Modal>
    </>
  );
}
