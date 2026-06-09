import { PageHeader } from "@/components/PageHeader";
import { MarketMomentumBoard } from "@/components/market/MarketMomentumBoard";

export default function MarketMomentumPage() {
  return (
    <section>
      <PageHeader
        title="Momentum"
        description="섹터 모멘텀 맵, Z-Score, 이동 변화, AI 해석"
      />
      <MarketMomentumBoard />
    </section>
  );
}
