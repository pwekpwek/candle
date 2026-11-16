import { formatAbsoluteDate } from "@/lib/time";

/** "Nov 14, 13:40" (the date part follows `formatAbsoluteDate`, so another year adds the year). */
export function formatDraftTime(updatedAt: string, now: Date = new Date()): string {
  const ms = Date.parse(updatedAt);
  if (Number.isNaN(ms)) return "";
  const date = formatAbsoluteDate(ms, now);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(ms));
  return `${date}, ${time}`;
}
