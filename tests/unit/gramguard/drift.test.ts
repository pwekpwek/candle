/**
 * TEST-11: no floating-point drift. Targeted 0.1 g and 0.01 g cases that naive
 * binary floating-point arithmetic gets wrong. Expected values are exact decimal
 * arithmetic worked by hand (shown in the comments); where it makes the point,
 * the test also computes the naive float result and shows it differs.
 */
import { describe, expect, it } from "vitest";
import { computePlan, formatGrams, formatWeight, parseFixed } from "@/lib/gramguard";
import type { PlanInput, PlanResult } from "@/lib/gramguard";
import { WE_6, WE_6_HUNDREDTH } from "../../fixtures/worked-examples";
import { okPlan } from "./helpers";

/** What a naive implementation does: float percentage, float multiply, Math.round. */
const naiveRound = (grams: number, bp: number, stepsPerGram: number) =>
  Math.round(grams * (bp / 10_000) * stepsPerGram) / stepsPerGram;

const single = (
  sizing: PlanInput["sizing"],
  fragranceBp: number,
  basis: PlanInput["basis"],
  precisionMg: PlanInput["precisionMg"],
): PlanInput => ({
  sizing,
  fragranceBp,
  basis,
  precisionMg,
  waxes: [{ componentId: "w", partsX100: 100 }],
  oils: [{ componentId: "o", partsX100: 100 }],
});

describe("TEST-11 exact halves round up (CALC-08)", () => {
  it("2.25 g rounds to 2.3 g at 0.1 g: 25 g total, 9% of total mixture", () => {
    // F = 25 x 0.09 = 2.25 g exactly. Half up: 2.3 g. W = 25 - 2.3 = 22.7 g.
    const plan = okPlan(single({ mode: "total", amountMg: 25_000 }, 900, "total", 100));
    expect(plan.fragranceTotalMg).toBe(2_300);
    expect(plan.waxTotalMg).toBe(22_700);
  });

  it("1.35 g rounds to 1.4 g at 0.1 g (15 g total, 9% of total): naive floats give 1.3", () => {
    // F = 15 x 0.09 = 1.35 g exactly. Half up: 1.4 g. W = 13.6 g.
    const naive = naiveRound(15, 900, 10);
    expect(naive).toBe(1.3);
    const plan = okPlan(single({ mode: "total", amountMg: 15_000 }, 900, "total", 100));
    expect(plan.fragranceTotalMg).toBe(1_400);
    expect(plan.fragranceTotalMg / 1000).not.toBe(naive);
    expect(plan.waxTotalMg).toBe(13_600);
  });

  it("1.05 g rounds to 1.1 g at 0.1 g (12 g total, 8.75% of total): naive floats give 1.0", () => {
    // F = 12 x 0.0875 = 1.05 g exactly. Half up: 1.1 g. W = 10.9 g.
    const naive = naiveRound(12, 875, 10);
    expect(naive).toBe(1);
    const plan = okPlan(single({ mode: "total", amountMg: 12_000 }, 875, "total", 100));
    expect(plan.fragranceTotalMg).toBe(1_100);
    expect(plan.fragranceTotalMg / 1000).not.toBe(naive);
    expect(plan.waxTotalMg).toBe(10_900);
  });

  it("0.215 g rounds to 0.22 g at 0.01 g (10 g total, 2.15% of total): naive floats give 0.21", () => {
    // F = 10 x 0.0215 = 0.215 g exactly. Half up: 0.22 g. W = 9.78 g.
    const naive = naiveRound(10, 215, 100);
    expect(naive).toBe(0.21);
    const plan = okPlan(single({ mode: "total", amountMg: 10_000 }, 215, "total", 10));
    expect(plan.fragranceTotalMg).toBe(220);
    expect(plan.fragranceTotalMg / 1000).not.toBe(naive);
    expect(plan.waxTotalMg).toBe(9_780);
  });

  it("0.435 g rounds to 0.44 g at 0.01 g (10 g total, 4.35% of total): naive floats give 0.43", () => {
    // F = 10 x 0.0435 = 0.435 g exactly. Half up: 0.44 g. W = 9.56 g.
    const naive = naiveRound(10, 435, 100);
    expect(naive).toBe(0.43);
    const plan = okPlan(single({ mode: "total", amountMg: 10_000 }, 435, "total", 10));
    expect(plan.fragranceTotalMg).toBe(440);
    expect(plan.fragranceTotalMg / 1000).not.toBe(naive);
    expect(plan.waxTotalMg).toBe(9_560);
  });

  it("0.055 g rounds to 0.06 g at 0.01 g (10 g wax, 0.55% of wax): naive floats give 0.05", () => {
    // Wax mode: F = 10 x 0.0055 = 0.055 g exactly. Half up: 0.06 g. T = 10.06 g.
    const naive = naiveRound(10, 55, 100);
    expect(naive).toBe(0.05);
    const plan = okPlan(single({ mode: "wax", amountMg: 10_000 }, 55, "wax", 10));
    expect(plan.fragranceTotalMg).toBe(60);
    expect(plan.fragranceTotalMg / 1000).not.toBe(naive);
    expect(plan.totalMg).toBe(10_060);
  });
});

describe("TEST-11 ties in the largest-remainder split (WE-6)", () => {
  it("0.1 g: quotas 11.25 and 6.75 tie on remainder 0.05; the first listed takes the spare step", () => {
    const plan = okPlan(WE_6.input);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([11_300, 6_700, 4_500]);
  });

  it("0.01 g: the same quotas are exact: 11.25, 6.75, 4.50", () => {
    const plan = okPlan(WE_6_HUNDREDTH.input);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([11_250, 6_750, 4_500]);
  });

  it("parts of 0.1 : 0.2 : 0.3 split 1.2 g into exactly 0.2, 0.4 and 0.6 g", () => {
    // Exact quotas: 1.2 x 1/6 = 0.2, 1.2 x 2/6 = 0.4, 1.2 x 3/6 = 0.6. No spare step.
    // Naive floats: 1.2 x 0.1 / (0.1 + 0.2 + 0.3) x 10 = 1.9999999999999996, which floors to 1.
    const naiveFirst = Math.floor(((1.2 * 0.1) / (0.1 + 0.2 + 0.3)) * 10) / 10;
    expect(naiveFirst).toBe(0.1);
    // Wax mode: 1000 g wax at 0.12% of wax weight is exactly 1.2 g of fragrance.
    const plan = okPlan({
      sizing: { mode: "wax", amountMg: 1_000_000 },
      fragranceBp: 12,
      basis: "wax",
      precisionMg: 100,
      waxes: [{ componentId: "w", partsX100: 100 }],
      oils: [
        { componentId: "a", partsX100: 10 },
        { componentId: "b", partsX100: 20 },
        { componentId: "c", partsX100: 30 },
      ],
    });
    expect(plan.fragranceTotalMg).toBe(1_200);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([200, 400, 600]);
  });
});

describe("TEST-11 sums are exact integers", () => {
  it("0.1 g + 0.2 g is exactly 0.3 g (float: 0.30000000000000004)", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    // Wax mode 1000 g, 0.03% of wax is 0.3 g of fragrance, oils 1 : 2.
    const plan = okPlan({
      sizing: { mode: "wax", amountMg: 1_000_000 },
      fragranceBp: 3,
      basis: "wax",
      precisionMg: 100,
      waxes: [{ componentId: "w", partsX100: 100 }],
      oils: [
        { componentId: "a", partsX100: 100 },
        { componentId: "b", partsX100: 200 },
      ],
    });
    expect(plan.oils.map((o) => o.targetMg)).toEqual([100, 200]);
    expect(plan.oils[0].targetMg + plan.oils[1].targetMg).toBe(300);
    expect(plan.fragranceTotalMg).toBe(300);
    expect(plan.totalMg).toBe(1_000_300);
  });

  it("wax plus fragrance equals the total with no residue at 0.01 g", () => {
    // 100 g total, 8.25% of wax weight: F 7.62 g, W 92.38 g, which add to 100.00 g exactly.
    const result: PlanResult = computePlan({
      sizing: { mode: "total", amountMg: 100_000 },
      fragranceBp: 825,
      basis: "wax",
      precisionMg: 10,
      waxes: [{ componentId: "w", partsX100: 100 }],
      oils: [{ componentId: "o", partsX100: 100 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.fragranceTotalMg).toBe(7_620);
      expect(result.plan.waxTotalMg).toBe(92_380);
      expect(result.plan.waxTotalMg + result.plan.fragranceTotalMg).toBe(100_000);
    }
  });
});

describe("TEST-11 parsing is exact (x * 100 and x * 1000 misround in floats)", () => {
  it.each([
    ["4.35", 2, 435],
    ["1.15", 2, 115],
    ["0.29", 2, 29],
    ["0.57", 2, 57],
    ["1.005", 3, 1_005],
    ["1.001", 3, 1_001],
    ["0.07", 2, 7],
    ["8.25", 2, 825],
    ["462.5", 3, 462_500],
  ])("parseFixed(%j, %i) is exactly %i", (text, scale, expected) => {
    const r = parseFixed(text, scale);
    expect(r).toMatchObject({ ok: true, value: expected });
    expect(Number.isInteger((r as { value: number }).value)).toBe(true);
  });

  it("shows the naive parse is wrong for the cases above", () => {
    expect(Number("4.35") * 100).not.toBe(435);
    expect(Number("1.15") * 100).not.toBe(115);
    expect(Number("0.29") * 100).not.toBe(29);
    expect(Number("1.005") * 1000).not.toBe(1_005);
  });
});

describe("TEST-11 display never shows float noise", () => {
  it("formats exact multiples of 0.01 g", () => {
    expect(formatGrams(70, 10)).toBe("0.07 g");
    expect(formatGrams(290, 10)).toBe("0.29 g");
    expect(formatGrams(1_150, 10)).toBe("1.15 g");
    expect(formatWeight(4_350, 10)).toBe("4.35");
    expect(formatWeight(300, 100)).toBe("0.3");
  });
});
