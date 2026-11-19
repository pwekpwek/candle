/**
 * BurnMatrix calculations: per-burn figures, per-candle totals and the small
 * formatters. Integer arithmetic only (BigInt where a division rounds).
 */
import { divHalfUp, formatWeight, toBig, toSafeInt } from "@/lib/gramguard";
import type { BurnCandle, BurnRecord, SootLevel } from "@/lib/types";
import type { BurnFigures, CandleTotals } from "./contract";

const SOOT_ORDER: readonly SootLevel[] = ["none", "light", "moderate", "heavy"];

/** mg × 60 ÷ minutes, rounded half up. `mg` ≥ 0, `minutes` > 0. */
function perHour(mg: number, minutes: number): number {
  return toSafeInt(divHalfUp(toBig(mg, "mg") * BigInt(60), toBig(minutes, "minutes")));
}

export function burnFigures(burn: BurnRecord): BurnFigures {
  const before = burn.weightBeforeMg;
  const after = burn.weightAfterMg;
  if (before === undefined || after === undefined || before < after || burn.durationMin <= 0) {
    return { weightLossMg: null, mgPerHour: null };
  }
  const loss = before - after;
  return { weightLossMg: loss, mgPerHour: perHour(loss, burn.durationMin) };
}

export function candleTotals(candle: BurnCandle): CandleTotals {
  let totalMinutes = 0;
  let weighedBurnCount = 0;
  let weighedMinutes = 0;
  let lossSum = 0;
  let lastDiameter: number | null = null;
  let maxDepth: number | null = null;
  let maxFlame: number | null = null;
  const soot = new Set<SootLevel>();

  for (const burn of candle.burns) {
    totalMinutes += burn.durationMin;
    const figures = burnFigures(burn);
    if (figures.weightLossMg !== null) {
      weighedBurnCount += 1;
      weighedMinutes += burn.durationMin;
      lossSum += figures.weightLossMg;
    }
    if (burn.meltPoolDiameterMm !== undefined) lastDiameter = burn.meltPoolDiameterMm;
    if (burn.meltPoolDepthMm !== undefined) {
      maxDepth = maxDepth === null ? burn.meltPoolDepthMm : Math.max(maxDepth, burn.meltPoolDepthMm);
    }
    if (burn.flameHeightMm !== undefined) {
      maxFlame = maxFlame === null ? burn.flameHeightMm : Math.max(maxFlame, burn.flameHeightMm);
    }
    if (burn.soot !== undefined) soot.add(burn.soot);
  }

  const weighed = weighedBurnCount > 0;
  return {
    burnCount: candle.burns.length,
    totalMinutes,
    weighedBurnCount,
    weighedMinutes,
    totalLossMg: weighed ? lossSum : null,
    averageMgPerHour: weighed ? perHour(lossSum, weighedMinutes) : null,
    lastMeltPoolDiameterMm: lastDiameter,
    maxMeltPoolDepthMm: maxDepth,
    maxFlameHeightMm: maxFlame,
    sootLevels: SOOT_ORDER.filter((level) => soot.has(level)),
  };
}

/** "4 h 30 min", "45 min", "2 h", "0 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** mg per hour as grams per hour: 3250 → "3.25 g/h". */
export function formatRate(mgPerHour: number): string {
  return `${formatWeight(mgPerHour, 10)} g/h`;
}

/** Whole millimetres: "62 mm". */
export function formatMm(mm: number): string {
  return `${mm} mm`;
}
