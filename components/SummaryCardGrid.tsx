import { ReactNode } from "react";

type Tone = "default" | "positive" | "negative";

interface SummaryCard {
  title: string;
  value?: ReactNode;
  subtitle?: ReactNode;
  tone?: Tone;
}

interface SummaryCardGridProps {
  cards: SummaryCard[];
}

export function SummaryCardGrid({ cards }: SummaryCardGridProps) {
  return (
    <section className="summary-grid">
      {cards.map((card) => (
        <article key={card.title} className={`summary-card ${card.tone ?? "default"}`}>
          <div className="summary-title">{card.title}</div>
          <div className="summary-value">{card.value ?? "-"}</div>
          <div className="summary-subvalue">{card.subtitle ?? ""}</div>
        </article>
      ))}
    </section>
  );
}
