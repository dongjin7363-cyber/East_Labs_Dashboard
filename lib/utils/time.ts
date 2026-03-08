import { formatDateKST } from "@/lib/date/kst";

export function formatKST(isoString?: string): string {
  return formatDateKST(isoString);
}
