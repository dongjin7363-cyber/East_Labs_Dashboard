import { DatePreset, DateRange } from "@/lib/models/types";

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

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function toYm(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");

  return `${year}-${month}`;
}

export function getMonthStartEnd(monthKey: string): DateRange {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return getMonthStartEnd(toYm(new Date()));
  }

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return getMonthStartEnd(toYm(new Date()));
  }

  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);

  return {
    from: toYmd(start),
    to: toYmd(end),
  };
}

export function getMonthDays(monthKey: string): string[] {
  const range = getMonthStartEnd(monthKey);
  return getDatesInRange(range.from, range.to);
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

export function formatWeekRangeCompact(from: string, to: string): string {
  const [fromYear, fromMonth] = from.split("-");
  const [toYear, toMonth, toDay] = to.split("-");

  if (fromYear === toYear && fromMonth === toMonth) {
    return `${from} ~ ${toDay}`;
  }

  if (fromYear === toYear) {
    return `${from} ~ ${to}`;
  }

  return `${from} ~ ${to}`;
}

export function isSameDate(a?: string, b?: string): boolean {
  return Boolean(a) && Boolean(b) && a === b;
}

export function getDayOfWeekKST(dateYmd: string): number {
  const matched = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!matched) {
    return 0;
  }

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  return utcDate.getUTCDay();
}

export function isWeekend(value: string | number): boolean {
  const day = typeof value === "number" ? value : getDayOfWeekKST(value);
  return day === 0 || day === 6;
}

export function resolveDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): DateRange {
  const now = new Date();

  if (preset === "THIS_MONTH") {
    return getMonthStartEnd(toYm(now));
  }

  if (preset === "LAST_MONTH") {
    return getMonthStartEnd(toYm(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
  }

  return {
    from: customFrom ?? toYmd(now),
    to: customTo ?? toYmd(now),
  };
}

export function isDateInRange(value: string, range: DateRange): boolean {
  const target = toDate(value).getTime();
  const from = toDate(range.from).getTime();
  const to = toDate(range.to).getTime();

  return target >= from && target <= to;
}

