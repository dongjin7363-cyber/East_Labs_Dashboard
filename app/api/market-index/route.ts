import { NextResponse } from "next/server";
import { parseIndexSnapshot, parseUsIndexes } from "@/lib/marketIndexes";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readIndexData(url: string): Promise<unknown> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json", Referer: "https://m.stock.naver.com/" },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [kospiData, kosdaqData, usData] = await Promise.all([
    readIndexData("https://m.stock.naver.com/api/index/KOSPI/basic"),
    readIndexData("https://m.stock.naver.com/api/index/KOSDAQ/basic"),
    readIndexData("https://api.stock.naver.com/index/nation/USA"),
  ]);
  return NextResponse.json({
    kospi: parseIndexSnapshot(kospiData),
    kosdaq: parseIndexSnapshot(kosdaqData),
    ...parseUsIndexes(usData),
    fetchedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}
