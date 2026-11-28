/**
 * Before-and-after model: the original batch beside each follow-up batch.
 * Figures only; nothing is scored or ranked.
 */
import { candleTotals } from "@/lib/burnmatrix";
import type { ComparisonBatch, InvestigationComparisonData } from "@/lib/db/contract";
import { divHalfUp, toBig, toSafeInt } from "@/lib/gramguard";
import type { Investigation, SootLevel } from "@/lib/types";
import type { BatchBurnSummary, BeforeAfterColumn, BeforeAfterModel, ObservedIssues } from "./contract";

const SOOT_ORDER: readonly SootLevel[] = ["none", "light", "moderate", "heavy"];

function maxOf(values: number[]): number | null {
  return values.length === 0 ? null : Math.max(...values);
}

export function batchBurnSummary(
  sessions: InvestigationComparisonData["original"]["burnSessions"],
): BatchBurnSummary {
  let candleCount = 0;
  let burnCount = 0;
  let totalMinutes = 0;
  let weighedMinutes = 0;
  let lossSum = 0;
  let weighed = false;
  const diameters: number[] = [];
  const flames: number[] = [];
  const soot = new Set<SootLevel>();

  for (const { session } of sessions) {
    for (const candle of session.candles) {
      candleCount += 1;
      const totals = candleTotals(candle);
      burnCount += totals.burnCount;
      totalMinutes += totals.totalMinutes;
      weighedMinutes += totals.weighedMinutes;
      if (totals.totalLossMg !== null) {
        weighed = true;
        lossSum += totals.totalLossMg;
      }
      if (totals.lastMeltPoolDiameterMm !== null) diameters.push(totals.lastMeltPoolDiameterMm);
      if (totals.maxFlameHeightMm !== null) flames.push(totals.maxFlameHeightMm);
      for (const level of totals.sootLevels) soot.add(level);
    }
  }

  return {
    sessionCount: sessions.length,
    candleCount,
    burnCount,
    totalMinutes,
    weighedMinutes,
    totalLossMg: weighed ? lossSum : null,
    averageMgPerHour:
      weighed && weighedMinutes > 0
        ? toSafeInt(divHalfUp(toBig(lossSum, "mg") * BigInt(60), toBig(weighedMinutes, "minutes")))
        : null,
    largestMeltPoolDiameterMm: maxOf(diameters),
    maxFlameHeightMm: maxOf(flames),
    sootLevels: SOOT_ORDER.filter((level) => soot.has(level)),
  };
}

function compareInvestigations(a: Investigation, b: Investigation): number {
  if (a.observedOn !== b.observedOn) return a.observedOn < b.observedOn ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function observedOf(batch: ComparisonBatch): ObservedIssues[] {
  return [...batch.investigations].sort(compareInvestigations).map((inv) => ({
    investigationId: inv.id,
    observedOn: inv.observedOn,
    issues: [...inv.issues],
    otherIssue: inv.otherIssue ?? null,
  }));
}

function baseColumn(batch: ComparisonBatch) {
  const { batch: b, formula, version } = batch.item;
  return {
    batchId: b.id,
    batchLabel: b.label ?? null,
    formulaId: formula.id,
    formulaName: formula.name,
    versionId: version.id,
    versionNumber: version.number,
    producedOn: b.producedOn,
    observed: observedOf(batch),
    burn: batchBurnSummary(batch.burnSessions),
    burnSessionIds: batch.burnSessions.map((s) => s.session.id),
  };
}

export function buildBeforeAfter(data: InvestigationComparisonData): BeforeAfterModel {
  const columns: BeforeAfterColumn[] = [
    {
      key: "original",
      role: "original",
      ...baseColumn(data.original),
      hypothesis: null,
      change: null,
      notes: null,
    },
  ];
  for (const { experiment, followUp } of data.experiments) {
    const h = data.investigation.hypotheses.find((x) => x.id === experiment.hypothesisId);
    columns.push({
      key: experiment.id,
      role: "followUp",
      ...baseColumn(followUp),
      hypothesis: h === undefined ? null : { id: h.id, text: h.text, status: h.status },
      change: experiment.change ?? null,
      notes: experiment.notes ?? null,
    });
  }
  return { investigationId: data.investigation.id, columns };
}
