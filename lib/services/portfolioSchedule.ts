import { PortfolioHolding } from "@/lib/models/types";
import { calculatePortfolioTotalAsset } from "@/lib/services/portfolioService";

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function resolvePortfolioSchedule(scheduledAt: string, now = Date.now()) {
  const timestamp = Date.parse(scheduledAt);
  const kst = new Date(timestamp + KST_OFFSET_MS);
  const hour = kst.getUTCHours();
  if (!Number.isFinite(timestamp) || ![7, 12, 17].includes(hour) ||
      kst.getUTCMinutes() !== 0 || kst.getUTCSeconds() !== 0 ||
      timestamp > now + 30_000 || now - timestamp > 15 * 60 * 1000) {
    throw new Error("Invalid or late portfolio schedule");
  }
  const snapshotDate = hour === 7
    ? new Date(timestamp + KST_OFFSET_MS - 86400_000).toISOString().slice(0, 10)
    : null;
  return { scheduledAt: new Date(timestamp).toISOString(), hour, snapshotDate };
}

export function buildScheduledSnapshots(
  holdings: Array<PortfolioHolding & { userId: string }>,
  accounts: Array<{ user_id: string; deposit_krw_int: number; deposit_usd_cents: number; cash_krw_int: number }>,
  date: string,
  fxRate: number,
) {
  if (!Number.isFinite(fxRate) || fxRate <= 0) throw new Error("Invalid snapshot exchange rate");
  const users = new Set([...holdings.map(h => h.userId), ...accounts.map(a => a.user_id)]);
  const accountMap = new Map(accounts.map(a => [a.user_id, a]));
  return [...users].map(userId => {
    const account = accountMap.get(userId);
    const total = calculatePortfolioTotalAsset({
      holdings: holdings.filter(h => h.userId === userId),
      fxRate,
      depositKrw: Number(account?.deposit_krw_int ?? 0),
      depositUsdCents: Number(account?.deposit_usd_cents ?? 0),
      cashKrw: Number(account?.cash_krw_int ?? 0),
    }).totalAssetKrw;
    if (!Number.isFinite(total)) throw new Error("Invalid account total");
    return { user_id: userId, date, total_asset_krw_int: Math.max(Math.round(total), 0), fx_rate: fxRate };
  });
}
