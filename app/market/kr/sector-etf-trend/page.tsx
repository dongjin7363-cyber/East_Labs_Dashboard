import { PageHeader } from "@/components/PageHeader";
import { todayKstYmd } from "@/lib/utils/date";

const SECTION_TAGS = [
  "코스피",
  "코스닥",
  "반도체",
  "2차전지",
  "바이오",
  "방산",
  "소형주",
  "가치주",
  "성장주",
];

export default function KrSectorEtfTrendPage() {
  const today = todayKstYmd();

  return (
    <>
      <PageHeader
        title="KR Sector ETF Trend"
        description="국내 ETF/섹터/지수 차트를 일별 스냅샷으로 확인합니다."
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
            <div className="market-etf-empty-state">데이터 준비 중입니다.</div>
          </div>

          <div className="market-etf-actions">
            <button type="button" className="secondary-button" disabled>
              원본 보기
            </button>
            <button type="button" className="primary-button" disabled>
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
            <p>국내 섹터 흐름을 확인하는 일별 스냅샷 영역입니다.</p>
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
            <p>데이터 연결 전 placeholder 상태입니다.</p>
          </article>
        </aside>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>Recent Snapshots</h3>
          <span className="panel-submetric">Placeholder</span>
        </div>
        <div className="market-news-list">
          <article className="market-news-card">
            <h4>최근 스냅샷 데이터가 없습니다.</h4>
            <p>데이터 준비 중입니다.</p>
          </article>
        </div>
      </section>
    </>
  );
}
