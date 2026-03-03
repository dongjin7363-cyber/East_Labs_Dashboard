const KST_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatKST(isoString: string): string {
  if (!isoString) {
    return "-";
  }

  const parsed = new Date(isoString);

  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  const parts = KST_DATE_TIME_FORMATTER.formatToParts(parsed);
  const map = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value;
    }

    return acc;
  }, {});

  const year = map.year ?? "0000";
  const month = map.month ?? "00";
  const day = map.day ?? "00";
  const hour = map.hour ?? "00";
  const minute = map.minute ?? "00";

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

