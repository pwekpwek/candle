/**
 * BurnMatrix comparison model: observations side by side, never ranked.
 */
import type { BurnSessionListItem } from "@/lib/db/contract";
import { formatGrams } from "@/lib/gramguard";
import type { SootLevel } from "@/lib/types";
import { candleTotals, formatDuration, formatMm, formatRate } from "./calc";
import type {
  ComparisonColumn,
  ComparisonGroup,
  ComparisonMetric,
  ComparisonModel,
  ComparisonRow,
} from "./contract";

export function buildComparison(
  sessions: readonly BurnSessionListItem[],
  sootText: (levels: readonly SootLevel[]) => string,
): ComparisonModel {
  const groups: ComparisonGroup[] = sessions.map(({ session, batch, formula, version }) => ({
    sessionId: session.id,
    batchId: batch.id,
    sessionLabel: session.label?.trim() ? session.label : null,
    testedOn: session.testedOn,
    batchLabel: batch.label?.trim() ? batch.label : null,
    formulaName: formula.name,
    versionNumber: version.number,
    conclusion: session.conclusion?.trim() ? session.conclusion : null,
    columns: session.candles.map(
      (candle): ComparisonColumn => ({
        key: `${session.id}:${candle.id}`,
        sessionId: session.id,
        candleId: candle.id,
        candleLabel: candle.label,
        wickName: candle.wick.name,
        totals: candleTotals(candle),
        coldThrow: candle.coldThrow?.trim() ? candle.coldThrow : null,
        hotThrow: candle.hotThrow?.trim() ? candle.hotThrow : null,
      }),
    ),
  }));

  const columns = groups.flatMap((g) => g.columns);

  const row = (metric: ComparisonMetric, cell: (c: ComparisonColumn) => string): ComparisonRow => ({
    metric,
    cells: columns.map(cell),
  });
  const mm = (v: number | null) => (v === null ? "" : formatMm(v));

  const rows: ComparisonRow[] = [
    row("wick", (c) => c.wickName),
    row("burnCount", (c) => String(c.totals.burnCount)),
    row("totalTime", (c) => (c.totals.burnCount === 0 ? "" : formatDuration(c.totals.totalMinutes))),
    row("totalLoss", (c) => (c.totals.totalLossMg === null ? "" : formatGrams(c.totals.totalLossMg, 10))),
    row("averageRate", (c) => (c.totals.averageMgPerHour === null ? "" : formatRate(c.totals.averageMgPerHour))),
    row("lastMeltPoolDiameter", (c) => mm(c.totals.lastMeltPoolDiameterMm)),
    row("maxMeltPoolDepth", (c) => mm(c.totals.maxMeltPoolDepthMm)),
    row("maxFlameHeight", (c) => mm(c.totals.maxFlameHeightMm)),
    row("soot", (c) => (c.totals.sootLevels.length === 0 ? "" : sootText(c.totals.sootLevels))),
    row("coldThrow", (c) => c.coldThrow ?? ""),
    row("hotThrow", (c) => c.hotThrow ?? ""),
  ];

  return { groups, columns, rows };
}
