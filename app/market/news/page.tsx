import { PageHeader } from "@/components/PageHeader";

const PLACEHOLDER_NEWS = [
  {
    id: "news-1",
    title: "오늘의 요약",
    body: "시장 주요 이슈와 섹터 흐름을 여기에 기록합니다.",
    meta: "Daily Brief",
  },
  {
    id: "news-2",
    title: "Macro",
    body: "금리/달러/유가 등 매크로 포인트를 정리합니다.",
    meta: "Template",
  },
  {
    id: "news-3",
    title: "Indices",
    body: "주요 지수와 상대강도 체크 결과를 정리합니다.",
    meta: "Template",
  },
];

export default function MarketNewsPage() {
  return (
    <section>
      <PageHeader title="News" />
      <section className="panel market-news-list">
        {PLACEHOLDER_NEWS.map((item) => (
          <article key={item.id} className="market-news-card">
            <h4>{item.title}</h4>
            <p>{item.body}</p>
            <span className="market-news-meta">{item.meta}</span>
          </article>
        ))}
      </section>
    </section>
  );
}
