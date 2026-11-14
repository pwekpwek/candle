/**
 * GramGuard planned versus measured (T09). CALC-18 to CALC-22, V-16.
 *
 * Integer arithmetic only. Every product and quotient is a BigInt, rounded
 * once. Measured weights never change the plan (CALC-22).
 */
import { divHalfAwayFromZero, divHalfUp, parseFixed, toBig, toSafeInt } from "./fixed";
import {
  LIMITS,
  type ActualBlend,
  type CompareMeasured,
  type ComparisonRow,
  type ComponentComparison,
  type ParseMeasured,
} from "./contract";

const ZERO = BigInt(0);
const HUNDRED = BigInt(100);
const TEN_THOUSAND = BigInt(10_000);

/** V-16 and V-01. Empty means not measured. "0" is a valid measured weight. */
export const parseMeasured: ParseMeasured = (text, field) => {
  const r = parseFixed(text, 3);
  if (!r.ok) {
    switch (r.reason) {
      case "empty":
        return { ok: true, actualMg: null };
      case "format":
        return { ok: false, issue: { rule: "V-01", field, severity: "error" } };
      default:
        return { ok: false, issue: { rule: "V-16", field, severity: "error" } };
    }
  }
  // V-16: at most 2 decimals, whatever the formula precision (CALC-18).
  if (r.decimals > 2 || r.value > LIMITS.maxWeightMg) {
    return { ok: false, issue: { rule: "V-16", field, severity: "error" } };
  }
  return { ok: true, actualMg: r.value };
};

/** CALC-19. actual − target, and that as hundredths of a percent of target. */
function comparisonRow(targetMg: number, actualMg: number | null): ComparisonRow {
  if (actualMg === null) return { targetMg, actualMg: null, diffMg: null, diffX100: null };
  const diff = toBig(actualMg, "actualMg") - toBig(targetMg, "targetMg");
  const target = toBig(targetMg, "targetMg");
  return {
    targetMg,
    actualMg,
    diffMg: toSafeInt(diff),
    diffX100: target === ZERO ? null : toSafeInt(divHalfAwayFromZero(diff * TEN_THOUSAND, target)),
  };
}

/** CALC-18 to CALC-22. Entries for unknown ids are ignored; the last entry for an id wins. */
export const compareMeasured: CompareMeasured = (plan, entries) => {
  const known = new Set<string>();
  for (const c of plan.waxes) known.add(c.componentId);
  for (const c of plan.oils) known.add(c.componentId);
  const measured = new Map<string, number>();
  for (const e of entries) {
    if (known.has(e.componentId)) measured.set(e.componentId, e.actualMg);
  }

  const precision = BigInt(plan.precisionMg);
  const build = (
    list: { componentId: string; targetMg: number }[],
    kind: "wax" | "oil",
  ): ComponentComparison[] =>
    list.map((c) => {
      const actual = measured.get(c.componentId) ?? null;
      const base = comparisonRow(c.targetMg, actual);
      let flagged = false;
      if (base.diffMg !== null) {
        const abs = BigInt(base.diffMg < 0 ? -base.diffMg : base.diffMg);
        flagged =
          abs > precision &&
          abs * HUNDRED > BigInt(LIMITS.offTargetPercent) * toBig(c.targetMg, "targetMg");
      }
      return {
        componentId: c.componentId,
        kind,
        ...base,
        flagged,
        direction: flagged && base.diffMg !== null ? (base.diffMg > 0 ? "over" : "under") : null,
      };
    });

  const components = [...build(plan.waxes, "wax"), ...build(plan.oils, "oil")];

  const waxActuals = plan.waxes.map((c) => measured.get(c.componentId));
  const oilActuals = plan.oils.map((c) => measured.get(c.componentId));
  const sum = (values: (number | undefined)[]): bigint =>
    values.reduce<bigint>((a, v) => a + BigInt(v ?? 0), ZERO);
  const allWax = waxActuals.every((v) => v !== undefined);
  const allOil = oilActuals.every((v) => v !== undefined);

  const fragrance: ComparisonRow | null =
    plan.oils.length > 0 && allOil
      ? comparisonRow(plan.fragranceTotalMg, toSafeInt(sum(oilActuals)))
      : null;

  const complete = allWax && allOil;
  const total: ComparisonRow | null = complete
    ? comparisonRow(plan.totalMg, toSafeInt(sum(waxActuals) + sum(oilActuals)))
    : null;

  let actualBlend: ActualBlend | null = null;
  if (complete) {
    const wax = sum(waxActuals);
    const frag = sum(oilActuals);
    const tot = wax + frag;
    actualBlend = {
      waxMg: toSafeInt(wax),
      fragranceMg: toSafeInt(frag),
      totalMg: toSafeInt(tot),
      ofWaxX100: wax === ZERO ? null : toSafeInt(divHalfUp(frag * TEN_THOUSAND, wax)),
      ofTotalX100: tot === ZERO ? null : toSafeInt(divHalfUp(frag * TEN_THOUSAND, tot)),
      oilShares:
        frag === ZERO
          ? []
          : plan.oils.map((c, i) => ({
              componentId: c.componentId,
              shareX100: toSafeInt(divHalfUp(BigInt(oilActuals[i] ?? 0) * TEN_THOUSAND, frag)),
            })),
    };
  }

  return { components, fragrance, total, actualBlend };
};
