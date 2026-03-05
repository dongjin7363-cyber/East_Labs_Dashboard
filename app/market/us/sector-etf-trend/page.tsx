"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/lib/supabaseClient";
import { todayKstYmd } from "@/lib/utils/date";
import { formatKST } from "@/lib/utils/time";

const MARKET_REGION = "us";
const PAGE_SLUG = "sector-etf-trend";

interface MarketSnapshotRow {
  snapshot_key: string;
  title: string;
  symbol: string;
  category: string | null;
  sort_order: number | null;
  image_url: string;
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

export default function UsSectorEtfTrendPage() {
  const [selectedDate, setSelectedDate] = useState("");
  const [latestAvailableDate, setLatestAvailableDate] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<MarketSnapshotRow[]>([]);
  const [runInfo, setRunInfo] = useState<MarketRunRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const [brokenImageMap, setBrokenImageMap] = useState<Record<string, boolean>>({});
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
          .select("snapshot_key,title,symbol,category,sort_order,image_url")
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

  return (
    <>
      <PageHeader
        title="US Market ETF Screening"
        description="미국 ETF/섹터/지수 차트를 일별 스냅샷으로 확인합니다."
        actions={headerActions}
      />

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
          <div className="market-snapshot-grid">
            {snapshots.map((snapshot) => {
              const key = snapshot.snapshot_key;
              const broken = brokenImageMap[key];

              return (
                <article key={key} className="market-snapshot-card">
                  <div className="market-snapshot-head">
                    <strong className="market-snapshot-title">{snapshot.title}</strong>
                    <span className="market-tag">{snapshot.category || "Other"}</span>
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

                  <div className="market-snapshot-foot">{snapshot.symbol}</div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <Modal
        open={Boolean(zoom)}
        title={zoom?.title ?? "Snapshot"}
        onClose={() => setZoom(null)}
        cardClassName="market-zoom-modal-card"
      >
        <div className="market-zoom-image-wrap">
          {zoom ? (
            <img src={zoom.imageUrl} alt={zoom.title} className="market-zoom-image" />
          ) : null}
        </div>
      </Modal>
    </>
  );
}
