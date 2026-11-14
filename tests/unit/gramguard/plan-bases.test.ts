/**
 * TEST-01 (percentage of wax weight), TEST-02 (percentage of total mixture),
 * TEST-03 (basis conversion table, CALC-04).
 */
import { describe, expect, it } from "vitest";
import { computePlan, convertBasis, sizingTotalMg } from "@/lib/gramguard";
import type { PlanInput } from "@/lib/gramguard";
import { WE_1, WE_2, WE_3, WE_4 } from "../../fixtures/worked-examples";
import { expectExample, okPlan } from "./helpers";

describe("TEST-01 percentage of wax weight", () => {
  it("WE-1: 500 g total, 8% of wax weight", () => {
    const plan = expectExample(WE_1);
    expect(plan.fragranceTotalMg).toBe(37_000); // F = 37.0 g
    expect(plan.waxTotalMg).toBe(463_000); // W = 463.0 g
    expect(plan.equivalentX100).toBe(741); // 7.41% of total mixture
    expect(plan.effectiveOfWaxX100).toBe(799); // 7.99% of wax weight
    expect(plan.effectiveDiffers).toBe(true);
  });

  it("WE-3: 1000 g wax, 10% of wax weight", () => {
    const plan = expectExample(WE_3);
    expect(plan.fragranceTotalMg).toBe(100_000);
    expect(plan.totalMg).toBe(1_100_000);
    expect(plan.equivalentX100).toBe(909);
    expect(plan.effectiveDiffers).toBe(false);
  });

  it("echoes the requested percentage, basis and precision", () => {
    const plan = okPlan(WE_1.input);
    expect(plan.fragranceBp).toBe(800);
    expect(plan.basis).toBe("wax");
    expect(plan.precisionMg).toBe(100);
  });

  it("a single wax and a single oil take the whole of W and F", () => {
    const plan = okPlan(WE_1.input);
    expect(plan.waxes).toHaveLength(1);
    expect(plan.oils).toHaveLength(1);
    expect(plan.waxes[0].targetMg).toBe(plan.waxTotalMg);
    expect(plan.oils[0].targetMg).toBe(plan.fragranceTotalMg);
  });

  it("parts are ignored for a single-component blend (treated as 100)", () => {
    const odd: PlanInput = {
      ...WE_1.input,
      waxes: [{ componentId: "wax-a", partsX100: 12_345 }],
      oils: [{ componentId: "oil-1", partsX100: 7 }],
    };
    expect(okPlan(odd)).toEqual(okPlan(WE_1.input));
  });

  it("vessels mode gives the same plan as the equivalent total", () => {
    const vessels: PlanInput = { ...WE_1.input, sizing: { mode: "vessels", count: 5, fillMg: 100_000 } };
    expect(okPlan(vessels)).toEqual(okPlan(WE_1.input));
  });
});

describe("TEST-02 percentage of total mixture", () => {
  it("WE-2: 500 g total, 8% of total mixture", () => {
    const plan = expectExample(WE_2);
    expect(plan.fragranceTotalMg).toBe(40_000);
    expect(plan.waxTotalMg).toBe(460_000);
    expect(plan.equivalentX100).toBe(870);
    expect(plan.effectiveDiffers).toBe(false);
  });

  it("WE-2 differs from WE-1 by 3.0 g of fragrance (the reason bases are labelled)", () => {
    const one = okPlan(WE_1.input);
    const two = okPlan(WE_2.input);
    expect(two.fragranceTotalMg - one.fragranceTotalMg).toBe(3_000);
  });

  it("WE-4: 450 g wax, 10% of total mixture", () => {
    const plan = expectExample(WE_4);
    expect(plan.fragranceTotalMg).toBe(50_000);
    expect(plan.totalMg).toBe(500_000);
    expect(plan.equivalentX100).toBe(1111);
  });
});

describe("sizingTotalMg", () => {
  it("returns T for total and vessels modes", () => {
    expect(sizingTotalMg({ mode: "total", amountMg: 500_000 })).toBe(500_000);
    expect(sizingTotalMg({ mode: "vessels", count: 6, fillMg: 180_000 })).toBe(1_080_000);
    expect(sizingTotalMg({ mode: "vessels", count: 9999, fillMg: 100_000 })).toBe(999_900_000);
  });
  it("returns null for wax mode", () => {
    expect(sizingTotalMg({ mode: "wax", amountMg: 450_000 })).toBeNull();
  });
});

describe("computePlan documented throws", () => {
  const base = WE_1.input;
  it("throws RangeError for a non-integer amount", () => {
    expect(() => computePlan({ ...base, sizing: { mode: "total", amountMg: 500_000.5 } })).toThrow(RangeError);
  });
  it("throws RangeError when there are no waxes", () => {
    expect(() => computePlan({ ...base, waxes: [] })).toThrow(RangeError);
  });
  it("throws RangeError when scented with no oils", () => {
    expect(() => computePlan({ ...base, oils: [] })).toThrow(RangeError);
  });
  it("throws RangeError when parts sum to 0", () => {
    const zero: PlanInput = {
      ...base,
      waxes: [
        { componentId: "a", partsX100: 0 },
        { componentId: "b", partsX100: 0 },
      ],
    };
    expect(() => computePlan(zero)).toThrow(RangeError);
  });
});

describe("computePlan not-ok results", () => {
  it("no-wax (V-14): the planned wax is not above 0 g", () => {
    // 1 g total, 50% of total mixture at 1 g: F = 0.5 g rounds half up to 1 g, W = 0.
    const result = computePlan({
      sizing: { mode: "total", amountMg: 1_000 },
      fragranceBp: 5_000,
      basis: "total",
      precisionMg: 1000,
      waxes: [{ componentId: "w", partsX100: 100 }],
      oils: [{ componentId: "o", partsX100: 100 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("no-wax");
  });

  it("zero-component (V-15, WE-13): 5 g total, 1% of wax, 1 g precision", () => {
    const result = computePlan({
      sizing: { mode: "total", amountMg: 5_000 },
      fragranceBp: 100,
      basis: "wax",
      precisionMg: 1000,
      waxes: [{ componentId: "wax-a", partsX100: 100 }],
      oils: [{ componentId: "oil-1", partsX100: 100 }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("zero-component");
      expect(result.componentIds).toEqual(["oil-1"]);
    }
  });

  it("zero-component lists every component that rounds to 0 g, in order", () => {
    // Wax mode 1000 g, 0.01% of wax = 0.1 g of fragrance at 0.1 g, oils 1:1:1.
    // Quotas 0.0333 each round down to 0; the one spare step goes to the first.
    const result = computePlan({
      sizing: { mode: "wax", amountMg: 1_000_000 },
      fragranceBp: 1,
      basis: "wax",
      precisionMg: 100,
      waxes: [{ componentId: "w", partsX100: 100 }],
      oils: [
        { componentId: "a", partsX100: 100 },
        { componentId: "b", partsX100: 100 },
        { componentId: "c", partsX100: 100 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("zero-component");
      expect(result.componentIds).toEqual(["b", "c"]);
    }
  });
});

describe("TEST-03 basis conversion table (CALC-04)", () => {
  const wax: [number, number][] = [
    [600, 566],
    [800, 741],
    [1000, 909],
    [1200, 1071],
  ];
  const total: [number, number][] = [
    [600, 638],
    [800, 870],
    [1000, 1111],
    [1200, 1364],
  ];

  it.each(wax)("%i of wax weight is %i of total mixture", (bp, expected) => {
    expect(convertBasis(bp, "wax")).toBe(expected);
  });

  it.each(total)("%i of total mixture is %i of wax weight", (bp, expected) => {
    expect(convertBasis(bp, "total")).toBe(expected);
  });

  it("zero converts to zero", () => {
    expect(convertBasis(0, "wax")).toBe(0);
    expect(convertBasis(0, "total")).toBe(0);
  });

  it("matches integer reference arithmetic, half up, for every percentage from 0.01% to 50%", () => {
    // p_total = p / (1 + p); p_wax = p / (1 - p), all in hundredths of a percent.
    const halfUp = (num: number, den: number) => Math.floor((2 * num + den) / (2 * den));
    for (let bp = 1; bp <= 5000; bp++) {
      expect(convertBasis(bp, "wax")).toBe(halfUp(10_000 * bp, 10_000 + bp));
      expect(convertBasis(bp, "total")).toBe(halfUp(10_000 * bp, 10_000 - bp));
    }
  });
});
