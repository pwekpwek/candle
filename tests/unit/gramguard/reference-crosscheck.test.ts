/**
 * T25 integration review: the engine against the reference arithmetic.
 *
 * `split` and `apportion` below are the algorithm of
 * `tests/reference/worked-examples.mjs` (the script that produced every figure
 * in section 9 of the Calculation Rules), rewritten with `BigInt()` calls
 * because the TypeScript target has no BigInt literals. The engine's own code
 * is not used to compute any expected value.
 */
import { describe, expect, it } from "vitest";
import { computePlan } from "@/lib/gramguard";
import type { PlanInput } from "@/lib/gramguard";
import type { Basis, PrecisionMg } from "@/lib/types";

const n = (value: number) => BigInt(value);
const ZERO = n(0);
const ONE = n(1);
const TWO = n(2);
const TEN_THOUSAND = n(10000);

/** Positive rationals num/den to the nearest integer, half up. */
const roundHalfUp = (num: bigint, den: bigint) => (TWO * num + den) / (TWO * den);
const roundToUnit = (num: bigint, den: bigint, unit: bigint) =>
  roundHalfUp(num, den * unit) * unit;

type RefMode = "total" | "wax";

function split(mode: RefMode, amount: bigint, pct: bigint, basis: Basis, unit: bigint) {
  let fo: bigint;
  let wax: bigint;
  let total: bigint;
  if (mode === "total") {
    const [num, den] = basis === "wax" ? [amount * pct, TEN_THOUSAND + pct] : [amount * pct, TEN_THOUSAND];
    fo = roundToUnit(num, den, unit);
    total = amount;
    wax = total - fo;
  } else {
    const [num, den] = basis === "wax" ? [amount * pct, TEN_THOUSAND] : [amount * pct, TEN_THOUSAND - pct];
    fo = roundToUnit(num, den, unit);
    wax = amount;
    total = wax + fo;
  }
  return { fo, wax, total };
}

function apportion(total: bigint, parts: bigint[], unit: bigint): bigint[] {
  const sum = parts.reduce((a, b) => a + b, ZERO);
  const rows = parts.map((p, i) => {
    const num = total * p;
    const den = sum * unit;
    return { i, floor: (num / den) * unit, rem: num % den };
  });
  let left = (total - rows.reduce((a, r) => a + r.floor, ZERO)) / unit;
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const r of order) {
    if (left <= ZERO) break;
    r.floor += unit;
    left -= ONE;
  }
  return rows.map((r) => r.floor);
}

/** Reference result for a plan input, in mg. Null when the input has no valid plan. */
function reference(input: PlanInput) {
  const unit = n(input.precisionMg);
  const pct = n(input.fragranceBp);
  let mode: RefMode;
  let amount: bigint;
  if (input.sizing.mode === "vessels") {
    mode = "total";
    amount = n(input.sizing.count) * n(input.sizing.fillMg);
  } else {
    mode = input.sizing.mode;
    amount = n(input.sizing.amountMg);
  }
  const s = split(mode, amount, pct, input.basis, unit);
  const waxParts = input.waxes.length === 1 ? [n(100)] : input.waxes.map((w) => n(w.partsX100));
  const oilList = input.fragranceBp === 0 ? [] : input.oils;
  const oilParts = oilList.length === 1 ? [n(100)] : oilList.map((o) => n(o.partsX100));
  const waxes = s.wax > ZERO ? apportion(s.wax, waxParts, unit) : [];
  const oils = oilList.length > 0 ? apportion(s.fo, oilParts, unit) : [];
  return { ...s, waxes, oils };
}

function plan(sizing: PlanInput["sizing"], pct: number, basis: Basis, precisionMg: PrecisionMg, waxParts: number[], oilParts: number[]): PlanInput {
  return {
    sizing,
    fragranceBp: pct,
    basis,
    precisionMg,
    waxes: waxParts.map((p, i) => ({ componentId: `w${i}`, partsX100: p })),
    oils: oilParts.map((p, i) => ({ componentId: `o${i}`, partsX100: p })),
  };
}

function compare(input: PlanInput) {
  const ref = reference(input);
  const result = computePlan(input);
  if (ref.wax <= ZERO) {
    expect(result).toMatchObject({ ok: false, reason: "no-wax" });
    return "no-wax";
  }
  const zero = [...ref.waxes, ...ref.oils].some((mg) => mg === ZERO);
  if (zero) {
    expect(result).toMatchObject({ ok: false, reason: "zero-component" });
    return "zero";
  }
  expect(result.ok).toBe(true);
  if (!result.ok) return "fail";
  const p = result.plan;
  expect(n(p.fragranceTotalMg)).toBe(ref.fo);
  expect(n(p.waxTotalMg)).toBe(ref.wax);
  expect(n(p.totalMg)).toBe(ref.total);
  expect(p.waxes.map((c) => n(c.targetMg))).toEqual(ref.waxes);
  expect(p.oils.map((c) => n(c.targetMg))).toEqual(ref.oils);
  return "ok";
}

describe("engine against the reference arithmetic (T25)", () => {
  // The fifteen calls at the end of tests/reference/worked-examples.mjs.
  const g = (grams: number) => grams * 1000;
  const cases: [string, PlanInput][] = [
    ["WE-1", plan({ mode: "total", amountMg: g(500) }, 800, "wax", 100, [100], [100])],
    ["WE-2", plan({ mode: "total", amountMg: g(500) }, 800, "total", 100, [100], [100])],
    ["WE-3", plan({ mode: "wax", amountMg: g(1000) }, 1000, "wax", 100, [100], [100])],
    ["WE-4", plan({ mode: "wax", amountMg: g(450) }, 1000, "total", 100, [100], [100])],
    ["WE-5", plan({ mode: "vessels", count: 6, fillMg: g(180) }, 800, "wax", 100, [100], [300, 200, 100])],
    ["WE-6 at 0.1", plan({ mode: "total", amountMg: g(250) }, 900, "total", 100, [100], [5000, 3000, 2000])],
    ["WE-6 at 0.01", plan({ mode: "total", amountMg: g(250) }, 900, "total", 10, [100], [5000, 3000, 2000])],
    ["WE-7 at 1", plan({ mode: "total", amountMg: g(50) }, 600, "wax", 1000, [100], [200, 100])],
    ["WE-7 at 0.1", plan({ mode: "total", amountMg: g(50) }, 600, "wax", 100, [100], [200, 100])],
    ["WE-7 at 0.01", plan({ mode: "total", amountMg: g(50) }, 600, "wax", 10, [100], [200, 100])],
    ["WE-9a", plan({ mode: "vessels", count: 10, fillMg: g(180) }, 800, "wax", 100, [100], [300, 200, 100])],
    ["WE-9b", plan({ mode: "total", amountMg: g(540) }, 800, "wax", 100, [100], [300, 200, 100])],
    ["WE-9c", plan({ mode: "total", amountMg: g(625) }, 800, "wax", 100, [100], [100])],
    ["WE-10", plan({ mode: "total", amountMg: g(800) }, 1000, "wax", 100, [7000, 3000], [100])],
    ["WE-11", plan({ mode: "total", amountMg: g(300) }, 0, "wax", 100, [100], [])],
    ["WE-12", plan({ mode: "total", amountMg: g(100) }, 825, "wax", 10, [100], [6000, 4000])],
  ];

  it.each(cases)("%s matches the reference script", (_label, input) => {
    expect(compare(input)).toBe("ok");
  });

  it("matches the reference on 20 000 seeded random formulas", () => {
    // Small deterministic PRNG (mulberry32), seed fixed for reproducible runs.
    let seed = 20261118;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    const precisions: PrecisionMg[] = [1000, 100, 10];
    const tally = { ok: 0, "no-wax": 0, zero: 0, fail: 0 };

    for (let k = 0; k < 20000; k++) {
      const precisionMg = precisions[int(0, 2)];
      const basis: Basis = rand() < 0.5 ? "wax" : "total";
      const steps = (maxGrams: number) => int(1, Math.floor((maxGrams * 1000) / precisionMg)) * precisionMg;
      const which = int(0, 2);
      const sizing: PlanInput["sizing"] =
        which === 0
          ? { mode: "total", amountMg: steps(rand() < 0.3 ? 60 : 20000) }
          : which === 1
            ? { mode: "wax", amountMg: steps(rand() < 0.3 ? 60 : 20000) }
            : { mode: "vessels", count: int(1, 40), fillMg: steps(rand() < 0.3 ? 30 : 500) };
      const pct = rand() < 0.1 ? 0 : int(1, 5000);
      const waxParts = Array.from({ length: int(1, 5) }, () => int(1, rand() < 0.2 ? 999999 : 10000));
      const oilParts = pct === 0 ? [] : Array.from({ length: int(1, 10) }, () => int(1, rand() < 0.2 ? 999999 : 10000));
      tally[compare(plan(sizing, pct, basis, precisionMg, waxParts, oilParts)) as keyof typeof tally] += 1;
    }
    expect(tally.fail).toBe(0);
    // Most random formulas must produce a plan, so the comparison is meaningful.
    expect(tally.ok).toBeGreaterThan(12000);
  });
});
