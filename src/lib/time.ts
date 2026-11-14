/**
 * Time display helpers (T03). Pure functions: the caller passes `now`, so
 * nothing here reads the clock and every case is testable. Stored timestamps
 * are ISO 8601 strings (DATA-06); a Date or epoch milliseconds also work.
 */

export type TimeInput = string | number | Date;

export interface TimeOptions {
  /** IANA zone for calendar dates. Defaults to the device's zone. */
  timeZone?: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Relative times switch to a calendar date after this many days. */
const RELATIVE_LIMIT_DAYS = 7;

function toMs(value: TimeInput): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return Date.parse(value);
}

function dateParts(ms: number, timeZone?: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).formatToParts(new Date(ms));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { month: get("month"), day: get("day"), year: Number(get("year")) };
}

/**
 * "Nov 12" for a date in the current year, "Nov 12, 2025" for any other year.
 * "Current year" is the year of `now` in the same time zone.
 * Returns an empty string for an unreadable timestamp.
 */
export function formatAbsoluteDate(
  then: TimeInput,
  now: TimeInput,
  options: TimeOptions = {},
): string {
  const thenMs = toMs(then);
  const nowMs = toMs(now);
  if (Number.isNaN(thenMs) || Number.isNaN(nowMs)) return "";
  const t = dateParts(thenMs, options.timeZone);
  const n = dateParts(nowMs, options.timeZone);
  const base = `${t.month} ${t.day}`;
  return t.year === n.year ? base : `${base}, ${t.year}`;
}

/**
 * "just now", "5m ago", "2h ago", "3d ago". From seven days on it falls back
 * to the absolute date ("Nov 12", with the year when it is not this year).
 * A time slightly in the future (clock drift) reads "just now".
 * Returns an empty string for an unreadable timestamp.
 */
export function formatRelativeTime(
  then: TimeInput,
  now: TimeInput,
  options: TimeOptions = {},
): string {
  const thenMs = toMs(then);
  const nowMs = toMs(now);
  if (Number.isNaN(thenMs) || Number.isNaN(nowMs)) return "";
  const elapsed = nowMs - thenMs;
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  const days = Math.floor(elapsed / DAY);
  if (days < RELATIVE_LIMIT_DAYS) return `${days}d ago`;
  return formatAbsoluteDate(thenMs, nowMs, options);
}
