"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ExportMainChart } from "@/components/export/ExportMainChart";
import { ExportPriceChart } from "@/components/export/ExportPriceChart";
import { useExportItems, useExportItemData } from "@/lib/hooks/useExportData";
import { ExportDataPoint } from "@/lib/models/types";
import { analyze, attentionItems, attentionSectors, compact, monthOffset, pct, trend } from "@/lib/exportAnalysis";
import { isExportPreview } from "@/lib/exportPreview";
import { fetchExportAttentionData } from "@/lib/repository/exportRepository";

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

function formatImportanceStars(value: number): string {
  return "★".repeat(importanceLevel(value));
}

function formatRelatedStocks(value?: string): string {
  if (!value) return "-";

  const stocks = value
    .split(/[,·]/)
    .map((stock) => stock.trim())
    .filter(Boolean);

  return stocks.length > 0 ? stocks.join(" · ") : "-";
}

export default function MarketExportPage() {
  const [activeSector, setActiveSector] = useState<string>(SECTORS[0]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [months, setMonths] = useState(12);
  const [quantity, setQuantity] = useState(false);
  const [priceLevel, setPriceLevel] = useState(true);
  const [attentionData, setAttentionData] = useState<Record<string, ExportDataPoint[]>>({});
  useEffect(() => {
    let cancelled = false;
    fetchExportAttentionData().then(data => { if (!cancelled) setAttentionData(data); }).catch(error => console.warn("[export] attention data unavailable", error));
    return () => { cancelled = true; };
  }, []);

  const { items, bySector, loading: itemsLoading, error: itemsError } = useExportItems();
  const highlightedSectors = useMemo(() => attentionSectors(items, attentionData), [items, attentionData]);
  const highlightedItems = useMemo(() => attentionItems(items, attentionData), [items, attentionData]);
  const availableSectors = useMemo(() => {
    const knownSectors = SECTORS.filter((sector) => (bySector.get(sector)?.length ?? 0) > 0);
    const extraSectors = [...bySector.keys()]
      .filter((sector) => !SECTORS.includes(sector as (typeof SECTORS)[number]))
      .sort((a, b) => a.localeCompare(b, "ko"));

    return [...knownSectors, ...extraSectors];
  }, [bySector]);
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

  const { data, loading: dataLoading, error: dataError } = useExportItemData(selectedItemId);
  const analyzed = useMemo(() => analyze(data), [data]);
  const latest = analyzed[analyzed.length - 1];
  const chartData = latest && months ? analyzed.filter(p => p.ym >= monthOffset(latest.ym, 1-months)) : analyzed;
  const chartPeriod = formatPeriod(chartData);
  const previousMonth = latest ? analyzed.find(p => p.ym === monthOffset(latest.ym, -1)) : undefined;
  const trade = selectedItem?.name.includes("수입") ? "수입" : "수출";
  const mainYoy = latest ? (quantity ? latest.quantityYoy : latest.yoy) : null;
  const mainMom = latest ? (quantity ? latest.quantityMom : latest.mom) : null;

  function handleSectorClick(sector: string) {
    setActiveSector(sector);
  }

  useEffect(() => {
    if (itemsLoading || availableSectors.length === 0) {
      return;
    }

    if (!availableSectors.includes(activeSector as (typeof SECTORS)[number])) {
      setActiveSector(availableSectors[0]);
    }
  }, [activeSector, availableSectors, itemsLoading]);

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
    <div className="market-page export-page">
      <div className="export-page-title"><PageHeader title="수출입 데이터" />{isExportPreview && <span className="export-preview-label">로컬 미리보기</span>}</div>

      <div className="panel export-sector-tabs">
        {availableSectors.map((sector) => (
          <button
            key={sector}
            type="button"
            className={`market-category-tab${activeSector === sector ? " is-active" : ""}`}
            onClick={() => handleSectorClick(sector)}
            aria-pressed={activeSector === sector}
            title={highlightedSectors.get(sector)}
          >
            {sector}
            {highlightedSectors.has(sector) && <span className="export-attention-dot" aria-label="이번 달 주요 변화" />}
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
                aria-pressed={selectedItemId === item.id}
                title={highlightedItems.get(item.id)}
              >
                <span
                  className="export-item-dot"
                  data-importance={importanceLevel(item.importance)}
                />
                <span className="export-item-name">{item.name}</span>
                {highlightedItems.has(item.id) && <span className="export-attention-dot" aria-label="이번 달 주요 변화" />}
              </button>
            ))}
          </div>
        )}

        {selectedItem && (
          <div className="export-item-info-card">
            <span className="export-related-stock-text">
              관련 종목 :{" "}
              <span className="export-related-stock-value">
                {formatRelatedStocks(selectedItem.relatedStocks)}
              </span>
            </span>
            <span className="export-item-importance-stars">
              {formatImportanceStars(selectedItem.importance)}
            </span>
          </div>
        )}
      </div>

      {selectedItem && (
        <>
          {dataLoading || (data.length > 0 && data[0]?.itemId !== selectedItemId && !dataError) ? (
            <div className="panel export-chart-card export-chart-loading">
              차트 로딩 중…
            </div>
          ) : dataError ? <div className="panel export-chart-empty" role="alert">{dataError}</div> : (
            <div className="export-chart-stack">
              <article className="panel export-chart-card export-chart-card-main">
                <div className="export-chart-card-header">
                  <div>
                    <h3>{selectedItem.name} <span className="export-heading-separator">/</span> 일평균 {trade}{quantity ? "량" : "액"} · MoM · YoY</h3>
                    <p>{latest?.ym.replace("-", ".")} {latest?.isPartial ? "잠정" : "월간"}{latest?.dataThrough ? ` · ${latest.dataThrough.slice(5).replace("-", "/")}까지 누적` : ""}{latest?.asOfDate ? ` · ${latest.asOfDate.slice(5).replace("-", "/")} 업데이트` : ""}</p>
                  </div>
                  <div className="export-segmented" aria-label="차트 기간">{[[12,"1년"],[36,"3년"],[0,"전체"]].map(([value,label]) => <button type="button" key={value} aria-pressed={months === value} className={months === value ? "is-active" : ""} onClick={() => setMonths(Number(value))}>{label}</button>)}</div>
                </div>
                <div className="export-kpis">
                  <div><span>일평균 {trade}{quantity ? "량" : "액"}</span><strong>{quantity ? "" : "$"}{compact(quantity ? latest?.dailyQuantity : latest?.avgExport)}<small>{quantity ? " kg/일" : " /일"}</small></strong></div>
                  <div><span>전월 대비 MoM</span><strong className={(mainMom ?? 0) < 0 ? "export-down" : "export-up"}>{pct(mainMom)}</strong><small>{previousMonth?.ym.replace("-", ".")} 대비</small></div>
                  <div><span>전년 대비 YoY</span><strong className={(mainYoy ?? 0) < 0 ? "export-down" : "export-up"}>{pct(mainYoy)}</strong><small>전년 동월 대비</small></div>
                  <div><span>판가 ASP</span><strong>${compact(latest?.price)}<small> /kg</small></strong><small>MoM <span className={(latest?.priceMom ?? 0) < 0 ? "export-down" : "export-up"}>{pct(latest?.priceMom)}</span></small></div>
                </div>
                <div className="export-chart-toolbar"><span>{chartPeriod} · {quantity ? "kg/일" : "USD/일"} · 주황 막대: 잠정</span><div className="export-segmented" aria-label="일평균 지표"><button type="button" aria-pressed={!quantity} className={!quantity ? "is-active" : ""} onClick={() => setQuantity(false)}>금액</button><button type="button" aria-pressed={quantity} className={quantity ? "is-active" : ""} onClick={() => setQuantity(true)}>수량 Q</button></div></div>
                <ExportMainChart data={chartData} quantity={quantity} trade={trade} />
                <div className="export-current-insight">
                  <span className="export-trend-tag">{trend(latest?.yoy ?? null, latest?.yoyDelta ?? null)}</span>
                  <span>금액 YoY Δ <b>{pct(latest?.yoyDelta, "%p")}</b><span className="export-insight-divider">·</span>P MoM {pct(latest?.priceMom)}<span className="export-insight-divider">·</span>Q MoM {pct(latest?.quantityMom)}</span>
                </div>
              </article>

                <article className="panel export-detail-card export-price-full">
                  <div className="export-detail-header"><h3>판가 모멘텀</h3><div className="export-segmented" aria-label="판가 지표"><button type="button" aria-pressed={priceLevel} className={priceLevel ? "is-active" : ""} onClick={() => setPriceLevel(true)}>ASP · MoM</button><button type="button" aria-pressed={!priceLevel} className={!priceLevel ? "is-active" : ""} onClick={() => setPriceLevel(false)}>YoY · Δ</button></div></div>
                  <div className="export-price-metrics"><div><span>{priceLevel ? "ASP (USD/kg)" : "ASP YoY"}</span><strong>{priceLevel ? `$${compact(latest?.price)}` : pct(latest?.priceYoy)}</strong></div><div><span>{priceLevel ? "ASP MoM" : "YoY Δ (전월 대비)"}</span><strong className={(priceLevel ? latest?.priceMom ?? 0 : latest?.priceDelta ?? 0) < 0 ? "export-down" : "export-up"}>{pct(priceLevel ? latest?.priceMom : latest?.priceDelta, priceLevel ? "%" : "%p")}</strong></div></div>
                  <div className="export-price-legend"><span style={{ color: "#64748b" }}>▥ {priceLevel ? "ASP · 좌축 USD/kg" : "ASP YoY · 좌축 %"}</span><span style={{ color: "#7c3aed" }}>━ {priceLevel ? "MoM · 우축 %" : "YoY Δ · 우축 %p"}</span></div>
                  <ExportPriceChart data={chartData} level={priceLevel} />
                  <p className="export-footnote">ASP = 금액 ÷ 중량 · 제품 믹스 포함{!priceLevel && " · Δ = 이번 달 YoY − 전월 YoY"}</p>
                </article>
              <p className="export-source-note">원본 엑셀의 일평균 산식 기준 · Q는 일평균 금액 ÷ ASP로 산출 · YoY Δ에는 전년 기저효과가 포함됩니다.</p>
            </div>
          )}
        </>
      )}

      {!selectedItem && !itemsLoading && sectorItems.length > 0 && (
        <div className="panel export-chart-card export-chart-loading">
          항목을 선택하면 차트가 표시됩니다
        </div>
      )}
    </div>
  );
}
