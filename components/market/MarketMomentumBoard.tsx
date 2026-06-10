"use client";

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";

type MomentumAnalysis = {
  generated_at?: string;
  analysis_text?: string;
};

type MomentumImage = {
  title: string;
  src: string;
  alt: string;
};

const MOMENTUM_IMAGES: MomentumImage[] = [
  {
    title: "Momentum Map",
    src: "/momentum/latest/momentum_map.png",
    alt: "Momentum map",
  },
  {
    title: "Z Daily",
    src: "/momentum/latest/z_daily.png",
    alt: "Z daily chart",
  },
  {
    title: "Movement",
    src: "/momentum/latest/movement.png",
    alt: "Momentum movement chart",
  },
];

function MomentumImageCard({
  image,
  onZoom,
  className = "",
}: {
  image: MomentumImage;
  onZoom: (image: MomentumImage) => void;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <article className={`panel momentum-card momentum-image-card ${className}`.trim()}>
      <div className="panel-header-inline">
        <h3>{image.title}</h3>
      </div>
      <button
        type="button"
        className="momentum-image-button"
        onClick={() => {
          if (!failed) {
            onZoom(image);
          }
        }}
        disabled={failed}
        aria-label={`${image.title} 확대`}
      >
        {failed ? (
          <div className="momentum-empty-state">
            public/momentum/latest/{image.src.split("/").pop()} 파일을 불러오지 못했습니다.
          </div>
        ) : (
          <img
            className="momentum-card-image"
            src={image.src}
            alt={image.alt}
            loading="lazy"
            onError={() => setFailed(true)}
          />
        )}
      </button>
    </article>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${match.index}-strong`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={`${match.index}-code`}>{token.slice(1, -1)}</code>);
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

function formatKstDateTime(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute} KST`;
}

function formatLastUpdated(analysis: MomentumAnalysis | null): string {
  if (analysis?.generated_at) {
    const formatted = formatKstDateTime(analysis.generated_at);
    if (formatted) {
      return formatted;
    }
  }

  const textDate = analysis?.analysis_text?.match(/^\[(\d{4}-\d{2}-\d{2})\]/)?.[1];
  if (textDate) {
    return `${textDate} KST`;
  }

  return "-";
}

function AnalysisCard({
  analysis,
  loading,
  error,
}: {
  analysis: MomentumAnalysis | null;
  loading: boolean;
  error: string | null;
}) {
  const analysisText =
    analysis?.analysis_text?.trim() ||
    "[Momentum] 모멘텀 분석\n\n아직 생성된 analysis_text가 없습니다.";

  return (
    <article className="panel momentum-card momentum-analysis-card momentum-card-analysis">
      <div className="panel-header-inline">
        <h3>AI Analysis</h3>
      </div>

      {loading ? (
        <div className="momentum-analysis-loading">analysis.json 로딩 중...</div>
      ) : error ? (
        <div className="momentum-empty-state">
          analysis.json을 불러오지 못했습니다. Momentum 이미지가 먼저 생성되었는지 확인해주세요.
        </div>
      ) : (
        <div className="momentum-telegram-note" aria-label="Momentum analysis text">
          {renderInlineMarkdown(analysisText)}
        </div>
      )}
    </article>
  );
}

export function MarketMomentumBoard() {
  const [analysis, setAnalysis] = useState<MomentumAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<MomentumImage | null>(null);
  const lastUpdated = useMemo(() => formatLastUpdated(analysis), [analysis]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnalysis() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch("/momentum/latest/analysis.json", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`analysis.json HTTP ${response.status}`);
        }

        const payload = (await response.json()) as MomentumAnalysis;
        if (!cancelled) {
          setAnalysis(payload);
        }
      } catch (caught) {
        if (!cancelled) {
          setAnalysis(null);
          setError(caught instanceof Error ? caught.message : "Unknown error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAnalysis();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="momentum-last-updated">Last Updated: {lastUpdated}</div>

      <div className="momentum-grid">
        <MomentumImageCard
          image={MOMENTUM_IMAGES[0]}
          onZoom={setZoomImage}
          className="momentum-card-map"
        />
        <MomentumImageCard
          image={MOMENTUM_IMAGES[1]}
          onZoom={setZoomImage}
          className="momentum-card-z"
        />
        <MomentumImageCard
          image={MOMENTUM_IMAGES[2]}
          onZoom={setZoomImage}
          className="momentum-card-movement"
        />
        <AnalysisCard analysis={analysis} loading={loading} error={error} />
      </div>

      <Modal
        open={Boolean(zoomImage)}
        title={zoomImage?.title ?? "Momentum Image"}
        onClose={() => setZoomImage(null)}
        cardClassName="market-zoom-modal-card"
      >
        {zoomImage ? (
          <div className="market-zoom-image-wrap">
            <img className="market-zoom-image" src={zoomImage.src} alt={zoomImage.alt} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
