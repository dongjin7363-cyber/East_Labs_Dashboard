import { DatePreset, DateRange } from "@/lib/models/types";

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function parseYmd(value: string): Date | null {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function getKstParts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter
    .formatToParts(date)
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") {
        acc[part.type] = part.value;
      }

      return acc;
    }, {});
}

export function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function todayYmd(): string {
  return toYmd(new Date());
}

export function todayKstYmd(): string {
  const parts = getKstParts(new Date());
  const year = parts.year ?? "1970";
  const month = parts.month ?? "01";
  const day = parts.day ?? "01";

  return `${year}-${month}-${day}`;
}

export function currentKstHour(): number {
  const parts = getKstParts(new Date());
  const parsed = Number.parseInt(parts.hour ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

export function toYm(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  return `${year}-${month}`;
}

export function getMonthRange(baseDate: Date): DateRange {
  const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const end = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  return {
    from: toYmd(start),
    to: toYmd(end),
  };
}

export function getMonthRangeFromYm(ym: string): DateRange {
  const match = ym.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return getMonthRange(new Date());
  }

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return getMonthRange(new Date());
  }

  return getMonthRange(new Date(year, monthIndex, 1));
}

export function getDatesInMonthFromYm(ym: string): string[] {
  const range = getMonthRangeFromYm(ym);
  const start = toDate(range.from);
  const end = toDate(range.to);
  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getDatesInRange(from: string, to: string): string[] {
  const start = parseYmd(from);
  const end = parseYmd(to);

  if (!start || !end || start.getTime() > end.getTime()) {
    return [];
  }

  const dates: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(toYmd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function getWeekRangeSundayStart(dateYmd: string): DateRange {
  const baseDate = parseYmd(dateYmd) ?? new Date();
  const start = new Date(baseDate);
  start.setDate(baseDate.getDate() - baseDate.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    from: toYmd(start),
    to: toYmd(end),
  };
}

export function resolveDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const now = new Date();

  if (preset === "THIS_MONTH") {
    return getMonthRange(now);
  }

  if (preset === "LAST_MONTH") {
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return getMonthRange(lastMonth);
  }

  return {
    from: customFrom ?? todayYmd(),
    to: customTo ?? todayYmd(),
  };
}

export function isDateInRange(value: string, range: DateRange): boolean {
  const target = toDate(value).getTime();
  const from = toDate(range.from).getTime();
  const to = toDate(range.to).getTime();

  return target >= from && target <= to;
}
