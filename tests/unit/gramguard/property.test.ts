/**
 * TEST-10: property check over random valid plan inputs, with a seeded PRNG so
 * every run is the same. Invariants come from CALC-04, CALC-08, CALC-09,
 * CALC-10 and CALC-15, checked with plain integer arithmetic in this file.
 */
import { describe, expect, it } from "vitest";
import { computePlan, convertBasis } from "@/lib/gramguard";
import type { PlanInput } from "@/lib/gramguard";
import type { Basis, PrecisionMg, Sizing } from "@/lib/types";
import { mulberry32, randInt } from "./helpers";

const SEED = 20_261_115;
const CASES = 2000;

const PRECISIONS: PrecisionMg[] = [1000, 100, 10];
const BASES: Basis[] = ["wax", "total"];

function randomInput(rng: () => number): PlanInput {
  const precisionMg = PRECISIONS[randInt(rng, 0, 2)];
  const basis = BASES[randInt(rng, 0, 1)];
  const modeIndex = randInt(rng, 0, 2);
  // Amounts are whole multiples of the precision, 5 g to 2000 g.
  const steps = (lo: number, hi: number) => randInt(rng, Math.ceil(lo / precisionMg), Math.floor(hi / precisionMg)) * precisionMg;
  let sizing: Sizing;
  if (modeIndex === 0) sizing = { mode: "total", amountMg: steps(5_000, 2_000_000) };
  else if (modeIndex === 1) sizing = { mode: "wax", amountMg: steps(5_000, 2_000_000) };
  else sizing = { mode: "vessels", count: randInt(rng, 1, 50), fillMg: steps(20_000, 400_000) };

  // Fragrance 0 to 50%, in hundredths of a percent. About one case in ten is unscented.
  const fragranceBp = rng() < 0.1 ? 0 : randInt(rng, 1, 5000);
  const waxCount = randInt(rng, 1, 5);
  const oilCount = fragranceBp === 0 ? randInt(rng, 0, 3) : randInt(rng, 1, 10);
  const parts = () => (rng() < 0.3 ? randInt(rng, 1, 20) * 100 : randInt(rng, 1, 999_999));
  return {
    sizing,
    fragranceBp,
    basis,
    precisionMg,
    waxes: Array.from({ length: waxCount }, (_, i) => ({ componentId: `w${i}`, partsX100: parts() })),
    oils: Array.from({ length: oilCount }, (_, i) => ({ componentId: `o${i}`, partsX100: parts() })),
  };
}

const sum = (xs: { targetMg: number }[]) => xs.reduce((s, c) => s + c.targetMg, 0);
const halfUp = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));

describe("TEST-10 property check (seeded)", () => {
  const rng = mulberry32(SEED);
  const inputs = Array.from({ length: CASES }, () => randomInput(rng));
  const results = inputs.map((input) => ({ input, result: computePlan(input) }));

  it("is reproducible: the same seed gives the same inputs", () => {
    const again = mulberry32(SEED);
    expect(Array.from({ length: 50 }, () => randomInput(again))).toEqual(inputs.slice(0, 50));
  });

  it("a reasonable share of cases plan successfully, and every mode, basis and precision is covered", () => {
    const ok = results.filter((r) => r.result.ok);
    expect(ok.length).toBeGreaterThan(CASES * 0.5);
    for (const mode of ["total", "wax", "vessels"]) {
      expect(ok.some((r) => r.input.sizing.mode === mode), mode).toBe(true);
    }
    for (const basis of BASES) expect(ok.some((r) => r.input.basis === basis), basis).toBe(true);
    for (const p of PRECISIONS) expect(ok.some((r) => r.input.precisionMg === p), String(p)).toBe(true);
    expect(ok.some((r) => r.input.fragranceBp === 0)).toBe(true);
  });

  it("not-ok results carry a documented reason and ids", () => {
    for (const { result } of results) {
      if (!result.ok) {
        expect(["no-wax", "zero-component"]).toContain(result.reason);
        if (result.reason === "zero-component") expect(result.componentIds.length).toBeGreaterThan(0);
      }
    }
  });

  it("holds the invariants on every ok result", () => {
    for (const { input, result } of results) {
      if (!result.ok) continue;
      const plan = result.plan;
      const u = input.precisionMg;
      const label = JSON.stringify(input);

      // CALC-09: wax and fragrance add up to the total.
      expect(plan.waxTotalMg + plan.fragranceTotalMg, label).toBe(plan.totalMg);
      // CALC-10: components add up to their blend totals.
      expect(sum(plan.waxes), label).toBe(plan.waxTotalMg);
      expect(sum(plan.oils), label).toBe(plan.fragranceTotalMg);

      // Every target is a non-negative multiple of the precision; none rounds to zero (ok result).
      for (const c of [...plan.waxes, ...plan.oils]) {
        expect(Number.isSafeInteger(c.targetMg), label).toBe(true);
        expect(c.targetMg >= 0, label).toBe(true);
        expect(c.targetMg % u, label).toBe(0);
        expect(c.targetMg > 0, label).toBe(true);
      }
      expect(plan.waxTotalMg % u, label).toBe(0);
      expect(plan.fragranceTotalMg % u, label).toBe(0);
      expect(plan.waxTotalMg > 0, label).toBe(true);

      // Sizing: the known quantity is the input, exactly.
      const s = input.sizing;
      if (s.mode === "total") expect(plan.totalMg, label).toBe(s.amountMg);
      if (s.mode === "vessels") expect(plan.totalMg, label).toBe(s.count * s.fillMg);
      if (s.mode === "wax") expect(plan.waxTotalMg, label).toBe(s.amountMg);

      // Unscented: no fragrance, no oils.
      if (input.fragranceBp === 0) {
        expect(plan.fragranceTotalMg, label).toBe(0);
        expect(plan.oils, label).toEqual([]);
      }

      // Component order and ids follow the input.
      expect(plan.waxes.map((c) => c.componentId), label).toEqual(input.waxes.map((c) => c.componentId));
      if (input.fragranceBp > 0) {
        expect(plan.oils.map((c) => c.componentId), label).toEqual(input.oils.map((c) => c.componentId));
      }

      // CALC-01 to CALC-04, CALC-08: F is the exact value rounded half up, once.
      // exact F = num / den (section 3), rounded to a multiple of u.
      const p = input.fragranceBp;
      let num: number;
      let den: number;
      if (s.mode === "wax") {
        const w = s.amountMg;
        num = w * p;
        den = input.basis === "wax" ? 10_000 : 10_000 - p;
      } else {
        const t = plan.totalMg;
        num = t * p;
        den = input.basis === "wax" ? 10_000 + p : 10_000;
      }
      const twiceError = 2 * (plan.fragranceTotalMg * den - num);
      expect(twiceError <= u * den, label).toBe(true); // at most half a step above (ties round up)
      expect(twiceError > -u * den, label).toBe(true); // strictly less than half a step below

      // Shares, equivalent and effective percentages by integer reference.
      if (input.waxes.length > 1) {
        const total = input.waxes.reduce((a, c) => a + c.partsX100, 0);
        plan.waxes.forEach((c, i) => expect(c.shareX100, label).toBe(halfUp(10_000 * input.waxes[i].partsX100, total)));
      }
      if (input.fragranceBp > 0 && input.oils.length > 1) {
        const total = input.oils.reduce((a, c) => a + c.partsX100, 0);
        plan.oils.forEach((c, i) => expect(c.shareX100, label).toBe(halfUp(10_000 * input.oils[i].partsX100, total)));
      }
      expect(plan.equivalentX100, label).toBe(convertBasis(p, input.basis));
      expect(plan.effectiveOfWaxX100, label).toBe(halfUp(10_000 * plan.fragranceTotalMg, plan.waxTotalMg));
      expect(plan.effectiveOfTotalX100, label).toBe(halfUp(10_000 * plan.fragranceTotalMg, plan.totalMg));
    }
  });

  it("largest remainder: no component is more than one step away from its quota", () => {
    for (const { input, result } of results) {
      if (!result.ok) continue;
      const u = input.precisionMg;
      const check = (
        comps: { targetMg: number }[],
        parts: { partsX100: number }[],
        blendTotal: number,
      ) => {
        if (comps.length < 2) return;
        const sumParts = parts.reduce((a, c) => a + c.partsX100, 0);
        comps.forEach((c, i) => {
          // quota = blendTotal * parts / sumParts. The target is floor(quota) or floor(quota) + one step.
          const quotaNum = blendTotal * parts[i].partsX100;
          const floorSteps = Math.floor(quotaNum / sumParts / u);
          expect([floorSteps * u, (floorSteps + 1) * u]).toContain(c.targetMg);
        });
      };
      check(result.plan.waxes, input.waxes, result.plan.waxTotalMg);
      if (input.fragranceBp > 0) check(result.plan.oils, input.oils, result.plan.fragranceTotalMg);
    }
  });
});
