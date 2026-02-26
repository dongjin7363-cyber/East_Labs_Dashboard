import Holidays from "date-holidays";
import { NextResponse } from "next/server";

function toYmd(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const country = (searchParams.get("country") ?? "KR").toUpperCase();

  const fromDate = parseYmd(from);
  const toDate = parseYmd(to);

  if (!fromDate || !toDate || fromDate.getTime() > toDate.getTime()) {
    return NextResponse.json(
      { message: "Invalid from/to date. Use YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const holidays = new Holidays(country);
  const days: string[] = [];
  const holidayDays: string[] = [];

  const cursor = new Date(fromDate);
  while (cursor.getTime() <= toDate.getTime()) {
    const ymd = toYmd(cursor);
    const holidayInfo = holidays.isHoliday(cursor);

    if (holidayInfo) {
      holidayDays.push(ymd);
    }

    if (!isWeekend(cursor) && !holidayInfo) {
      days.push(toYmd(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return NextResponse.json(
    {
      country,
      from,
      to,
      days,
      holidayDays,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
      },
    },
  );
}
