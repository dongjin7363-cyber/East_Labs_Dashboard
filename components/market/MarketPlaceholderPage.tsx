import { PageHeader } from "@/components/PageHeader";
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
      <PageHeader title={title} />
      <section className="panel market-news-list">
        {cards.map((item) => (
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

export default MarketPlaceholderPage;
