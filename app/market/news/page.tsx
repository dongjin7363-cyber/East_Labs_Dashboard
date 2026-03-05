import { PageHeader } from "@/components/PageHeader";
import { todayKstYmd } from "@/lib/utils/date";

const PLACEHOLDER_NEWS = [
  {
    id: "n1",
    title: "미국 장 마감 요약 자리",
    source: "Market Feed",
    summary: "데이터 연동 전까지 표시되는 플레이스홀더입니다.",
  },
  {
    id: "n2",
    title: "섹터 강약 체크 자리",
    source: "Sector Pulse",
    summary: "상승/하락 섹터 요약 카드가 여기에 표시됩니다.",
  },
  {
    id: "n3",
    title: "매크로 이벤트 요약 자리",
    source: "Macro Brief",
    summary: "금리/달러/유가 등 핵심 포인트를 보여줄 예정입니다.",
  },
  {
    id: "n4",
    title: "기업/ETF 이슈 자리",
    source: "Ticker Watch",
    summary: "주요 종목/ETF 관련 뉴스와 코멘트 영역입니다.",
  },
];

export default function MarketNewsPage() {
  const today = todayKstYmd();

  return (
    <>
      <PageHeader
        title="News"
        actions={
          <div className="market-news-actions">
            <span className="market-meta-badge">{today}</span>
            <button type="button" className="ghost-button" disabled>
              Filter (Coming Soon)
            </button>
          </div>
        }
      />

      <section className="panel market-summary-panel">
        <h3>오늘의 요약</h3>
        <p>
          시장 뉴스/요약 데이터 연동 전 상태입니다. 곧 실제 뉴스 요약이 표시됩니다.
        </p>
      </section>

      <section className="panel">
        <div className="panel-header-inline">
          <h3>News List</h3>
          <span className="panel-submetric">Placeholder</span>
        </div>
        <div className="market-news-list">
          {PLACEHOLDER_NEWS.map((item) => (
            <article key={item.id} className="market-news-card">
              <div className="market-news-meta">
                <span>{item.source}</span>
              </div>
              <h4>{item.title}</h4>
              <p>{item.summary}</p>
            </article>
          ))}
        </div>
        <p className="empty-state">뉴스 데이터가 아직 없습니다.</p>
      </section>
    </>
  );
}

