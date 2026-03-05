import { PageHeader } from "@/components/PageHeader";
import { todayKstYmd } from "@/lib/utils/date";

export default function UsDailyMarketPage() {
  const today = todayKstYmd();

  return (
    <>
      <PageHeader
        title="US Daily Market"
        actions={
          <div className="market-news-actions">
            <span className="market-meta-badge">{today}</span>
            <span className="market-status-badge">Updated Placeholder</span>
          </div>
        }
      />

      <section className="panel market-summary-panel">
        <h3>US Daily Market</h3>
        <p>데이터 준비 중입니다.</p>
      </section>

      <section className="panel">
        <div className="empty-state">데이터 준비 중입니다.</div>
      </section>
    </>
  );
}
