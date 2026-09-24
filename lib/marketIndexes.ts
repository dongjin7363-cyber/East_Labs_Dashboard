export type IndexSnapshot = {
  price: number;
  changePercent: number | null;
  asOf: string | null;
  marketStatus: string | null;
};
export type MarketIndexes = {
  kospi: IndexSnapshot | null;
  kosdaq: IndexSnapshot | null;
  sp500: IndexSnapshot | null;
  nasdaq: IndexSnapshot | null;
  fetchedAt: string;
};
function numeric(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).replace(/,/g, "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
export function parseIndexSnapshot(value: unknown): IndexSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const price = numeric(row.closePrice);
  if (price === null || price <= 0) return null;
  const previous = numeric(row.lastClosePrice);
  const changePercent = numeric(row.fluctuationsRatio)
    ?? (previous !== null && previous > 0 ? (price / previous - 1) * 100 : null);
  return {
    price, changePercent,
    asOf: typeof row.localTradedAt === "string" ? row.localTradedAt : null,
    marketStatus: typeof row.marketStatus === "string" ? row.marketStatus : null,
  };
}
export function parseUsIndexes(payload: unknown) {
  const rows = Array.isArray(payload) ? payload : [];
  return {
    sp500: parseIndexSnapshot(rows.find(row => row?.reutersCode === ".INX")),
    nasdaq: parseIndexSnapshot(rows.find(row => row?.reutersCode === ".IXIC")),
  };
}
