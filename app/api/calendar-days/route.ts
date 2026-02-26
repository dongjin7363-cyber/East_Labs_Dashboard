import Holidays from "date-holidays";
import { NextResponse } from "next/server";
import { getKrHolidayOverride } from "@/lib/utils/krHolidayOverrides";

interface CalendarDayItem {
  date: string;
  dow: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}

interface YmdParts {
  year: number;
  month: number;
  day: number;
}

function parseYmd(value: string): YmdParts | null {
  const matched = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!matched) {
    return null;
  }

  const year = Number.parseInt(matched[1], 10);
  const month = Number.parseInt(matched[2], 10);
  const day = Number.parseInt(matched[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function toUtcDate(parts: YmdParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function toYmdFromUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function toKstDate(dateYmd: string): Date {
  return new Date(`${dateYmd}T00:00:00+09:00`);
}

function parseHolidayResult(
  holidayInfo: unknown,
): { isHoliday: boolean; holidayName: string | null } {
  if (!holidayInfo) {
    return { isHoliday: false, holidayName: null };
  }

  if (Array.isArray(holidayInfo)) {
    if (holidayInfo.length === 0) {
      return { isHoliday: false, holidayName: null };
    }

    const name =
      typeof holidayInfo[0] === "object" && holidayInfo[0] !== null && "name" in holidayInfo[0]
        ? String((holidayInfo[0] as { name?: unknown }).name ?? "")
        : "";

    return {
      isHoliday: true,
      holidayName: name || null,
    };
  }

  if (typeof holidayInfo === "object") {
    const name =
      holidayInfo !== null && "name" in holidayInfo
        ? String((holidayInfo as { name?: unknown }).name ?? "")
        : "";

    return {
      isHoliday: true,
      holidayName: name || null,
    };
  }

  return { isHoliday: false, holidayName: null };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const country = (searchParams.get("country") ?? "KR").toUpperCase();

  const fromParts = parseYmd(from);
  const toParts = parseYmd(to);

  if (!fromParts || !toParts) {
    return NextResponse.json(
      { message: "Invalid from/to date. Use YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const fromDate = toUtcDate(fromParts);
  const toDate = toUtcDate(toParts);

  if (fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json(
      { message: "from must be less than or equal to to." },
      { status: 400 },
    );
  }

  const hd = new Holidays(country);
  const days: CalendarDayItem[] = [];

  for (
    let time = fromDate.getTime();
    time <= toDate.getTime();
    time += 24 * 60 * 60 * 1000
  ) {
    const utcDate = new Date(time);
    const date = toYmdFromUtc(utcDate);
    const dow = utcDate.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;

    const holidayInfo = hd.isHoliday(toKstDate(date));
    const parsedHoliday = parseHolidayResult(holidayInfo);
    const override = country === "KR" ? getKrHolidayOverride(date) : undefined;

    const isHoliday = override ? override.isHoliday : parsedHoliday.isHoliday;
    const holidayName = override
      ? override.holidayName
      : parsedHoliday.holidayName;

    days.push({
      date,
      dow,
      isWeekend,
      isHoliday,
      holidayName,
    });
  }

  return NextResponse.json(
    {
      country,
      from,
      to,
      days,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    },
  );
}
