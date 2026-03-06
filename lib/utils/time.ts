export function formatKST(isoString?: string): string {
  if (!isoString || typeof isoString !== "string") {
    return "-";
  }

  const date = new Date(isoString);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return formatter.format(date).replace("T", " ");
}
