import { PortfolioHolding } from "@/lib/models/types";

const US_DISPLAY_NAME_FALLBACK: Record<string, string> = {
  RKLB: "Rocket Lab",
};

const KR_CODE_NAME_MAP: Record<string, string> = {
  "000660": "SK하이닉스",
  "348340": "뉴로메카",
  "307950": "현대오토에버",
  "006400": "삼성SDI",
  "007660": "이수페타시스",
  "020150": "롯데에너지머티리얼즈",
  "005930": "삼성전자",
  "042660": "한화오션",
  "003670": "포스코퓨처엠",
  "005380": "현대차",
  "000270": "기아",
  "373220": "LG에너지솔루션",
  "066570": "LG전자",
  "011070": "LG이노텍",
  "017670": "SK텔레콤",
  "035420": "NAVER",
  "035720": "카카오",
};

type HoldingDisplaySource = PortfolioHolding &
  Partial<{
    display_name: string | null;
    name: string | null;
    symbol_name: string | null;
    stock_name: string | null;
    kr_code: string | null;
    symbol: string | null;
  }>;

function normalizeText(value?: string | null): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isKrTickerCodeLike(value?: string | null): boolean {
  const normalized = normalizeText(value)?.toUpperCase();

  if (!normalized) {
    return false;
  }

  return /^[A-Z0-9]{1,12}$/.test(normalized);
}

function normalizeCode(value?: string | null): string | undefined {
  return normalizeText(value)?.toUpperCase();
}

export function resolveHoldingTickerMeta(holding: HoldingDisplaySource): string {
  const krCode = normalizeCode(holding.krCode ?? holding.kr_code);

  if (holding.market === "KR" && krCode) {
    return krCode;
  }

  const ticker = normalizeCode(holding.ticker);

  if (ticker) {
    return ticker;
  }

  const symbol = normalizeCode(holding.symbol);
  return symbol ?? "-";
}

export function getHoldingCode(holding: HoldingDisplaySource): string {
  return resolveHoldingTickerMeta(holding);
}

export function resolveHoldingDisplayName(holding: HoldingDisplaySource): string {
  const explicitName =
    normalizeText(holding.displayName) ??
    normalizeText(holding.display_name) ??
    normalizeText(holding.name) ??
    normalizeText(holding.symbol_name) ??
    normalizeText(holding.stock_name);

  if (explicitName && !isKrTickerCodeLike(explicitName)) {
    return explicitName;
  }

  const krMappedName =
    holding.market === "KR" ? KR_CODE_NAME_MAP[getHoldingCode(holding)] : undefined;

  if (krMappedName) {
    return krMappedName;
  }

  const ticker = normalizeText(holding.ticker);

  if (holding.market === "KR" && ticker && !isKrTickerCodeLike(ticker)) {
    return ticker;
  }

  if (holding.market === "US" && ticker) {
    const symbol = ticker.toUpperCase();
    return explicitName ?? US_DISPLAY_NAME_FALLBACK[symbol] ?? symbol;
  }

  return explicitName ?? ticker ?? "-";
}

export function getHoldingDisplayName(holding: HoldingDisplaySource): string {
  return resolveHoldingDisplayName(holding);
}

export function getHoldingTableDisplayName(holding: HoldingDisplaySource): string {
  return getHoldingDisplayName(holding);
}

export function resolveHoldingGroupingKey(holding: HoldingDisplaySource): string {
  return `${holding.market}:${getHoldingCode(holding)}`;
}
