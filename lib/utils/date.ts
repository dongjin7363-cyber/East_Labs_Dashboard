import { DateRange, DatePreset } from "@/lib/models/types";
import {
  getDatesInRange as getCalendarDatesInRange,
  getMonthDays,
  getMonthStartEnd,
  getWeekRangeSundayStart as getCalendarWeekRangeSundayStart,
  isDateInRange as isCalendarDateInRange,
  resolveDateRange as resolveCalendarDateRange,
  toYm,
  toYmd,
} from "@/lib/date/calendar";
import {
  getCurrentKstHour,
  getTodayKST,
} from "@/lib/date/kst";

export { toYmd, toYm } from "@/lib/date/calendar";

export function todayYmd(): string {
  return toYmd(new Date());
}

export function todayKstYmd(): string {
  return getTodayKST();
}

export function currentKstHour(): number {
  return getCurrentKstHour();
}

export function getMonthRange(baseDate: Date): DateRange {
  return getMonthStartEnd(toYm(baseDate));
}

export function getMonthRangeFromYm(ym: string): DateRange {
  return getMonthStartEnd(ym);
}

export function getDatesInMonthFromYm(ym: string): string[] {
  return getMonthDays(ym);
}

export function getDatesInRange(from: string, to: string): string[] {
  return getCalendarDatesInRange(from, to);
}

export function getWeekRangeSundayStart(dateYmd: string): DateRange {
  return getCalendarWeekRangeSundayStart(dateYmd);
}

export function resolveDateRange(
  preset: DatePreset,
  customFrom?: string,
  customTo?: string,
): DateRange {
  return resolveCalendarDateRange(preset, customFrom, customTo);
}

export function isDateInRange(value: string, range: DateRange): boolean {
  return isCalendarDateInRange(value, range);
}
