import { EmptyState } from "@/components/common/EmptyState";

interface EmptyChartStateProps {
  title?: string;
}

export function EmptyChartState({
  title = "차트 데이터가 없습니다.",
}: EmptyChartStateProps) {
  return <EmptyState title={title} compact className="empty-chart-state" />;
}

export default EmptyChartState;
