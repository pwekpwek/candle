/**
 * Shared helpers for the GramGuard acceptance tests (T07).
 *
 * Written from the spec and contract only. Nothing here calls the engine except
 * `okPlan`, which is a thin unwrap around `computePlan`.
 */
import { expect } from "vitest";
import { computePlan } from "@/lib/gramguard";
import type {
  BlendRowFields,
  EditorFields,
  MaterialInfo,
  MaterialLookup,
  Plan,
  PlanInput,
} from "@/lib/gramguard";
import type { ExpectedPlan, WorkedExample } from "../../fixtures/worked-examples";

// ───────────────────────────── Plan assertions ─────────────────────────────

/** Unwrap a successful plan or fail the test with the reason. */
export function okPlan(input: PlanInput): Plan {
  const result = computePlan(input);
  if (!result.ok) {
    throw new Error(`computePlan returned not-ok: ${result.reason} ${result.componentIds.join(",")}`);
  }
  return result.plan;
}

/**
 * Compare a plan against a worked-example expectation. `ids` optionally maps the
 * fixture's component ids to the ids used in the plan (editor row ids).
 */
export function expectPlanMatches(
  plan: Plan,
  expected: ExpectedPlan,
  ids: (id: string) => string = (id) => id,
): void {
  expect(plan.totalMg).toBe(expected.totalMg);
  expect(plan.waxTotalMg).toBe(expected.waxTotalMg);
  expect(plan.fragranceTotalMg).toBe(expected.fragranceTotalMg);
  expect(plan.waxes.map((c) => [c.componentId, c.targetMg])).toEqual(
    expected.waxes.map((c) => [ids(c.componentId), c.targetMg]),
  );
  expect(plan.oils.map((c) => [c.componentId, c.targetMg])).toEqual(
    expected.oils.map((c) => [ids(c.componentId), c.targetMg]),
  );
  expected.waxes.forEach((c, i) => {
    if (c.shareX100 !== undefined) expect(plan.waxes[i].shareX100).toBe(c.shareX100);
  });
  expected.oils.forEach((c, i) => {
    if (c.shareX100 !== undefined) expect(plan.oils[i].shareX100).toBe(c.shareX100);
  });
  expect(plan.equivalentX100).toBe(expected.equivalentX100);
  expect(plan.effectiveOfWaxX100).toBe(expected.effectiveOfWaxX100);
  expect(plan.effectiveOfTotalX100).toBe(expected.effectiveOfTotalX100);
  expect(plan.effectiveDiffers).toBe(expected.effectiveDiffers);
  expect(plan.roundingWarning).toBe(expected.roundingWarning);
  expect(plan.oilsIgnored).toBe(expected.oilsIgnored);
}

/** Run a worked example through computePlan and compare everything it asserts. */
export function expectExample(example: WorkedExample): Plan {
  const plan = okPlan(example.input);
  expectPlanMatches(plan, example.expect);
  expect(plan.precisionMg).toBe(example.input.precisionMg);
  expect(plan.basis).toBe(example.input.basis);
  expect(plan.fragranceBp).toBe(example.input.fragranceBp);
  const sumOf = (xs: { targetMg: number }[]) => xs.reduce((s, c) => s + c.targetMg, 0);
  expect(sumOf(plan.waxes)).toBe(plan.waxTotalMg);
  expect(sumOf(plan.oils)).toBe(plan.fragranceTotalMg);
  expect(plan.waxTotalMg + plan.fragranceTotalMg).toBe(plan.totalMg);
  return plan;
}

// ───────────────────────────── Editor fields ─────────────────────────────

export function row(rowId: string, materialId: string | null, parts = ""): BlendRowFields {
  return { rowId, materialId, parts };
}

/** A valid single-wax, single-oil formula: 500 g total, 8% of wax weight, 0.1 g. */
export function baseFields(over: Partial<EditorFields> = {}): EditorFields {
  return {
    name: "Test candle",
    sizingMode: "total",
    amount: "500",
    vesselCount: "",
    fillWeight: "",
    fragrancePct: "8",
    basis: "wax",
    precisionMg: 100,
    waxes: [row("w1", "wax-plain")],
    oils: [row("o1", "oil-lav")],
    wickId: null,
    vesselId: null,
    notes: "",
    changeNote: "",
    ...over,
  };
}

// ───────────────────────────── Materials ─────────────────────────────

const MATERIALS: MaterialInfo[] = [
  { id: "wax-plain", type: "wax", name: "Plain Wax" },
  { id: "wax-soy", type: "wax", name: "Soy 464", maxFragranceBp: 1000 }, // basis omitted: wax
  { id: "wax-coco", type: "wax", name: "Coconut Wax" },
  { id: "wax-capt", type: "wax", name: "Capped Total", maxFragranceBp: 800, maxFragranceBasis: "total" },
  { id: "wax-capw", type: "wax", name: "Capped Wax", maxFragranceBp: 500, maxFragranceBasis: "wax" },
  { id: "oil-lav", type: "fragranceOil", name: "Lavender" },
  { id: "oil-van", type: "fragranceOil", name: "Vanilla" },
  { id: "oil-cit", type: "fragranceOil", name: "Citrus" },
];

/** Library lookup. Ids "gen-wax-N" and "gen-oil-N" are generated on demand. */
export const lookup: MaterialLookup = (id) => {
  const fixed = MATERIALS.find((m) => m.id === id);
  if (fixed) return fixed;
  const genWax = /^gen-wax-(\d+)$/.exec(id);
  if (genWax) return { id, type: "wax", name: `Wax ${genWax[1]}` };
  const genOil = /^gen-oil-(\d+)$/.exec(id);
  if (genOil) return { id, type: "fragranceOil", name: `Oil ${genOil[1]}` };
  return undefined;
};

// ───────────────────────────── Number text ─────────────────────────────

/** Integer to the shortest decimal text, by string arithmetic (no floats). */
export function decimalText(n: number, scale: number): string {
  const base = Math.pow(10, scale);
  const whole = Math.floor(n / base);
  const frac = String(n % base).padStart(scale, "0").replace(/0+$/, "");
  return frac === "" ? String(whole) : `${whole}.${frac}`;
}

/** EditorFields that hold exactly a PlanInput. Row ids are the component ids. */
export function fieldsForInput(input: PlanInput, name = "Example"): EditorFields {
  const s = input.sizing;
  let waxIndex = 0;
  let oilIndex = 0;
  return baseFields({
    name,
    sizingMode: s.mode,
    amount: s.mode === "vessels" ? "" : decimalText(s.amountMg, 3),
    vesselCount: s.mode === "vessels" ? String(s.count) : "",
    fillWeight: s.mode === "vessels" ? decimalText(s.fillMg, 3) : "",
    fragrancePct: decimalText(input.fragranceBp, 2),
    basis: input.basis,
    precisionMg: input.precisionMg,
    waxes: input.waxes.map((w) => row(w.componentId, `gen-wax-${++waxIndex}`, decimalText(w.partsX100, 2))),
    oils: input.oils.map((o) => row(o.componentId, `gen-oil-${++oilIndex}`, decimalText(o.partsX100, 2))),
  });
}

// ───────────────────────────── PRNG ─────────────────────────────

/** mulberry32: small, fast, seedable. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive integer in [lo, hi]. */
export function randInt(rng: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** Recursively freeze, so any mutation by the code under test throws. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
