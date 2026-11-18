import { MESSAGES } from "@/lib/messages";
import type { Batch, FormulaVersion } from "@/lib/types";

const B = MESSAGES.batches;

/** "Batch 3F2A91C0": the label when there is one, else the first 8 characters of the id. */
export function batchTitle(batch: Pick<Batch, "id" | "label">): string {
  const label = batch.label?.trim();
  return label ? label : B.defaultTitle(batch.id.slice(0, 8).toUpperCase());
}

/** The device's local today as YYYY-MM-DD, from local date parts (never toISOString). */
export function localToday(now: Date = new Date()): string {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** True for a real calendar date written YYYY-MM-DD. */
export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** "Nov 18, 2026" for a stored YYYY-MM-DD. The calendar date is shown as written, in any time zone. */
export function formatProducedOn(value: string): string {
  if (!isRealDate(value)) return value;
  const [y, m, d] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "3 of 4 weighed" or "Not weighed yet". */
export function weighedStatus(batch: Batch, version: FormulaVersion): string {
  const total = version.inputs.waxes.length + version.inputs.oils.length;
  const weighed = batch.entries.length;
  return weighed === 0 ? B.notWeighed : B.weighedStatus(weighed, total);
}

export function versionHref(formulaId: string, versionId: string): string {
  return `/formulas/${formulaId}/versions/${versionId}`;
}
