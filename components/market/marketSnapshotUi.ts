import { getMarketCategoryBadgeTone } from "@/lib/repository/mappers/marketSnapshotMapper";

export function categoryBadgeClass(category: string): string {
  return `market-category-badge ${getMarketCategoryBadgeTone(category)}`;
}
