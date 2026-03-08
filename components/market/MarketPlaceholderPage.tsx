import { PageHeaderBar } from "@/components/common/PageHeaderBar";
import { SectionCard } from "@/components/common/SectionCard";
import { MarketPlaceholderCard } from "@/lib/market/marketPages";

interface MarketPlaceholderPageProps {
  title: string;
  cards: MarketPlaceholderCard[];
}

export function MarketPlaceholderPage({
  title,
  cards,
}: MarketPlaceholderPageProps) {
  return (
    <section>
      <PageHeaderBar title={title} />
      <SectionCard className="market-news-list">
        {cards.map((item) => (
          <article key={item.id} className="market-news-card">
            <h4>{item.title}</h4>
            <p>{item.body}</p>
            <span className="market-news-meta">{item.meta}</span>
          </article>
        ))}
      </SectionCard>
    </section>
  );
}

export default MarketPlaceholderPage;
