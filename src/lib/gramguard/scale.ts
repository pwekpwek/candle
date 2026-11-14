/**
 * GramGuard scaling (T09). CALC-23 to CALC-25, V-17.
 *
 * Only the batch size changes. The caller recomputes the plan from the new
 * sizing with `computePlan` (CALC-26).
 */
import type { Sizing } from "@/lib/types";
import { divHalfUp, parseFixed, toBig, toSafeInt } from "./fixed";
import { checkVesselCount, checkWeight, vesselsTooHeavy } from "./validate";
import { LIMITS, type EvaluateScale, type Issue, type ScaleEvaluation } from "./contract";

const ZERO = BigInt(0);
const TEN_THOUSAND = BigInt(10_000);
const HUNDRED = BigInt(100);

function invalid(issues: Issue[]): ScaleEvaluation {
  return { issues, sizing: null, scale: null };
}

/** new ÷ old × 10000, half up. */
function factor(newMg: bigint, oldMg: bigint): number {
  if (oldMg <= ZERO) throw new RangeError("The current batch size must be above 0.");
  return toSafeInt(divHalfUp(newMg * TEN_THOUSAND, oldMg));
}

/** V-17: 0.01 to 1000, at most 2 decimals. V-01 for bad format. */
function checkMultiplier(text: string, field: string): { ok: true; x100: number } | { ok: false; issue: Issue } {
  const bad: Issue = { rule: "V-17", field, severity: "error" };
  const r = parseFixed(text, 2);
  if (!r.ok) {
    return {
      ok: false,
      issue: r.reason === "format" ? { rule: "V-01", field, severity: "error" } : bad,
    };
  }
  if (r.value < LIMITS.minMultiplierX100 || r.value > LIMITS.maxMultiplierX100) {
    return { ok: false, issue: bad };
  }
  return { ok: true, x100: r.value };
}

/** CALC-23 to CALC-25. A method that does not fit the sizing mode is a programming error. */
export const evaluateScale: EvaluateScale = (sizing, precisionMg, fields) => {
  if (fields.method === "vesselCount") {
    if (sizing.mode !== "vessels") throw new Error("Scaling by vessel count needs a vessels-mode formula.");
    const issues: Issue[] = [];
    const count = checkVesselCount(fields.count, "scale.count");
    if (!count.ok) issues.push(count.issue);

    let fillMg = sizing.fillMg;
    let fillOk = true;
    if (fields.fill.trim() !== "") {
      const fill = checkWeight(fields.fill, "scale.fill", precisionMg, "V-06");
      if (fill.ok) fillMg = fill.value;
      else {
        issues.push(fill.issue);
        fillOk = false;
      }
    }
    if (count.ok && fillOk && vesselsTooHeavy(count.value, fillMg)) {
      issues.push({ rule: "V-06", field: "scale.fill", severity: "error", as: "V-03" });
    }
    if (issues.length > 0 || !count.ok) return invalid(issues);

    const next: Sizing = { mode: "vessels", count: count.value, fillMg };
    const oldTotal = toBig(sizing.count, "count") * toBig(sizing.fillMg, "fillMg");
    const newTotal = toBig(count.value, "count") * toBig(fillMg, "fillMg");
    return {
      issues,
      sizing: next,
      scale: { method: "vesselCount", factorX10000: factor(newTotal, oldTotal) },
    };
  }

  if (sizing.mode === "vessels") {
    throw new Error("Scaling by amount or multiplier needs a total or wax mode formula.");
  }
  const oldMg = toBig(sizing.amountMg, "amountMg");

  if (fields.method === "amount") {
    const amount = checkWeight(fields.amount, "scale.amount", precisionMg, "V-03");
    if (!amount.ok) return invalid([amount.issue]);
    return {
      issues: [],
      sizing: { mode: sizing.mode, amountMg: amount.value },
      scale: { method: "amount", factorX10000: factor(toBig(amount.value, "amountMg"), oldMg) },
    };
  }

  // Multiplier: old × m ÷ 100, rounded half up to the precision step.
  const multiplier = checkMultiplier(fields.multiplier, "scale.multiplier");
  if (!multiplier.ok) return invalid([multiplier.issue]);
  const step = BigInt(precisionMg);
  const newMg = divHalfUp(oldMg * BigInt(multiplier.x100), HUNDRED * step) * step;
  if (newMg === ZERO || newMg > BigInt(LIMITS.maxWeightMg)) {
    return invalid([{ rule: "V-17", field: "scale.multiplier", severity: "error" }]);
  }
  return {
    issues: [],
    sizing: { mode: sizing.mode, amountMg: toSafeInt(newMg) },
    scale: { method: "multiplier", factorX10000: factor(newMg, oldMg) },
  };
};
