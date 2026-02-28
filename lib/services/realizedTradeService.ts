import {
  Currency,
  DateRange,
  Market,
  RealizedTrade,
  TradeRating,
} from "@/lib/models/types";
import { isDateInRange } from "@/lib/utils/date";
import { createId } from "@/lib/utils/id";
import { usdCentsToUsdFloat, usdToKrw } from "@/lib/utils/money";

const REALIZED_TRADES_STORAGE_KEY = "pf_realized_trades_v1";
const REALIZED_TRADES_SCHEMA_VERSION = 1;
const DEFAULT_FX_RATE = 1350;

interface RealizedTradeStorageSchema {
  schemaVersion: number;
  trades: RealizedTrade[];
  updatedAt: string;
}

export interface RealizedTradeInput {
  date: string;
  market: Market;
  ticker: string;
  qty: number;
  buyPriceInt: number;
  buyAmountInt?: number;
  sellPriceInt: number;
  sellAmountInt?: number;
  returnPct?: number;
  content: string;
  rating: TradeRating;
}

export interface RealizedTradeFilter {
  dateRange?: DateRange;
  market?: Market | "ALL";
  search?: string;
  rating?: TradeRating | "ALL";
}

export interface RealizedTradeSummary {
  totalCount: number;
  winCount: number;
  netPnlInt: number;
  winRate: number;
}

export interface RealizedTradeSummaryOptions {
  fxRate?: number;
  includeUsd?: boolean;
}

export interface NetSeriesOptions extends RealizedTradeSummaryOptions {
  tradingDays?: string[];
}

export interface DailyNetPoint {
  date: string;
  netPnlInt: number | null;
}

export interface MonthlyNetPoint {
  month: string;
  netPnlInt: number;
}

export interface CsvImportResult {
  trades: RealizedTrade[];
  inserted: number;
  skipped: number;
  failed: number;
  totalRows: number;
}

type SeedTrade = Omit<RealizedTrade, "id" | "createdAt">;

type CsvField =
  | "date"
  | "market"
  | "ticker"
  | "qty"
  | "buyPrice"
  | "buyAmount"
  | "sellPrice"
  | "sellAmount"
  | "returnPct"
  | "pnlInt"
  | "content"
  | "rating";

type CsvHeaderMap = Partial<Record<CsvField, number>>;

const FEBRUARY_REAL_TRADES_NET_PNL = 2_011_593;

const FEBRUARY_REAL_TRADES: SeedTrade[] = [
  { date: "2026-02-02", market: "KR", ticker: "엠비알모션", qty: 141, buyPriceInt: 21016, buyAmountInt: 2963256, sellPriceInt: 22950, sellAmountInt: 3235950, returnPct: 9.2, pnlInt: 272694, content: "신규주 차트 플레이", rating: "Best" },
  { date: "2026-02-03", market: "KR", ticker: "퀀트메디슨", qty: 214, buyPriceInt: 15943, buyAmountInt: 3411802, sellPriceInt: 17210, sellAmountInt: 3682940, returnPct: 7.95, pnlInt: 271138, content: "신규주 차트 플레이", rating: "Best" },
  { date: "2026-02-04", market: "KR", ticker: "글로벌텍스프리", qty: 832, buyPriceInt: 4794, buyAmountInt: 3988608, sellPriceInt: 5260, sellAmountInt: 4376320, returnPct: 9.72, pnlInt: 387712, content: "차주 설 여행관련주 플레이", rating: "Best" },
  { date: "2026-02-05", market: "KR", ticker: "로킷헬스케어", qty: 69, buyPriceInt: 63314, buyAmountInt: 4368666, sellPriceInt: 58400, sellAmountInt: 4029600, returnPct: -7.76, pnlInt: -339066, content: "바이오 플레이 실패", rating: "Bad" },
  { date: "2026-02-05", market: "KR", ticker: "퀀트메디슨", qty: 96, buyPriceInt: 17391, buyAmountInt: 1669536, sellPriceInt: 16660, sellAmountInt: 1599360, returnPct: -4.2, pnlInt: -70176, content: "신규주 차트 플레이", rating: "Normal" },
  { date: "2026-02-05", market: "KR", ticker: "엠비알모션", qty: 100, buyPriceInt: 21716, buyAmountInt: 2171600, sellPriceInt: 20100, sellAmountInt: 2010000, returnPct: -7.44, pnlInt: -161600, content: "신규주 차트 플레이", rating: "Normal" },
  { date: "2026-02-05", market: "KR", ticker: "세미파이브", qty: 72, buyPriceInt: 28913, buyAmountInt: 2081736, sellPriceInt: 28440, sellAmountInt: 2047680, returnPct: -1.64, pnlInt: -34056, content: "신규주 차트 플레이", rating: "Normal" },
  { date: "2026-02-05", market: "KR", ticker: "삼진식품", qty: 252, buyPriceInt: 10381, buyAmountInt: 2616012, sellPriceInt: 11032, sellAmountInt: 2780064, returnPct: 6.27, pnlInt: 164052, content: "신규주 차트 플레이", rating: "Best" },
  { date: "2026-02-05", market: "KR", ticker: "이지스", qty: 343, buyPriceInt: 10943, buyAmountInt: 3753449, sellPriceInt: 12353, sellAmountInt: 4237079, returnPct: 12.88, pnlInt: 483630, content: "신규주 차트 플레이", rating: "Best" },
  { date: "2026-02-10", market: "KR", ticker: "삼진식품", qty: 258, buyPriceInt: 9638, buyAmountInt: 2486604, sellPriceInt: 9330, sellAmountInt: 2407140, returnPct: -3.2, pnlInt: -79464, content: "신규주 차트 플레이", rating: "Normal" },
  { date: "2026-02-13", market: "KR", ticker: "페스카로", qty: 98, buyPriceInt: 23550, buyAmountInt: 2307900, sellPriceInt: 23000, sellAmountInt: 2254000, returnPct: -2.34, pnlInt: -53900, content: "신규주 차트 플레이", rating: "Normal" },
  { date: "2026-02-13", market: "KR", ticker: "에센테크", qty: 4442, buyPriceInt: 508, buyAmountInt: 2256536, sellPriceInt: 560, sellAmountInt: 2487520, returnPct: 10.24, pnlInt: 230984, content: "동전주 플레이", rating: "Best" },
  { date: "2026-02-13", market: "US", ticker: "QS", qty: 100, buyPriceInt: 12558, buyAmountInt: 1255800, sellPriceInt: 11533, sellAmountInt: 1153300, returnPct: -8.16, pnlInt: -102500, content: "전고체 배터리", rating: "Bad" },
  { date: "2026-02-19", market: "KR", ticker: "오름테라퓨틱", qty: 46, buyPriceInt: 104686, buyAmountInt: 4815556, sellPriceInt: 109870, sellAmountInt: 5054020, returnPct: 4.95, pnlInt: 238464, content: "근본 바이오", rating: "Normal" },
  { date: "2026-02-19", market: "KR", ticker: "서울식품", qty: 36938, buyPriceInt: 162, buyAmountInt: 5983956, sellPriceInt: 175, sellAmountInt: 6464150, returnPct: 8.02, pnlInt: 480194, content: "동전주 플레이", rating: "Best" },
  { date: "2026-02-19", market: "US", ticker: "POET", qty: 163, buyPriceInt: 9317, buyAmountInt: 1518671, sellPriceInt: 7966, sellAmountInt: 1298458, returnPct: -14.5, pnlInt: -220213, content: "광연결 관련주", rating: "Normal" },
  { date: "2026-02-20", market: "KR", ticker: "SK하이닉스", qty: 4, buyPriceInt: 922000, buyAmountInt: 3688000, sellPriceInt: 952000, sellAmountInt: 3808000, returnPct: 3.25, pnlInt: 120000, content: "블랙록 하닉 지분 매수 이슈", rating: "Best" },
  { date: "2026-02-20", market: "KR", ticker: "서울식품", qty: 16948, buyPriceInt: 177, buyAmountInt: 2999796, sellPriceInt: 202, sellAmountInt: 3423496, returnPct: 14.12, pnlInt: 423700, content: "동전주 플레이", rating: "Best" },
];

const US_MARKET_SYMBOL_HINTS = new Set(["QS", "POET", "AAPL", "TSLA", "NVDA", "MSFT"]);

const CSV_HEADER_ALIASES: Record<CsvField, string[]> = {
  date: ["date", "매매일", "거래일", "일자"],
  market: ["market", "시장", "거래소", "국가"],
  ticker: ["ticker", "symbol", "티커", "종목", "종목코드", "name", "종목명", "이름"],
  qty: ["qty", "quantity", "수량"],
  buyPrice: ["buyprice", "매수가", "매수가격", "매입단가"],
  buyAmount: ["buyamount", "매입금액", "매수금액", "매입액"],
  sellPrice: ["sellprice", "매도가", "매도가격"],
  sellAmount: ["sellamount", "매도금액", "매도액"],
  returnPct: ["returnpct", "수익률", "수익률pct"],
  pnlInt: ["pnl", "pnlint", "손익", "수익금", "실현손익"],
  content: ["content", "comment", "memo", "코멘트", "비고", "메모"],
  rating: ["rating", "평가", "상태"],
};

function isClient(): boolean {
  return typeof window !== "undefined";
}

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createEmptySchema(): RealizedTradeStorageSchema {
  return {
    schemaVersion: REALIZED_TRADES_SCHEMA_VERSION,
    trades: [],
    updatedAt: new Date().toISOString(),
  };
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toRoundedInt(value: unknown, fallback = 0): number {
  const parsed = toFiniteNumber(value);

  if (parsed === null) {
    return fallback;
  }

  return Math.round(parsed);
}

function normalizeRating(value: unknown): TradeRating {
  if (value === "Best" || value === "Good" || value === "Normal" || value === "Bad") {
    return value;
  }

  return "";
}

function inferMarket(ticker: string): Market {
  const normalizedTicker = ticker.trim().toUpperCase();

  if (US_MARKET_SYMBOL_HINTS.has(normalizedTicker)) {
    return "US";
  }

  if (/^\d{4,6}$/.test(normalizedTicker)) {
    return "KR";
  }

  if (/[가-힣]/.test(normalizedTicker)) {
    return "KR";
  }

  if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(normalizedTicker)) {
    return "US";
  }

  return "KR";
}

function normalizeMarket(value: unknown, ticker: string): Market {
  if (value === "KR" || value === "US") {
    return value;
  }

  return inferMarket(ticker);
}

function normalizeTrade(raw: unknown, index: number): RealizedTrade | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const input = raw as Record<string, unknown>;
  const ticker =
    typeof input.ticker === "string"
      ? input.ticker.trim().toUpperCase()
      : typeof input.symbol === "string"
        ? input.symbol.trim().toUpperCase()
        : typeof input.name === "string"
          ? input.name.trim()
          : "";

  if (!ticker) {
    return null;
  }

  const market = normalizeMarket(input.market, ticker);
  const qty = Math.max(toRoundedInt(input.qty, 0), 0);
  const buyPriceInt = Math.max(toRoundedInt(input.buyPriceInt, 0), 0);
  const sellPriceInt = Math.max(toRoundedInt(input.sellPriceInt, 0), 0);

  const buyAmountIntInput = toFiniteNumber(input.buyAmountInt);
  const sellAmountIntInput = toFiniteNumber(input.sellAmountInt);
  const buyAmountInt =
    buyAmountIntInput !== null && buyAmountIntInput >= 0
      ? Math.round(buyAmountIntInput)
      : qty * buyPriceInt;
  const sellAmountInt =
    sellAmountIntInput !== null && sellAmountIntInput >= 0
      ? Math.round(sellAmountIntInput)
      : qty * sellPriceInt;
  const pnlInt =
    toFiniteNumber(input.pnlInt) !== null
      ? Math.round(toFiniteNumber(input.pnlInt) as number)
      : sellAmountInt - buyAmountInt;
  const returnPct =
    toFiniteNumber(input.returnPct) !== null
      ? (toFiniteNumber(input.returnPct) as number)
      : buyAmountInt > 0
        ? (pnlInt / buyAmountInt) * 100
        : 0;

  const fallbackDate = toYmd(new Date());
  const date = typeof input.date === "string" ? input.date : fallbackDate;

  return {
    id: typeof input.id === "string" ? input.id : createId(),
    date,
    market,
    ticker,
    qty,
    buyPriceInt,
    buyAmountInt,
    sellPriceInt,
    sellAmountInt,
    returnPct,
    pnlInt,
    content: typeof input.content === "string" ? input.content.trim() : "",
    rating: normalizeRating(input.rating),
    createdAt:
      typeof input.createdAt === "string"
        ? input.createdAt
        : `${date}T00:${`${index}`.padStart(2, "0")}:00.000Z`,
  };
}

function normalizeSchema(raw: unknown): RealizedTradeStorageSchema {
  if (!raw || typeof raw !== "object") {
    return createEmptySchema();
  }

  const data = raw as Partial<RealizedTradeStorageSchema>;

  if (data.schemaVersion !== REALIZED_TRADES_SCHEMA_VERSION) {
    return createEmptySchema();
  }

  const trades = Array.isArray(data.trades)
    ? data.trades
        .map((trade, index) => normalizeTrade(trade, index))
        .filter((trade): trade is RealizedTrade => Boolean(trade))
    : [];

  return {
    schemaVersion: REALIZED_TRADES_SCHEMA_VERSION,
    trades,
    updatedAt:
      typeof data.updatedAt === "string"
        ? data.updatedAt
        : new Date().toISOString(),
  };
}

function readSchema(): RealizedTradeStorageSchema {
  if (!isClient()) {
    return createEmptySchema();
  }

  try {
    const raw = localStorage.getItem(REALIZED_TRADES_STORAGE_KEY);

    if (!raw) {
      return createEmptySchema();
    }

    return normalizeSchema(JSON.parse(raw));
  } catch {
    return createEmptySchema();
  }
}

function writeSchema(schema: RealizedTradeStorageSchema): void {
  if (!isClient()) {
    return;
  }

  localStorage.setItem(
    REALIZED_TRADES_STORAGE_KEY,
    JSON.stringify({
      ...schema,
      schemaVersion: REALIZED_TRADES_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
    }),
  );
}

function sortByDateAsc(trades: RealizedTrade[]): RealizedTrade[] {
  return [...trades].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);

    if (byDate !== 0) {
      return byDate;
    }

    const byCreatedAt = a.createdAt.localeCompare(b.createdAt);

    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return a.ticker.localeCompare(b.ticker, "ko-KR", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function resolveCalculatedFields(input: RealizedTradeInput): {
  buyAmountInt: number;
  sellAmountInt: number;
  pnlInt: number;
  returnPct: number;
} {
  const qty = Math.max(Math.round(input.qty), 0);
  const buyPriceInt = Math.max(Math.round(input.buyPriceInt), 0);
  const sellPriceInt = Math.max(Math.round(input.sellPriceInt), 0);

  const buyAmountInt =
    typeof input.buyAmountInt === "number" && input.buyAmountInt >= 0
      ? Math.round(input.buyAmountInt)
      : qty * buyPriceInt;
  const sellAmountInt =
    typeof input.sellAmountInt === "number" && input.sellAmountInt >= 0
      ? Math.round(input.sellAmountInt)
      : qty * sellPriceInt;

  const pnlInt = sellAmountInt - buyAmountInt;
  const returnPct =
    typeof input.returnPct === "number" && Number.isFinite(input.returnPct)
      ? input.returnPct
      : buyAmountInt > 0
        ? (pnlInt / buyAmountInt) * 100
        : 0;

  return {
    buyAmountInt,
    sellAmountInt,
    pnlInt,
    returnPct,
  };
}

function realizedTradeDedupKey(trade: Pick<RealizedTrade, "date" | "ticker" | "buyAmountInt" | "sellAmountInt">): string {
  return [
    trade.date,
    trade.ticker.trim().toUpperCase(),
    trade.buyAmountInt,
    trade.sellAmountInt,
  ].join("|");
}

function buildFebruaryRealizedTrades(): RealizedTrade[] {
  return FEBRUARY_REAL_TRADES.map((trade, index) => ({
    ...trade,
    ticker: trade.ticker.trim().toUpperCase(),
    content: trade.content.trim(),
    id: createId(),
    createdAt: `${trade.date}T00:${`${index}`.padStart(2, "0")}:00.000Z`,
  }));
}

function normalizeCsvHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "")
    .replace(/[()]/g, "")
    .replace(/%/g, "pct")
    .replace(/\./g, "");
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let cursor = 0;

  while (cursor < text.length) {
    const char = text[cursor];

    if (char === '"') {
      if (inQuotes && text[cursor + 1] === '"') {
        cell += '"';
        cursor += 2;
        continue;
      }

      inQuotes = !inQuotes;
      cursor += 1;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      cursor += 1;
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      row.push(cell.trim());
      cell = "";

      if (row.some((entry) => entry !== "")) {
        rows.push(row);
      }

      row = [];

      if (char === "\r" && text[cursor + 1] === "\n") {
        cursor += 2;
      } else {
        cursor += 1;
      }

      continue;
    }

    cell += char;
    cursor += 1;
  }

  row.push(cell.trim());
  if (row.some((entry) => entry !== "")) {
    rows.push(row);
  }

  return rows;
}

function resolveCsvHeaders(headers: string[]): CsvHeaderMap | null {
  const normalized = headers.map(normalizeCsvHeader);
  const map: CsvHeaderMap = {};

  (Object.keys(CSV_HEADER_ALIASES) as CsvField[]).forEach((field) => {
    const aliases = CSV_HEADER_ALIASES[field].map(normalizeCsvHeader);
    let index = normalized.findIndex((header) => aliases.includes(header));

    if (index < 0 && field === "date") {
      index = normalized.findIndex(
        (header) =>
          header.endsWith("매매일") ||
          header.endsWith("거래일") ||
          header.includes("tradedate"),
      );
    }

    if (index >= 0) {
      map[field] = index;
    }
  });

  if (map.date === undefined || map.ticker === undefined) {
    return null;
  }

  return map;
}

function parseDateInput(raw: string): string | null {
  const normalized = raw
    .trim()
    .replace(/년/g, "-")
    .replace(/월/g, "-")
    .replace(/일/g, "")
    .replace(/[./]/g, "-")
    .replace(/\s+/g, "");

  if (!normalized) {
    return null;
  }

  const digitTokens = normalized.match(/\d+/g);

  if (digitTokens && digitTokens.length >= 3) {
    const [yearRaw, monthRaw, dayRaw] = digitTokens;

    if (yearRaw.length === 4) {
      return `${yearRaw}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}`;
    }

    if (yearRaw.length === 2) {
      return `20${yearRaw}-${monthRaw.padStart(2, "0")}-${dayRaw.padStart(2, "0")}`;
    }
  }

  const fullYearMatch = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (fullYearMatch) {
    const [, year, month, day] = fullYearMatch;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const shortYearMatch = normalized.match(/^(\d{2})-(\d{1,2})-(\d{1,2})$/);
  if (shortYearMatch) {
    const [, year, month, day] = shortYearMatch;
    return `20${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  return null;
}

function sanitizeNumberToken(raw: string): string {
  return raw
    .trim()
    .replace(/[\s,]/g, "")
    .replace(/[₩$]/g, "")
    .replace(/원|달러|usd|krw/gi, "")
    .replace(/%/g, "");
}

function parseNumberToken(raw: string): number | null {
  const cleaned = sanitizeNumberToken(raw);

  if (!cleaned) {
    return null;
  }

  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function parseAmountIntByMarket(raw: string, market: Market): number | null {
  const numeric = parseNumberToken(raw);

  if (numeric === null) {
    return null;
  }

  if (market === "US") {
    if (raw.includes(".")) {
      return Math.round(numeric * 100);
    }

    return Math.round(numeric);
  }

  return Math.round(numeric);
}

function parseQty(raw: string): number | null {
  const numeric = parseNumberToken(raw);

  if (numeric === null) {
    return null;
  }

  return Math.max(Math.round(numeric), 0);
}

function parseRatingInput(raw: string): TradeRating {
  const value = raw.trim().toLowerCase();

  if (!value) {
    return "";
  }

  if (value.includes("best") || value.includes("최")) {
    return "Best";
  }

  if (value.includes("good") || value.includes("좋")) {
    return "Good";
  }

  if (value.includes("normal") || value.includes("보통")) {
    return "Normal";
  }

  if (value.includes("bad") || value.includes("worst") || value.includes("나쁨")) {
    return "Bad";
  }

  return "";
}

function parseMarketInput(raw: string, ticker: string): Market {
  const value = raw.trim().toUpperCase();

  if (!value) {
    return inferMarket(ticker);
  }

  if (
    value.includes("KR") ||
    value.includes("KOSPI") ||
    value.includes("KOSDAQ") ||
    value.includes("KOREA") ||
    /국내|한국/.test(raw)
  ) {
    return "KR";
  }

  if (
    value.includes("US") ||
    value.includes("NASDAQ") ||
    value.includes("NYSE") ||
    value.includes("AMEX") ||
    /미국|해외/.test(raw)
  ) {
    return "US";
  }

  return inferMarket(ticker);
}

function getCell(row: string[], index: number | undefined): string {
  if (index === undefined || index < 0 || index >= row.length) {
    return "";
  }

  return row[index]?.trim() ?? "";
}

function parseCsvRowToTrade(
  row: string[],
  headers: CsvHeaderMap,
  rowIndex: number,
): RealizedTrade | null {
  const date = parseDateInput(getCell(row, headers.date));

  if (!date) {
    return null;
  }

  const ticker = getCell(row, headers.ticker).toUpperCase();

  if (!ticker) {
    return null;
  }

  const market = parseMarketInput(getCell(row, headers.market), ticker);

  let qty = parseQty(getCell(row, headers.qty));
  let buyPriceInt = parseAmountIntByMarket(getCell(row, headers.buyPrice), market);
  let buyAmountInt = parseAmountIntByMarket(getCell(row, headers.buyAmount), market);
  let sellPriceInt = parseAmountIntByMarket(getCell(row, headers.sellPrice), market);
  let sellAmountInt = parseAmountIntByMarket(getCell(row, headers.sellAmount), market);

  if (qty === null) {
    if (buyPriceInt && buyAmountInt) {
      qty = Math.max(Math.round(buyAmountInt / buyPriceInt), 1);
    } else if (sellPriceInt && sellAmountInt) {
      qty = Math.max(Math.round(sellAmountInt / sellPriceInt), 1);
    } else {
      qty = 1;
    }
  }

  if (buyAmountInt === null && buyPriceInt !== null) {
    buyAmountInt = qty * buyPriceInt;
  }

  if (sellAmountInt === null && sellPriceInt !== null) {
    sellAmountInt = qty * sellPriceInt;
  }

  if (buyPriceInt === null && buyAmountInt !== null && qty > 0) {
    buyPriceInt = Math.round(buyAmountInt / qty);
  }

  if (sellPriceInt === null && sellAmountInt !== null && qty > 0) {
    sellPriceInt = Math.round(sellAmountInt / qty);
  }

  if (
    buyPriceInt === null ||
    buyAmountInt === null ||
    sellPriceInt === null ||
    sellAmountInt === null
  ) {
    return null;
  }

  const pnlFromCsv = parseAmountIntByMarket(getCell(row, headers.pnlInt), market);
  const pnlInt = pnlFromCsv ?? sellAmountInt - buyAmountInt;

  const returnPctFromCsv = parseNumberToken(getCell(row, headers.returnPct));
  const returnPct =
    returnPctFromCsv ??
    (buyAmountInt > 0 ? (pnlInt / buyAmountInt) * 100 : 0);

  return {
    id: createId(),
    date,
    market,
    ticker,
    qty,
    buyPriceInt,
    buyAmountInt,
    sellPriceInt,
    sellAmountInt,
    returnPct,
    pnlInt,
    content: getCell(row, headers.content),
    rating: parseRatingInput(getCell(row, headers.rating)),
    createdAt: `${date}T00:${`${rowIndex % 60}`.padStart(2, "0")}:00.000Z`,
  };
}

function shouldCountAsFailedCsvRow(row: string[], headers: CsvHeaderMap): boolean {
  const dateCell = getCell(row, headers.date);
  const parsedDate = parseDateInput(dateCell);

  if (!parsedDate) {
    return false;
  }

  const tickerCell = getCell(row, headers.ticker);
  return tickerCell.trim().length > 0;
}

function buildDailyNetMap(
  trades: RealizedTrade[],
  options?: RealizedTradeSummaryOptions,
): Map<string, number> {
  const fxRate = options?.fxRate ?? DEFAULT_FX_RATE;
  const includeUsd = options?.includeUsd ?? true;
  const bucket = new Map<string, number>();

  trades.forEach((trade) => {
    if (!includeUsd && trade.market === "US") {
      return;
    }

    const convertedPnl = getPnlKrw(trade, fxRate);
    bucket.set(trade.date, (bucket.get(trade.date) ?? 0) + convertedPnl);
  });

  return bucket;
}

export function resolveTradeCurrency(market: Market): Currency {
  return market === "US" ? "USD" : "KRW";
}

function convertPnlIntByMarket(
  pnlInt: number,
  market: Market,
  fxRate: number,
): number {
  if (market === "US") {
    return usdToKrw(usdCentsToUsdFloat(pnlInt), fxRate);
  }

  return pnlInt;
}

export function getPnlKrw(
  trade: Pick<RealizedTrade, "market" | "pnlInt">,
  fxRate: number,
): number {
  return convertPnlIntByMarket(trade.pnlInt, trade.market, fxRate);
}

export function convertTradeAmountToKrw(
  amountInt: number,
  market: Market,
  fxRate: number,
): number {
  return convertPnlIntByMarket(amountInt, market, fxRate);
}

export function listRealizedTrades(): RealizedTrade[] {
  return sortByDateAsc(readSchema().trades);
}

export function addRealizedTrade(input: RealizedTradeInput): RealizedTrade[] {
  const calculated = resolveCalculatedFields(input);
  const next: RealizedTrade = {
    id: createId(),
    date: input.date,
    market: input.market,
    ticker: input.ticker.trim().toUpperCase(),
    qty: Math.max(Math.round(input.qty), 0),
    buyPriceInt: Math.max(Math.round(input.buyPriceInt), 0),
    buyAmountInt: calculated.buyAmountInt,
    sellPriceInt: Math.max(Math.round(input.sellPriceInt), 0),
    sellAmountInt: calculated.sellAmountInt,
    returnPct: calculated.returnPct,
    pnlInt: calculated.pnlInt,
    content: input.content.trim(),
    rating: input.rating,
    createdAt: new Date().toISOString(),
  };

  const updated = sortByDateAsc([next, ...listRealizedTrades()]);
  writeSchema({ ...readSchema(), trades: updated });

  return updated;
}

export function updateRealizedTrade(
  id: string,
  input: RealizedTradeInput,
): RealizedTrade[] {
  const calculated = resolveCalculatedFields(input);
  const updated = sortByDateAsc(
    listRealizedTrades().map((trade) => {
      if (trade.id !== id) {
        return trade;
      }

      return {
        ...trade,
        date: input.date,
        market: input.market,
        ticker: input.ticker.trim().toUpperCase(),
        qty: Math.max(Math.round(input.qty), 0),
        buyPriceInt: Math.max(Math.round(input.buyPriceInt), 0),
        buyAmountInt: calculated.buyAmountInt,
        sellPriceInt: Math.max(Math.round(input.sellPriceInt), 0),
        sellAmountInt: calculated.sellAmountInt,
        returnPct: calculated.returnPct,
        pnlInt: calculated.pnlInt,
        content: input.content.trim(),
        rating: input.rating,
      };
    }),
  );

  writeSchema({ ...readSchema(), trades: updated });
  return updated;
}

export function deleteRealizedTrade(id: string): RealizedTrade[] {
  const updated = sortByDateAsc(listRealizedTrades().filter((trade) => trade.id !== id));
  writeSchema({ ...readSchema(), trades: updated });

  return updated;
}

export function replaceRealizedTrades(trades: RealizedTrade[]): RealizedTrade[] {
  const normalized = trades
    .map((trade, index) => normalizeTrade(trade, index))
    .filter((trade): trade is RealizedTrade => Boolean(trade));
  const updated = sortByDateAsc(normalized);
  writeSchema({ ...readSchema(), trades: updated });

  return updated;
}

export function seedFebruaryRealizedTrades(options?: {
  overwrite?: boolean;
}): RealizedTrade[] {
  const sourceTrades = buildFebruaryRealizedTrades();
  const expectedNet = sourceTrades.reduce((sum, trade) => sum + trade.pnlInt, 0);

  if (expectedNet !== FEBRUARY_REAL_TRADES_NET_PNL) {
    throw new Error(
      `Unexpected february net pnl: ${expectedNet} (expected ${FEBRUARY_REAL_TRADES_NET_PNL})`,
    );
  }

  if (options?.overwrite) {
    return replaceRealizedTrades(sourceTrades);
  }

  const existing = listRealizedTrades();
  const existingKeys = new Set(existing.map((trade) => realizedTradeDedupKey(trade)));
  const merged = [...existing];

  sourceTrades.forEach((trade) => {
    const key = realizedTradeDedupKey(trade);

    if (existingKeys.has(key)) {
      return;
    }

    merged.push(trade);
    existingKeys.add(key);
  });

  return replaceRealizedTrades(merged);
}

export function importRealizedTradesFromCsv(csvText: string): CsvImportResult {
  const rows = parseCsv(csvText);
  const existing = listRealizedTrades();

  if (rows.length === 0) {
    return {
      trades: existing,
      inserted: 0,
      skipped: 0,
      failed: 0,
      totalRows: 0,
    };
  }

  let activeHeaders: CsvHeaderMap | null = null;
  let headerDetected = false;

  const existingKeys = new Set(existing.map((trade) => realizedTradeDedupKey(trade)));
  const insertedTrades: RealizedTrade[] = [];
  let skipped = 0;
  let failed = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];

    if (row.every((cell) => cell.trim() === "")) {
      continue;
    }

    const detectedHeaders = resolveCsvHeaders(row);

    if (detectedHeaders) {
      activeHeaders = detectedHeaders;
      headerDetected = true;
      continue;
    }

    if (!activeHeaders) {
      continue;
    }

    const trade = parseCsvRowToTrade(row, activeHeaders, rowIndex + 1);

    if (!trade) {
      if (shouldCountAsFailedCsvRow(row, activeHeaders)) {
        failed += 1;
      }
      continue;
    }

    const dedupeKey = realizedTradeDedupKey(trade);

    if (existingKeys.has(dedupeKey)) {
      skipped += 1;
      continue;
    }

    existingKeys.add(dedupeKey);
    insertedTrades.push(trade);
  }

  if (!headerDetected) {
    throw new Error("CSV 헤더에 date(매매일)와 ticker(종목) 컬럼이 필요합니다.");
  }

  const nextTrades =
    insertedTrades.length > 0
      ? replaceRealizedTrades([...existing, ...insertedTrades])
      : existing;

  return {
    trades: nextTrades,
    inserted: insertedTrades.length,
    skipped,
    failed,
    totalRows: Math.max(rows.length - 1, 0),
  };
}

export function filterRealizedTrades(
  trades: RealizedTrade[],
  filter: RealizedTradeFilter,
): RealizedTrade[] {
  const keyword = filter.search?.trim().toLowerCase() ?? "";

  return trades.filter((trade) => {
    if (filter.dateRange && !isDateInRange(trade.date, filter.dateRange)) {
      return false;
    }

    if (filter.market && filter.market !== "ALL" && trade.market !== filter.market) {
      return false;
    }

    if (filter.rating && filter.rating !== "ALL" && trade.rating !== filter.rating) {
      return false;
    }

    if (!keyword) {
      return true;
    }

    return (
      trade.ticker.toLowerCase().includes(keyword) ||
      trade.content.toLowerCase().includes(keyword)
    );
  });
}

export function summarizeRealizedTrades(
  trades: RealizedTrade[],
  options?: RealizedTradeSummaryOptions,
): RealizedTradeSummary {
  const fxRate = options?.fxRate ?? DEFAULT_FX_RATE;
  const includeUsd = options?.includeUsd ?? true;
  const targetTrades = includeUsd
    ? trades
    : trades.filter((trade) => trade.market === "KR");

  const totalCount = targetTrades.length;
  const winCount = targetTrades.filter((trade) => trade.pnlInt > 0).length;
  const netPnlInt = targetTrades.reduce(
    (sum, trade) => sum + getPnlKrw(trade, fxRate),
    0,
  );
  const winRate = totalCount === 0 ? 0 : (winCount / totalCount) * 100;

  return {
    totalCount,
    winCount,
    netPnlInt,
    winRate,
  };
}

export function buildDailyNetSeries(
  trades: RealizedTrade[],
  options?: NetSeriesOptions,
): DailyNetPoint[] {
  const bucket = buildDailyNetMap(trades, options);

  if (options?.tradingDays && options.tradingDays.length > 0) {
    const mergedDates = [...new Set([...options.tradingDays, ...bucket.keys()])].sort(
      (a, b) => a.localeCompare(b),
    );

    return mergedDates.map((date) => ({
      date,
      netPnlInt: bucket.has(date) ? (bucket.get(date) ?? 0) : null,
    }));
  }

  return [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, netPnlInt]) => ({ date, netPnlInt }));
}

export function buildMonthlyNetSeries(
  trades: RealizedTrade[],
  options?: RealizedTradeSummaryOptions,
): MonthlyNetPoint[] {
  const fxRate = options?.fxRate ?? DEFAULT_FX_RATE;
  const includeUsd = options?.includeUsd ?? true;
  const bucket = new Map<string, number>();

  trades.forEach((trade) => {
    if (!includeUsd && trade.market === "US") {
      return;
    }

    const month = trade.date.slice(0, 7);
    const convertedPnl = getPnlKrw(trade, fxRate);
    bucket.set(month, (bucket.get(month) ?? 0) + convertedPnl);
  });

  return [...bucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, netPnlInt]) => ({ month, netPnlInt }));
}

export function buildMonthlyNetSeriesByYear(
  trades: RealizedTrade[],
  year: number,
  options?: RealizedTradeSummaryOptions,
): MonthlyNetPoint[] {
  const fxRate = options?.fxRate ?? DEFAULT_FX_RATE;
  const includeUsd = options?.includeUsd ?? true;
  const safeYear = Number.isFinite(year) ? Math.trunc(year) : new Date().getFullYear();
  const yearPrefix = `${safeYear}-`;
  const bucket = new Map<string, number>();

  for (let month = 1; month <= 12; month += 1) {
    const monthKey = `${safeYear}-${`${month}`.padStart(2, "0")}`;
    bucket.set(monthKey, 0);
  }

  trades.forEach((trade) => {
    if (!includeUsd && trade.market === "US") {
      return;
    }

    if (!trade.date.startsWith(yearPrefix)) {
      return;
    }

    const monthKey = trade.date.slice(0, 7);

    if (!bucket.has(monthKey)) {
      return;
    }

    const convertedPnl = getPnlKrw(trade, fxRate);
    bucket.set(monthKey, (bucket.get(monthKey) ?? 0) + convertedPnl);
  });

  return [...bucket.entries()].map(([month, netPnlInt]) => ({ month, netPnlInt }));
}

export const realizedTradesStorageMeta = {
  key: REALIZED_TRADES_STORAGE_KEY,
  schemaVersion: REALIZED_TRADES_SCHEMA_VERSION,
};

export const realizedTradesFebruaryMeta = {
  expectedNetPnlInt: FEBRUARY_REAL_TRADES_NET_PNL,
  size: FEBRUARY_REAL_TRADES.length,
};
