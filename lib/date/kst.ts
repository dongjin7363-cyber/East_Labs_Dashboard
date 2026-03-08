const KST_TIME_ZONE = "Asia/Seoul";

function getKstParts(date: Date): Record<string, string> {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TIME_ZONE,
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

export function toKSTDateString(date: Date): string {
  const parts = getKstParts(date);
  const year = parts.year ?? "1970";
  const month = parts.month ?? "01";
  const day = parts.day ?? "01";

  return `${year}-${month}-${day}`;
}

export function getTodayKST(): string {
  return toKSTDateString(new Date());
}

export function getCurrentMonthKST(): string {
  const parts = getKstParts(new Date());
  const year = parts.year ?? "1970";
  const month = parts.month ?? "01";

  return `${year}-${month}`;
}

export function getCurrentKstHour(): number {
  const parts = getKstParts(new Date());
  const parsed = Number.parseInt(parts.hour ?? "", 10);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return parsed;
}

export function formatDateKST(value?: string | Date): string {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace("T", " ");
}

