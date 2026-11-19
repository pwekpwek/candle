import type { LocalDate } from "./contract";

const MS_PER_DAY = 86_400_000;
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The device's local calendar date, from local date parts (never toISOString). */
export function todayLocal(now: Date = new Date()): LocalDate {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isLocalDate(value: string): boolean {
  const match = PATTERN.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function toUtcMs(date: LocalDate): number {
  if (!isLocalDate(date)) throw new RangeError(`Not a YYYY-MM-DD date: ${date}`);
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

/** `date` plus `days` (may be negative). Throws RangeError for a date that is not a LocalDate. */
export function addDays(date: LocalDate, days: number): LocalDate {
  const ms = toUtcMs(date) + days * MS_PER_DAY;
  const out = new Date(ms);
  if (Number.isNaN(out.getTime())) throw new RangeError(`Cannot add ${days} days to ${date}`);
  const y = String(out.getUTCFullYear()).padStart(4, "0");
  const m = String(out.getUTCMonth() + 1).padStart(2, "0");
  const d = String(out.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `to` minus `from` in whole days. */
export function daysBetween(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}
