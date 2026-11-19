import { formatProducedOn } from "@/components/batches/text";
import { MESSAGES } from "@/lib/messages";
import type { ComparisonMetric } from "@/lib/burnmatrix";
import type { Batch, BurnSession, SootLevel } from "@/lib/types";

const M = MESSAGES.burnCompare;

/** The most sessions a comparison holds. */
export const MAX_COMPARE = 4;

/** The session label, else "Burn test on Nov 18, 2026". */
export function sessionTitle(session: Pick<BurnSession, "label" | "testedOn">): string {
  const label = session.label?.trim();
  return label ? label : M.sessionFallbackTitle(formatProducedOn(session.testedOn));
}

/** The batch label, else "Batch 3F2A91C0". */
export function batchName(batch: Pick<Batch, "id" | "label">): string {
  const label = batch.label?.trim();
  return label ? label : M.batchFallbackTitle(batch.id.slice(0, 8).toUpperCase());
}

const SOOT_NAMES: Record<SootLevel, string> = {
  none: M.sootNone,
  light: M.sootLight,
  moderate: M.sootModerate,
  heavy: M.sootHeavy,
};

export function sootName(level: SootLevel): string {
  return SOOT_NAMES[level];
}

/** "Light, Moderate": the soot levels seen, "" when none was recorded. */
export function sootText(levels: readonly SootLevel[]): string {
  return levels.map(sootName).join(", ");
}

const ROW_LABELS: Record<ComparisonMetric, string> = {
  wick: M.rowWick,
  burnCount: M.rowBurnCount,
  totalTime: M.rowTotalTime,
  totalLoss: M.rowTotalLoss,
  averageRate: M.rowAverageRate,
  lastMeltPoolDiameter: M.rowLastMeltPoolDiameter,
  maxMeltPoolDepth: M.rowMaxMeltPoolDepth,
  maxFlameHeight: M.rowMaxFlameHeight,
  soot: M.rowSoot,
  coldThrow: M.rowColdThrow,
  hotThrow: M.rowHotThrow,
};

export function metricLabel(metric: ComparisonMetric): string {
  return ROW_LABELS[metric];
}

/** The device's local date as "Nov 18, 2026" (for "Generated ..."). */
export function formatToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(now);
}

/** Splits `?sessions=a,b,b,c`: trimmed, no blanks, no repeats, at most MAX_COMPARE. */
export function parseSessionIds(raw: string | null): { ids: string[]; truncated: boolean } {
  const seen = new Set<string>();
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim();
    if (id) seen.add(id);
  }
  const all = [...seen];
  return { ids: all.slice(0, MAX_COMPARE), truncated: all.length > MAX_COMPARE };
}

/** `/burn-tests/compare?sessions=a,b` (or the report) for the given ids. */
export function compareHref(ids: readonly string[], report = false): string {
  const base = report ? "/burn-tests/compare/report" : "/burn-tests/compare";
  return `${base}?sessions=${ids.map(encodeURIComponent).join(",")}`;
}
