"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ExportMainChart } from "@/components/export/ExportMainChart";
import { ExportMomChart } from "@/components/export/ExportMomChart";
import { ExportQoqChart } from "@/components/export/ExportQoqChart";
import { useExportItems, useExportItemData } from "@/lib/hooks/useExportData";
import { ExportDataPoint } from "@/lib/models/types";

const SECTORS = [
  "반도체",
  "이차전지",
  "전력인프라",
  "방산",
  "바이오·뷰티",
  "디스플레이",
  "자동차",
  "조선·기계",
  "소재·화학",
  "소비재·식품",
  "통신·IT",
  "기타",
] as const;

function importanceLevel(value: number): 1 | 2 | 3 {
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

function formatPeriod(data: ExportDataPoint[]): string {
  if (data.length === 0) return "-";
  const first = data[0]?.ym;
  const last = data[data.length - 1]?.ym;
  if (!first || !last) return "-";
  return `${first.replace("-", ".")} ~ ${last.replace("-", ".")}`;
}

function formatPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function buildMainInsight(data: ExportDataPoint[]): string {
  const yoyPoints = data.filter(
    (point): point is ExportDataPoint & { yoy: number } =>
      typeof point.yoy === "number" && Number.isFinite(point.yoy),
  );

  if (yoyPoints.length === 0) {
    return "YoY 데이터가 아직 충분하지 않습니다.";
  }

  const lowest = yoyPoints.reduce((min, point) => (point.yoy < min.yoy ? point : min));
  const latest = yoyPoints[yoyPoints.length - 1];
  const previous = yoyPoints[yoyPoints.length - 2];

  if (latest && previous) {
    const delta = latest.yoy - previous.yoy;
    const direction = delta >= 0 ? "회복" : "둔화";
    return `${lowest.ym.replace("-", ".")} YoY ${formatPct(
      lowest.yoy,
    )}로 최저 구간을 기록했고, 최근 ${latest.ym.replace("-", ".")}에는 전월 대비 ${formatPct(
      delta,
    )}p ${direction}했습니다.`;
  }

  return `${lowest.ym.replace("-", ".")} YoY ${formatPct(lowest.yoy)}가 현재 구간의 최저 YoY입니다.`;
}

export default function MarketExportPage() {
  const [activeSector, setActiveSector] = useState<string>(SECTORS[0]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const { bySector, loading: itemsLoading, error: itemsError } = useExportItems();
  const sectorItems = useMemo(
    () =>
      [...(bySector.get(activeSector) ?? [])].sort((a, b) => {
        const importanceDiff = importanceLevel(b.importance) - importanceLevel(a.importance);
        if (importanceDiff !== 0) return importanceDiff;
        return a.name.localeCompare(b.name, "ko");
      }),
    [activeSector, bySector],
  );
  const selectedItem = sectorItems.find((item) => item.id === selectedItemId);

  const { data, loading: dataLoading } = useExportItemData(selectedItemId);
  const chartPeriod = formatPeriod(data);
  const mainInsight = buildMainInsight(data);

  function handleSectorClick(sector: string) {
    setActiveSector(sector);
  }

  useEffect(() => {
    if (itemsLoading) {
      return;
    }

    if (sectorItems.length === 0) {
      setSelectedItemId(null);
      return;
    }

    const selectedItemBelongsToSector = sectorItems.some(
      (item) => item.id === selectedItemId,
    );

    if (!selectedItemBelongsToSector) {
      setSelectedItemId(sectorItems[0].id);
    }
  }, [itemsLoading, sectorItems, selectedItemId]);

  return (
    <section className="export-page">
      <PageHeader title="수출입 데이터" />

      <div className="panel export-sector-tabs">
        {SECTORS.map((sector) => (
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

      <div className="panel export-item-panel">
        <div className="panel-header-inline">
          <h3>{activeSector}</h3>
          {sectorItems.length > 0 && (
            <span className="panel-submetric">{sectorItems.length}개 항목</span>
          )}
        </div>

        {itemsLoading ? (
          <p className="panel-submetric" style={{ padding: "16px 0" }}>
            로딩 중…
          </p>
        ) : itemsError ? (
          <p style={{ padding: "16px 0", color: "#ef4444", fontSize: 13 }}>
            오류: {itemsError}
          </p>
        ) : sectorItems.length === 0 ? (
          <p className="panel-submetric" style={{ padding: "16px 0" }}>
            항목 없음
          </p>
        ) : (
          <div className="export-item-pill-list">
            {sectorItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`export-item-pill${selectedItemId === item.id ? " is-active" : ""}`}
                onClick={() => setSelectedItemId(item.id)}
              >
                <span
                  className="export-item-dot"
                  data-importance={importanceLevel(item.importance)}
                />
                <span className="export-item-name">{item.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedItem && (
        <>
          {dataLoading ? (
            <div className="panel export-chart-card export-chart-loading">
              차트 로딩 중…
            </div>
          ) : (
            <div className="export-chart-stack">
              <article className="panel export-chart-card export-chart-card-main">
                <div className="export-chart-card-header">
                  <div>
                    <h3>{selectedItem.name} — 수출 YoY % + 일평균수출</h3>
                    <p>막대: 일평균수출(달러) | 선: YoY % — 급변 구간에 투자 시그널 표시</p>
                  </div>
                  <span className="export-chart-period">{chartPeriod}</span>
                </div>
                <ExportMainChart data={data} />
                <div className="export-insight-box">
                  <strong>⚡ 급변 시그널 감지 구간</strong>
                  <span>{mainInsight}</span>
                </div>
              </article>

              <div className="export-chart-grid">
                <article className="panel export-chart-card">
                  <div className="export-chart-card-header">
                    <div>
                      <h3>월간 MoM % 추이</h3>
                      <p>전월 대비 변화율 — 이달 가속/감속 즉각 포착용</p>
                    </div>
                  </div>
                  <ExportMomChart data={data} />
                  <div className="export-feature-box">
                    <div>
                      <strong>장점</strong>
                      <span>+ 이달 변화 즉각 반영</span>
                      <span>+ 스윙 1~2주 투자에 적합</span>
                      <span>+ 급변 구간 한눈에 파악</span>
                    </div>
                    <div>
                      <strong>주의점</strong>
                      <span>- 변동성 커서 노이즈 많음</span>
                      <span>- 계절성 영향 받을 수 있음</span>
                      <span>- 단독으로는 방향 오판 가능</span>
                    </div>
                  </div>
                </article>

                <article className="panel export-chart-card">
                  <div className="export-chart-card-header">
                    <div>
                      <h3>분기 평균 수출 (QoQ)</h3>
                      <p>분기별 방향성 확인</p>
                    </div>
                  </div>
                  <ExportQoqChart data={data} />
                </article>
              </div>
            </div>
          )}
        </>
      )}

      {!selectedItem && !itemsLoading && sectorItems.length > 0 && (
        <div className="panel export-chart-card export-chart-loading">
          항목을 선택하면 차트가 표시됩니다
        </div>
      )}
    </section>
  );
}
