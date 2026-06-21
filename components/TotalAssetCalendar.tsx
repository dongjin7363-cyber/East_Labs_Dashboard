"use client";

import { useMemo } from "react";
import { TotalAssetSnapshot } from "@/lib/models/types";
import { getDatesInMonthFromYm, getMonthRangeFromYm } from "@/lib/utils/date";
import { moneyFormat } from "@/lib/utils/money";

interface CalendarDayInfo {
  dow: number;
  isHoliday: boolean;
  holidayName?: string;
}

interface TotalAssetCalendarProps {
  month: string;
  selectedDate: string;
  today: string;
  snapshots: TotalAssetSnapshot[];
  calendarMap: Record<string, CalendarDayInfo>;
  onSelectDate: (date: string) => void;
}

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

const SYM = <span style={{ fontSize: "0.5em", opacity: 0.45 }}>₩</span>;

function CompactKrw({ amount }: { amount: number }) {
  if (!Number.isFinite(amount) || amount === 0) return <>{SYM}0</>;
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);

  if (abs >= 100_000_000) {
    return <>{sign}{SYM}{(abs / 100_000_000).toFixed(2)}억</>;
  }
  if (abs >= 10_000) {
    return <>{sign}{SYM}{Math.round(abs / 10_000).toLocaleString("ko-KR")}만</>;
  }
  return <>{sign}{SYM}{abs.toLocaleString("ko-KR")}</>;
}

export function TotalAssetCalendar({
  month,
  selectedDate,
  today,
  snapshots,
  calendarMap,
  onSelectDate,
}: TotalAssetCalendarProps) {
  const monthRange = useMemo(() => getMonthRangeFromYm(month), [month]);
  const dates = useMemo(() => getDatesInMonthFromYm(month), [month]);

  const monthLabel = useMemo(() => {
    const [year, monthNum] = monthRange.from.split("-");

    return `${year}년 ${Number.parseInt(monthNum, 10)}월`;
  }, [monthRange.from]);

  const leadingBlankCount = useMemo(() => {
    const firstDayInfo = calendarMap[monthRange.from];

    if (firstDayInfo) {
      return firstDayInfo.dow;
    }

    const matched = monthRange.from.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (!matched) {
      return 0;
    }

    const year = Number.parseInt(matched[1], 10);
    const monthNum = Number.parseInt(matched[2], 10);
    const day = Number.parseInt(matched[3], 10);
    const utcDate = new Date(Date.UTC(year, monthNum - 1, day));

    return utcDate.getUTCDay();
  }, [calendarMap, monthRange.from]);

  const snapshotByDate = useMemo(
    () => new Map(snapshots.map((snapshot) => [snapshot.date, snapshot])),
    [snapshots],
  );

  return (
    <section className="ta-calendar-wrap">
      <div className="ta-calendar-caption">{monthLabel}</div>

      <div className="ta-calendar-grid ta-calendar-weekdays">
        {WEEKDAY_LABELS.map((label, index) => (
          <div
            key={label}
            className={`ta-calendar-weekday ${
              index === 0 ? "is-red" : index === 6 ? "is-blue" : ""
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      <div className="ta-calendar-grid ta-calendar-days">
        {Array.from({ length: leadingBlankCount }).map((_, index) => (
          <div key={`blank-${index}`} className="ta-calendar-day blank" />
        ))}

        {dates.map((date) => {
          const snapshot = snapshotByDate.get(date);
          const dayInfo = calendarMap[date];
          const day = Number.parseInt(date.slice(8, 10), 10);
          const isSelected = date === selectedDate;
          const isToday = date === today;
          const isRed = Boolean(dayInfo?.isHoliday || dayInfo?.dow === 0);
          const isBlue = !isRed && dayInfo?.dow === 6;

          return (
            <button
              key={date}
              type="button"
              className={`ta-calendar-day ${isSelected ? "selected" : ""} ${
                snapshot ? "has-snapshot" : ""
              } ${isToday ? "is-today" : ""}`}
              onClick={() => onSelectDate(date)}
            >
              <span className={`ta-day-number ${isRed ? "is-red" : isBlue ? "is-blue" : ""}`}>
                {day}
              </span>
              {snapshot ? (
                <span
                  className="ta-day-amount"
                  title={
                    dayInfo?.holidayName
                      ? `${moneyFormat("KRW", snapshot.totalAssetKrwInt)} (${dayInfo.holidayName})`
                      : moneyFormat("KRW", snapshot.totalAssetKrwInt)
                  }
                >
                  <CompactKrw amount={snapshot.totalAssetKrwInt} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}
