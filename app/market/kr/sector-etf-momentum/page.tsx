import { PageHeader } from "@/components/PageHeader";
import { todayKstYmd } from "@/lib/utils/date";

export default function KrSectorEtfMomentumPage() {
  const today = todayKstYmd();

  return (
    <>
      <PageHeader
        title="KR Sector ETF Momentum"
        actions={
          <div className="market-news-actions">
            <span className="market-meta-badge">{today}</span>
            <span className="market-status-badge">Updated Placeholder</span>
          </div>
        }
      />

      <section className="panel market-summary-panel">
        <h3>KR Sector ETF Momentum</h3>
        <p>데이터 준비 중입니다.</p>
      </section>

      <section className="panel">
        <div className="empty-state">데이터 준비 중입니다.</div>
      </section>
    </>
  );
}
