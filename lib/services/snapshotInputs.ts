import { SupabasePortfolioAccountStateRepository } from "@/lib/repository/portfolioAccountStateRepository";

// Snapshot writes must use the signed-in account, never an unowned browser cache.
export async function loadSnapshotCash(userId: string) {
  if (!userId) throw new Error("로그인 후 사용 가능합니다.");
  const state = await new SupabasePortfolioAccountStateRepository(userId).getState();
  return {
    depositKrw: state?.depositKrwInt ?? 0,
    depositUsdCents: state?.depositUsdCents ?? 0,
    cashKrw: state?.cashKrwInt ?? 0,
  };
}

export async function fetchSnapshotFxRate(): Promise<{ rate: number; asOf: string }> {
  const response = await fetch("/api/fx", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("환율을 확인할 수 없어 자산 기록을 중단했습니다. 잠시 후 다시 시도해 주세요.");
  }
  const data = await response.json() as { rate?: unknown; asOf?: unknown };
  const rate = Number(data.rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("유효한 환율을 확인할 수 없어 자산 기록을 중단했습니다.");
  }
  return { rate, asOf: typeof data.asOf === "string" ? data.asOf : "" };
}
