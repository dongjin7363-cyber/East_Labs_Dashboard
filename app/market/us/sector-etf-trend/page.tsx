"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { todayKstYmd } from "@/lib/utils/date";

const SAMPLE_IMAGE_SRC = "/market/us-etf-screening-sample.png";

const SECTION_TAGS = [
  "자산배분",
  "현재계 주식",
  "주식 60/채권 40",
  "미국 S&P 500",
  "나스닥",
  "유로존",
  "이머징",
  "중국 대형주",
  "미국 소형주",
];

export default function UsSectorEtfTrendPage() {
  const [isZoomOpen, setZoomOpen] = useState(false);
  const [imageBroken, setImageBroken] = useState(false);
  const today = todayKstYmd();
  const recentSnapshots = useMemo(
    () => [
      { id: "r1", date: today, title: "US Sector ETF Trend Snapshot" },
      { id: "r2", date: "2026-03-04", title: "US Sector ETF Trend Snapshot" },
      { id: "r3", date: "2026-03-03", title: "US Sector ETF Trend Snapshot" },
    ],
    [today],
  );

  return (
    <>
      <PageHeader
        title="US Sector ETF Trend"
        description="미국 ETF/섹터/지수 차트를 일별 스냅샷으로 확인합니다."
        actions={
          <div className="market-etf-header-meta">
            <span className="market-meta-badge">{today}</span>
            <span className="market-status-badge">Daily Snapshot</span>
          </div>
        }
      />

      <section className="panel market-etf-layout">
        <article className="market-etf-main">
          <div className="market-etf-image-wrap">
            {imageBroken ? (
              <div className="market-etf-image-fallback">
                샘플 이미지 파일을
                <br />
                <code>public/market/us-etf-screening-sample.png</code>
                <br />
                경로에 넣어주세요.
              </div>
            ) : (
              <img
                src={SAMPLE_IMAGE_SRC}
                alt="US Sector ETF Trend sample"
                className="market-etf-image"
                onClick={() => setZoomOpen(true)}
                onError={() => setImageBroken(true)}
              />
            )}
          </div>

          <div className="market-etf-actions">
            <a
              href={SAMPLE_IMAGE_SRC}
              target="_blank"
              rel="noreferrer"
              className="secondary-button"
            >
              원본 보기
            </a>
            <button
              type="button"
              className="primary-button"
              onClick={() => setZoomOpen(true)}
            >
              확대 보기
            </button>
          </div>
        </article>

        <aside className="market-etf-side">
          <article className="market-etf-info-card">
            <h3>Snapshot Info</h3>
            <div className="market-kv-row">
              <span>기준일</span>
              <strong>{today}</strong>
            </div>
            <p>
              미국 시장 ETF/섹터 흐름을 빠르게 체크하기 위한 일별 스냅샷 영역입니다.
            </p>
          </article>

          <article className="market-etf-info-card">
            <h3>구성 섹션</h3>
            <div className="market-tag-list">
              {SECTION_TAGS.map((tag) => (
                <span key={tag} className="market-tag">
                  {tag}
                </span>
              ))}
            </div>
          </article>

          <article className="market-etf-info-card">
            <h3>메모</h3>
            <p>
              오늘 섹터 강약과 위험자산 선호도를 확인하고,
              <br />
              내일 대응 시나리오를 정리하는 공간입니다.
            </p>
          </article>
        </aside>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>Recent Snapshots</h3>
          <span className="panel-submetric">Sample</span>
        </div>
        <div className="market-recent-grid">
          {recentSnapshots.map((snapshot) => (
            <article key={snapshot.id} className="market-recent-card">
              <div className="market-recent-thumb-wrap">
                <img
                  src={SAMPLE_IMAGE_SRC}
                  alt={`${snapshot.date} snapshot`}
                  className="market-recent-thumb"
                  onError={() => setImageBroken(true)}
                />
              </div>
              <div className="market-recent-body">
                <strong>{snapshot.title}</strong>
                <span>{snapshot.date}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <Modal
        open={isZoomOpen && !imageBroken}
        title="US Sector ETF Trend"
        onClose={() => setZoomOpen(false)}
        cardClassName="market-zoom-modal-card"
      >
        <div className="market-zoom-image-wrap">
          <img
            src={SAMPLE_IMAGE_SRC}
            alt="US Sector ETF Trend enlarged"
            className="market-zoom-image"
          />
        </div>
      </Modal>
    </>
  );
}
