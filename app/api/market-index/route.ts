import { NextResponse } from "next/server";

const FINNHUB_KEY = process.env.FINNHUB_API_KEY ?? "";

type IndexSnapshot = { price: number; changePercent: number } | null;

async function fetchNaverIndex(code: string): Promise<IndexSnapshot> {
  try {
    const res = await fetch(`https://m.stock.naver.com/api/index/${code}/basic`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    const rawPrice =
      row.closePrice ?? row.nv ?? row.currentValue ?? row.indexValue ?? row.value;
    const price = parseFloat(String(rawPrice).replace(/,/g, ""));
    const rawPct =
      row.fluctuationsRatio ??
      row.fluctuationRate ??
      row.compareToPreviousClosePriceRate ??
      row.changeRate ??
      row.rf;
    const changePercent = parseFloat(String(rawPct ?? "0").replace(/,/g, ""));
    if (!price || !Number.isFinite(price)) return null;
    return { price, changePercent: Number.isFinite(changePercent) ? changePercent : 0 };
  } catch {
    return null;
  }
}

async function fetchFinnhubQuote(symbol: string): Promise<IndexSnapshot> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_KEY}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== "object") return null;
    const row = data as Record<string, unknown>;
    const price = Number(row.c ?? 0);
    const changePercent = Number(row.dp ?? 0);
    if (!price || !Number.isFinite(price)) return null;
    return { price, changePercent: Number.isFinite(changePercent) ? changePercent : 0 };
  } catch {
    return null;
  }
}

export async function GET() {
  const [kospi, kosdaq, sp500] = await Promise.all([
    fetchNaverIndex("KOSPI"),
    fetchNaverIndex("KOSDAQ"),
    fetchFinnhubQuote("SPY"),
  ]);
  return NextResponse.json({ kospi, kosdaq, sp500 });
}
