/**
 * TEST-04 (multi-oil split, remainder and tie handling), TEST-05 (small-blend
 * rounding at all three precisions, CALC-13), TEST-06 (wax blend, unscented).
 */
import { describe, expect, it } from "vitest";
import type { PlanInput } from "@/lib/gramguard";
import {
  WE_10,
  WE_11,
  WE_12,
  WE_5,
  WE_6,
  WE_6_HUNDREDTH,
  WE_7_0_01G,
  WE_7_0_1G,
  WE_7_1G,
} from "../../fixtures/worked-examples";
import { expectExample, okPlan } from "./helpers";

const sum = (xs: { targetMg: number }[]) => xs.reduce((s, c) => s + c.targetMg, 0);

describe("TEST-04 multi-oil split", () => {
  it("WE-5: 3 : 2 : 1 gives 40.0, 26.7, 13.3 (spare step to the largest remainder)", () => {
    const plan = expectExample(WE_5);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([40_000, 26_700, 13_300]);
    expect(sum(plan.oils)).toBe(80_000);
    expect(plan.oils.map((o) => o.shareX100)).toEqual([5000, 3333, 1667]);
  });

  it("WE-6 at 0.1 g: tie on remainder goes to the first listed", () => {
    const plan = expectExample(WE_6);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([11_300, 6_700, 4_500]);
    expect(sum(plan.oils)).toBe(22_500);
    expect(plan.fragranceTotalMg).toBe(22_500);
    expect(plan.waxTotalMg).toBe(227_500);
    expect(plan.equivalentX100).toBe(989);
  });

  it("WE-6 at 0.01 g: quotas are exact, no spare step", () => {
    const plan = expectExample(WE_6_HUNDREDTH);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([11_250, 6_750, 4_500]);
  });

  it("WE-6 tie: swapping the order of the tied oils moves the spare step to the new first", () => {
    const swapped: PlanInput = {
      ...WE_6.input,
      oils: [
        { componentId: "oil-b", partsX100: 3000 },
        { componentId: "oil-a", partsX100: 5000 },
        { componentId: "oil-c", partsX100: 2000 },
      ],
    };
    // Quotas are 6.75 (b), 11.25 (a), 4.50 (c). Floors 6.7, 11.2, 4.5 leave one step.
    // The first two tie on remainder, so the first listed (b) takes it.
    const plan = okPlan(swapped);
    expect(plan.oils.map((o) => [o.componentId, o.targetMg])).toEqual([
      ["oil-b", 6_800],
      ["oil-a", 11_200],
      ["oil-c", 4_500],
    ]);
    expect(sum(plan.oils)).toBe(22_500);
  });

  it("a three-way tie hands the leftover steps to the first listed, in order", () => {
    // Wax mode, 1000 g wax, 0.02% of wax = 0.20 g of fragrance at 0.01 g, oils 1 : 1 : 1.
    // Quotas 0.0667 g each. Floors 0.06 g leave two steps (0.02 g). Remainders tie, so a and b win.
    const plan = okPlan({
      sizing: { mode: "wax", amountMg: 1_000_000 },
      fragranceBp: 2,
      basis: "wax",
      precisionMg: 10,
      waxes: [{ componentId: "w", partsX100: 100 }],
      oils: [
        { componentId: "a", partsX100: 100 },
        { componentId: "b", partsX100: 100 },
        { componentId: "c", partsX100: 100 },
      ],
    });
    expect(plan.fragranceTotalMg).toBe(200);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([70, 70, 60]);
  });

  it("WE-12: 8.25% at 0.01 g, oils 60 : 40 give 4.57 g and 3.05 g", () => {
    const plan = expectExample(WE_12);
    expect(plan.fragranceTotalMg).toBe(7_620);
    expect(plan.waxTotalMg).toBe(92_380);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([4_570, 3_050]);
    expect(sum(plan.oils)).toBe(7_620);
  });

  it("parts need not add to 100, and scaling every part by the same factor changes nothing", () => {
    const a = okPlan(WE_5.input);
    const b = okPlan({
      ...WE_5.input,
      oils: WE_5.input.oils.map((o) => ({ ...o, partsX100: o.partsX100 * 10 })),
    });
    expect(b.oils).toEqual(a.oils);
    // 50 : 33.33 : 16.67 is also a valid way to write a blend (spec, section 1).
    const c = okPlan({
      ...WE_5.input,
      oils: [
        { componentId: "oil-a", partsX100: 5000 },
        { componentId: "oil-b", partsX100: 3333 },
        { componentId: "oil-c", partsX100: 1667 },
      ],
    });
    expect(sum(c.oils)).toBe(80_000);
    expect(c.oils.map((o) => o.shareX100)).toEqual([5000, 3333, 1667]);
  });

  it("shares are parts over the sum of parts, half up, in hundredths of a percent", () => {
    const plan = okPlan({
      ...WE_5.input,
      oils: [
        { componentId: "a", partsX100: 100 },
        { componentId: "b", partsX100: 100 },
        { componentId: "c", partsX100: 100 },
      ],
    });
    // 1/3 = 33.33%, half up.
    expect(plan.oils.map((o) => o.shareX100)).toEqual([3333, 3333, 3333]);
    const two = okPlan({
      ...WE_5.input,
      oils: [
        { componentId: "a", partsX100: 200 },
        { componentId: "b", partsX100: 100 },
      ],
    });
    // 2/3 = 66.67% (half up from 66.666...).
    expect(two.oils.map((o) => o.shareX100)).toEqual([6667, 3333]);
  });

  it("every component of a split sums to its total, across many parts patterns", () => {
    const patterns = [
      [1, 1, 1, 1, 1, 1, 1],
      [9999, 1, 1],
      [3, 3, 3, 1],
      [17, 31, 53],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    ];
    for (const p of patterns) {
      const plan = okPlan({
        sizing: { mode: "total", amountMg: 2_000_000 },
        fragranceBp: 1200,
        basis: "wax",
        precisionMg: 10,
        waxes: [{ componentId: "w", partsX100: 100 }],
        oils: p.map((x, i) => ({ componentId: `o${i}`, partsX100: x * 100 })),
      });
      expect(sum(plan.oils)).toBe(plan.fragranceTotalMg);
      expect(plan.waxTotalMg + plan.fragranceTotalMg).toBe(plan.totalMg);
    }
  });
});

describe("TEST-05 small-blend rounding (WE-7)", () => {
  it("1 g: F 3 g, W 47 g, oils 2 g and 1 g, 6.38% of wax, rounding warning on", () => {
    const plan = expectExample(WE_7_1G);
    expect(plan.fragranceTotalMg).toBe(3_000);
    expect(plan.waxTotalMg).toBe(47_000);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([2_000, 1_000]);
    expect(plan.effectiveOfWaxX100).toBe(638);
    expect(plan.roundingWarning).toBe(true);
  });

  it("0.1 g: F 2.8 g, W 47.2 g, oils 1.9 g and 0.9 g, 5.93% of wax, no warning", () => {
    const plan = expectExample(WE_7_0_1G);
    expect(plan.fragranceTotalMg).toBe(2_800);
    expect(plan.waxTotalMg).toBe(47_200);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([1_900, 900]);
    expect(plan.effectiveOfWaxX100).toBe(593);
    expect(plan.roundingWarning).toBe(false);
  });

  it("0.01 g: F 2.83 g, W 47.17 g, oils 1.89 g and 0.94 g, 6.00% of wax, no warning", () => {
    const plan = expectExample(WE_7_0_01G);
    expect(plan.fragranceTotalMg).toBe(2_830);
    expect(plan.waxTotalMg).toBe(47_170);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([1_890, 940]);
    expect(plan.effectiveOfWaxX100).toBe(600);
    expect(plan.effectiveDiffers).toBe(false);
    expect(plan.roundingWarning).toBe(false);
  });

  it("the warning is on exactly when rounding moved F by more than 2.00% (table column)", () => {
    for (const ex of [WE_7_1G, WE_7_0_1G, WE_7_0_01G]) {
      const moved = ex.roundingMovedFX100 as number;
      expect(okPlan(ex.input).roundingWarning).toBe(Math.abs(moved) > 200);
    }
  });

  it("CALC-13 looks at the fragrance total only: oil B moves 4.6% at 0.1 g and there is still no warning", () => {
    // Oil B exact quota 0.9434 g becomes 0.9 g, a 4.6% move; WE-7 says No warning.
    expect(okPlan(WE_7_0_1G.input).roundingWarning).toBe(false);
  });

  it("an exact tie at 2.00% does not warn; just past it does (strictly more than 2.0%)", () => {
    // 2% of wax weight, total mode, 1 g precision. Exact F = T / 51.
    const at = (totalG: number) =>
      okPlan({
        sizing: { mode: "total", amountMg: totalG * 1000 },
        fragranceBp: 200,
        basis: "wax",
        precisionMg: 1000,
        waxes: [{ componentId: "w", partsX100: 100 }],
        oils: [{ componentId: "o", partsX100: 100 }],
      });
    // 1250 g: F = 24509.8 mg rounds to 25000 mg, exactly +2.00% (25000 / 24509.8 = 1.02).
    const exact = at(1250);
    expect(exact.fragranceTotalMg).toBe(25_000);
    expect(exact.roundingWarning).toBe(false);
    // 1249 g: F = 24490.2 mg rounds to 24000 mg, -2.0016%.
    const over = at(1249);
    expect(over.fragranceTotalMg).toBe(24_000);
    expect(over.roundingWarning).toBe(true);
    // 1251 g: F = 24529.4 mg rounds to 25000 mg, +1.92%.
    const under = at(1251);
    expect(under.fragranceTotalMg).toBe(25_000);
    expect(under.roundingWarning).toBe(false);
  });

  it("an unscented plan never warns", () => {
    expect(okPlan(WE_11.input).roundingWarning).toBe(false);
  });
});

describe("TEST-06 wax blend and unscented", () => {
  it("WE-10: soy : coconut 70 : 30 gives 509.1 g and 218.2 g (spare step to coconut)", () => {
    const plan = expectExample(WE_10);
    expect(plan.waxTotalMg).toBe(727_300);
    expect(plan.fragranceTotalMg).toBe(72_700);
    expect(plan.waxes.map((w) => w.targetMg)).toEqual([509_100, 218_200]);
    expect(sum(plan.waxes)).toBe(727_300);
    expect(plan.waxes.map((w) => w.shareX100)).toEqual([7000, 3000]);
  });

  it("WE-11: unscented 300 g gives F 0.0 g, W 300.0 g", () => {
    const plan = expectExample(WE_11);
    expect(plan.fragranceTotalMg).toBe(0);
    expect(plan.waxTotalMg).toBe(300_000);
    expect(plan.oils).toEqual([]);
    expect(plan.oilsIgnored).toBe(false);
  });

  it("unscented with oils supplied at 0% ignores them and says so (CALC-17)", () => {
    const withOils: PlanInput = {
      ...WE_11.input,
      oils: [
        { componentId: "oil-1", partsX100: 100 },
        { componentId: "oil-2", partsX100: 100 },
      ],
    };
    const plan = okPlan(withOils);
    expect(plan.oilsIgnored).toBe(true);
    expect(plan.oils).toEqual([]);
    expect(plan.fragranceTotalMg).toBe(0);
    expect(plan.waxTotalMg).toBe(300_000);
    expect(plan.totalMg).toBe(300_000);
  });

  it("unscented in wax mode: T equals W", () => {
    const plan = okPlan({ ...WE_11.input, sizing: { mode: "wax", amountMg: 450_000 } });
    expect(plan.totalMg).toBe(450_000);
    expect(plan.waxTotalMg).toBe(450_000);
    expect(plan.fragranceTotalMg).toBe(0);
  });

  it("a wax split with one wax needs no parts, and five waxes split and sum", () => {
    const plan = okPlan({
      sizing: { mode: "total", amountMg: 1_000_000 },
      fragranceBp: 0,
      basis: "wax",
      precisionMg: 100,
      waxes: [1, 2, 3, 4, 5].map((n) => ({ componentId: `w${n}`, partsX100: n * 100 })),
      oils: [],
    });
    expect(plan.waxes).toHaveLength(5);
    expect(sum(plan.waxes)).toBe(1_000_000);
    // 1000 g split 1:2:3:4:5 is exactly 66.7 (66.666..), 133.3, 200.0, 266.7, 333.3 g before the spare step.
    expect(plan.waxes.map((w) => w.targetMg)).toEqual([66_700, 133_300, 200_000, 266_700, 333_300]);
  });
});
