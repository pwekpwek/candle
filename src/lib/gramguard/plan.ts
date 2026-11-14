/**
 * GramGuard planning (T08). Sections 3 to 5 of the calculation rules.
 *
 * Weights are integer milligrams, percentages integer hundredths of a percent,
 * parts integer hundredths. Every intermediate is a BigInt; results are
 * computed from exact inputs and rounded once (CALC-06).
 */
import type { Basis, PrecisionMg } from "@/lib/types";
import { divHalfUp, toBig, toSafeInt } from "./fixed";
import {
  LIMITS,
  type ComputePlan,
  type ConvertBasis,
  type PlanComponentInput,
  type PlannedComponent,
  type SizingTotalMg,
} from "./contract";

/** 100% in hundredths of a percent. */
const HUNDRED_PERCENT = BigInt(10_000);
/** One whole part in hundredths. Stands in for a single-component blend. */
const SINGLE_PARTS_X100 = BigInt(100);

/** T in milligrams for total and vessels modes; null for wax mode. */
export const sizingTotalMg: SizingTotalMg = (sizing) => {
  switch (sizing.mode) {
    case "total":
      return sizing.amountMg;
    case "vessels":
      return toSafeInt(toBig(sizing.count, "count") * toBig(sizing.fillMg, "fillMg"));
    case "wax":
      return null;
  }
};

/**
 * CALC-04. 800 from "wax" → 741. 800 from "total" → 870.
 * wax → total: bp ÷ (1 + p); total → wax: bp ÷ (1 − p). Throws for a total-mixture
 * percentage of 100% or more (no valid wax equivalent).
 */
export const convertBasis: ConvertBasis = (bp, from) => {
  const b = toBig(bp, "bp");
  if (b < BigInt(0)) throw new RangeError("bp must not be negative.");
  const denominator = from === "wax" ? HUNDRED_PERCENT + b : HUNDRED_PERCENT - b;
  if (denominator <= BigInt(0)) throw new RangeError("A total-mixture percentage must be below 100%.");
  return toSafeInt(divHalfUp(b * HUNDRED_PERCENT, denominator));
};

type Split = { targetMg: bigint; shareX100: bigint };

/**
 * CALC-10 and CALC-15. Splits `total` (a multiple of `unit`) by parts using the
 * largest-remainder method, ties to the earlier component. A single component
 * counts as 100 parts. Shares are parts ÷ sum, half up.
 */
function apportion(total: bigint, components: readonly PlanComponentInput[], unit: bigint): Split[] {
  const parts =
    components.length === 1
      ? [SINGLE_PARTS_X100]
      : components.map((c) => toBig(c.partsX100, "partsX100"));
  if (parts.some((p) => p < BigInt(0))) throw new RangeError("partsX100 must not be negative.");
  const sum = parts.reduce((a, b) => a + b, BigInt(0));
  if (sum <= BigInt(0)) throw new RangeError("A blend needs parts above 0.");

  const divisor = sum * unit;
  const rows = parts.map((p, index) => {
    const numerator = total * p;
    return {
      index,
      floor: (numerator / divisor) * unit,
      remainder: numerator % divisor,
      shareX100: divHalfUp(p * HUNDRED_PERCENT, sum),
    };
  });

  let steps = (total - rows.reduce((a, r) => a + r.floor, BigInt(0))) / unit;
  const byRemainder = [...rows].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (const row of byRemainder) {
    if (steps <= BigInt(0)) break;
    row.floor += unit;
    steps -= BigInt(1);
  }
  return rows.map((r) => ({ targetMg: r.floor, shareX100: r.shareX100 }));
}

function assertPrecision(precisionMg: PrecisionMg): void {
  if (precisionMg !== 1000 && precisionMg !== 100 && precisionMg !== 10) {
    throw new RangeError("precisionMg must be 1000, 100 or 10.");
  }
}

/**
 * Sections 3 to 5. Throws RangeError for input that evaluateFormula would have
 * rejected first (non-integers, no waxes, fragrance above 0 with no oils,
 * parts that sum to 0).
 */
export const computePlan: ComputePlan = (input) => {
  const { sizing, basis, precisionMg } = input;
  assertPrecision(precisionMg);
  const unit = BigInt(precisionMg);
  const bp = toBig(input.fragranceBp, "fragranceBp");
  if (bp < BigInt(0)) throw new RangeError("fragranceBp must not be negative.");
  if (input.waxes.length === 0) throw new RangeError("A plan needs at least one wax.");
  const scented = bp > BigInt(0);
  if (scented && input.oils.length === 0) {
    throw new RangeError("A scented plan needs at least one oil.");
  }

  // CALC-01 to CALC-03 and section 3: exact fragrance weight as n ÷ d (milligrams).
  const knownTotal = sizing.mode !== "wax";
  const known =
    sizing.mode === "vessels"
      ? toBig(sizing.count, "count") * toBig(sizing.fillMg, "fillMg")
      : toBig(sizing.amountMg, "amountMg");
  if (known < BigInt(0)) throw new RangeError("The batch amount must not be negative.");
  const exactN = known * bp;
  const exactD = knownTotal
    ? basis === "wax"
      ? HUNDRED_PERCENT + bp
      : HUNDRED_PERCENT
    : basis === "wax"
      ? HUNDRED_PERCENT
      : HUNDRED_PERCENT - bp;
  if (exactD <= BigInt(0)) throw new RangeError("A total-mixture percentage must be below 100%.");

  // CALC-09: fragrance first (the only rounding of the batch), then wax by subtraction.
  const fragranceMg = divHalfUp(exactN, exactD * unit) * unit;
  const totalMg = knownTotal ? known : known + fragranceMg;
  const waxMg = knownTotal ? known - fragranceMg : known;

  if (waxMg <= BigInt(0)) return { ok: false, reason: "no-wax", componentIds: [] };

  // CALC-17: no fragrance means oils are ignored.
  const oilInputs = scented ? input.oils : [];
  const waxSplit = apportion(waxMg, input.waxes, unit);
  const oilSplit = oilInputs.length > 0 ? apportion(fragranceMg, oilInputs, unit) : [];

  // CALC-14 / V-15: a component with parts above 0 that rounds to 0 g, waxes then oils.
  const zeroIds: string[] = [];
  const check = (components: readonly PlanComponentInput[], split: readonly Split[]) => {
    components.forEach((c, i) => {
      const parts = components.length === 1 ? SINGLE_PARTS_X100 : BigInt(c.partsX100);
      if (parts > BigInt(0) && split[i]!.targetMg === BigInt(0)) zeroIds.push(c.componentId);
    });
  };
  check(input.waxes, waxSplit);
  check(oilInputs, oilSplit);
  if (zeroIds.length > 0) return { ok: false, reason: "zero-component", componentIds: zeroIds };

  const toPlanned = (components: readonly PlanComponentInput[], split: readonly Split[]) =>
    components.map(
      (c, i): PlannedComponent => ({
        componentId: c.componentId,
        targetMg: toSafeInt(split[i]!.targetMg),
        shareX100: toSafeInt(split[i]!.shareX100),
      }),
    );

  // CALC-12: effective percentages from the planned weights, half up.
  const effectiveOfWaxX100 = divHalfUp(fragranceMg * HUNDRED_PERCENT, waxMg);
  const effectiveOfTotalX100 = divHalfUp(fragranceMg * HUNDRED_PERCENT, totalMg);
  const effectiveOnBasis = basis === "wax" ? effectiveOfWaxX100 : effectiveOfTotalX100;

  // CALC-13: |planned F − exact F| > 2% of exact F, i.e. |F·d − n| × 100 > 2 × n, all integers.
  const movedBy = fragranceMg * exactD - exactN;
  const roundingWarning =
    exactN > BigInt(0) &&
    (movedBy < BigInt(0) ? -movedBy : movedBy) * BigInt(100) > BigInt(LIMITS.roundingWarnPercent) * exactN;

  return {
    ok: true,
    plan: {
      precisionMg,
      basis: basis as Basis,
      fragranceBp: input.fragranceBp,
      totalMg: toSafeInt(totalMg),
      waxTotalMg: toSafeInt(waxMg),
      fragranceTotalMg: toSafeInt(fragranceMg),
      waxes: toPlanned(input.waxes, waxSplit),
      oils: toPlanned(oilInputs, oilSplit),
      equivalentX100: convertBasis(input.fragranceBp, basis),
      effectiveOfWaxX100: toSafeInt(effectiveOfWaxX100),
      effectiveOfTotalX100: toSafeInt(effectiveOfTotalX100),
      effectiveDiffers: effectiveOnBasis !== bp,
      roundingWarning,
      oilsIgnored: !scented && input.oils.length > 0,
    },
  };
};
