import { PageHeader } from "@/components/PageHeader";
import { MarketFinvizScreeningBoard } from "@/components/market/MarketFinvizScreeningBoard";

export default function MarketScreeningPage() {
  return (
    <div className="market-page">
      <PageHeader
        title="Market Screening"
        description="Finviz 기반 미국 ETF·주요 종목 차트 스크리닝"
      />
      <MarketFinvizScreeningBoard />
    </div>
  );
}
