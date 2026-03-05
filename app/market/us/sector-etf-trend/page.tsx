"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { todayKstYmd } from "@/lib/utils/date";
import { formatKST } from "@/lib/utils/time";

const MARKET_REGION = "us";
const PAGE_SLUG = "sector-etf-trend";
const ALL_SECTIONS = "ALL";

type ViewMode = "GRID" | "LIST";

interface MarketSnapshotRow {
  snapshot_key: string;
  title: string;
  symbol: string;
  category: string | null;
  section: string | null;
  sort_order: number | null;
  image_url: string;
  source_url: string | null;
  updated_at: string | null;
}

interface MarketRunRow {
  updated_at: string;
  status: "success" | "partial" | "failed";
  success_count: number;
  fail_count: number;
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

function sectionName(snapshot: MarketSnapshotRow): string {
  const value = (snapshot.section ?? "").trim();
  return value || "Uncategorized";
}

function isSnapshotMatched(snapshot: MarketSnapshotRow, keyword: string): boolean {
  const query = keyword.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const section = sectionName(snapshot).toLowerCase();

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
  const [runInfo, setRunInfo] = useState<MarketRunRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [brokenImageMap, setBrokenImageMap] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("GRID");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<string>(ALL_SECTIONS);
  const [selectedSnapshotKey, setSelectedSnapshotKey] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
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
          .select("snapshot_key,title,symbol,category,section,sort_order,image_url,source_url,updated_at")
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

        const runQuery = supabase
          .from("market_runs")
          .select("updated_at,status,success_count,fail_count")
          .eq("market_region", MARKET_REGION)
          .eq("page_slug", PAGE_SLUG)
          .eq("run_date", selectedDate)
          .maybeSingle();

        const [snapshotResult, latestResult, runResult] = await Promise.all([
          snapshotQuery,
          latestQuery,
          runQuery,
        ]);

        if (snapshotResult.error) {
          throw snapshotResult.error;
        }

        if (latestResult.error) {
          throw latestResult.error;
        }

        if (runResult.error) {
          throw runResult.error;
        }

        if (cancelled) {
          return;
        }

        const nextSnapshots = sortSnapshots((snapshotResult.data ?? []) as MarketSnapshotRow[]);
        setSnapshots(nextSnapshots);

        const latestDate = latestResult.data?.[0]?.run_date;
        setLatestAvailableDate(typeof latestDate === "string" ? latestDate : null);

        setRunInfo(runResult.data ? (runResult.data as MarketRunRow) : null);
      } catch (fetchError) {
        if (!cancelled) {
          const message =
            fetchError && typeof fetchError === "object" && "message" in fetchError
              ? String((fetchError as { message?: unknown }).message)
              : "Failed to load snapshots";
          setError(message);
          setSnapshots([]);
          setRunInfo(null);
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
        <span className="market-meta-badge">{selectedDate || "-"}</span>
        <span className="market-status-badge">Daily Snapshot</span>
      </div>
    ),
    [selectedDate],
  );

  const sectionOptions = useMemo(() => {
    const sections: string[] = [];
    const seen = new Set<string>();

    for (const snapshot of snapshots) {
      const section = sectionName(snapshot);

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
    setCollapsedSections((prev) => {
      const next: Record<string, boolean> = {};

      for (const section of sectionOptions) {
        next[section] = prev[section] ?? false;
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

        return sectionName(snapshot) === selectedSection;
      })
      .filter((snapshot) => isSnapshotMatched(snapshot, searchQuery));
  }, [searchQuery, selectedSection, snapshots]);

  const groupedSnapshots = useMemo<SectionGroup[]>(() => {
    const grouped = new Map<string, MarketSnapshotRow[]>();

    for (const snapshot of filteredSnapshots) {
      const section = sectionName(snapshot);

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

  const toggleSectionCollapsed = (section: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <>
      <PageHeader title="US Market ETF Screening" actions={headerActions} />

      <section className="panel market-run-meta">
        <div className="market-kv-row">
          <span>Last updated</span>
          <strong>{runInfo?.updated_at ? formatKST(runInfo.updated_at) : "-"}</strong>
        </div>
        <div className="market-kv-row">
          <span>Status</span>
          <strong>
            {runInfo
              ? `${runInfo.status} (${runInfo.success_count}/${
                  runInfo.success_count + runInfo.fail_count
                })`
              : "-"}
          </strong>
        </div>
      </section>

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
        <section className="panel">
          <div className="market-toolbar-row">
            <div className="market-toolbar-left">
              <label className="market-section-select">
                Section
                <select
                  value={selectedSection}
                  onChange={(event) => setSelectedSection(event.target.value)}
                >
                  <option value={ALL_SECTIONS}>All ({snapshots.length})</option>
                  {sectionOptions.map((section) => {
                    const count = snapshots.filter((snapshot) => sectionName(snapshot) === section).length;
                    return (
                      <option key={section} value={section}>
                        {section} ({count})
                      </option>
                    );
                  })}
                </select>
              </label>
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
                    <div className="market-snapshot-section">{sectionName(snapshot)}</div>
                  </article>
                );
              })}
            </div>
          ) : null}

          {filteredSnapshots.length > 0 && viewMode === "LIST" ? (
            <div className="market-list-layout">
              <aside className="market-list-panel">
                {groupedSnapshots.map((group) => {
                  const collapsed = Boolean(collapsedSections[group.section]);

                  return (
                    <section key={group.section} className="market-section-group">
                      <button
                        type="button"
                        className="market-section-header"
                        onClick={() => toggleSectionCollapsed(group.section)}
                      >
                        <strong>{group.section}</strong>
                        <span>{group.rows.length}</span>
                        <span
                          className={`market-section-chevron ${collapsed ? "is-collapsed" : ""}`}
                        >
                          ▾
                        </span>
                      </button>

                      {!collapsed ? (
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
                        <strong>{sectionName(selectedSnapshot)}</strong>
                      </div>
                      <div className="market-kv-row">
                        <span>Snapshot Key</span>
                        <strong>{selectedSnapshot.snapshot_key}</strong>
                      </div>
                      <div className="market-kv-row">
                        <span>Source URL</span>
                        {selectedSnapshot.source_url ? (
                          <a
                            href={selectedSnapshot.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="market-link"
                          >
                            Open Source
                          </a>
                        ) : (
                          <strong>-</strong>
                        )}
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
