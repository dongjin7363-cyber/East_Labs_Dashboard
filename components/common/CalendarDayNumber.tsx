interface CalendarDayNumberProps {
  value: string | number;
  isToday?: boolean;
  tone?: "default" | "red" | "blue";
}

export function CalendarDayNumber({
  value,
  isToday = false,
  tone = "default",
}: CalendarDayNumberProps) {
  const toneClass = tone === "red" ? "is-red" : tone === "blue" ? "is-blue" : "";

  return (
    <span className={`calendar-day-number ${toneClass} ${isToday ? "is-today" : ""}`.trim()}>
      {value}
    </span>
  );
}

export default CalendarDayNumber;
