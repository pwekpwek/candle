import { describe, expect, it } from "vitest";
import {
  computePlan,
  convertBasis,
  sizingTotalMg,
  type Plan,
  type PlanInput,
  type PlanResult,
} from "@/lib/gramguard";
import type { Basis, PrecisionMg } from "@/lib/types";

const G = 1000; // mg per gram

function oils(...parts: number[]) {
  return parts.map((p, i) => ({ componentId: `o${i + 1}`, partsX100: p * 100 }));
}
function waxes(...parts: number[]) {
  return parts.map((p, i) => ({ componentId: `w${i + 1}`, partsX100: p * 100 }));
}
function plan(result: PlanResult): Plan {
  if (!result.ok) throw new Error(`plan failed: ${result.reason}`);
  return result.plan;
}
const targets = (c: { targetMg: number }[]) => c.map((x) => x.targetMg);
const shares = (c: { shareX100: number }[]) => c.map((x) => x.shareX100);

const base = (over: Partial<PlanInput>): PlanInput => ({
  sizing: { mode: "total", amountMg: 500 * G },
  fragranceBp: 800,
  basis: "wax",
  precisionMg: 100,
  waxes: waxes(100),
  oils: oils(100),
  ...over,
});

describe("worked examples (spec section 9)", () => {
  it("WE-1: 500 g total, 8% of wax weight", () => {
    const p = plan(computePlan(base({})));
    expect(p.fragranceTotalMg).toBe(37_000);
    expect(p.waxTotalMg).toBe(463_000);
    expect(p.totalMg).toBe(500_000);
    expect(p.equivalentX100).toBe(741); // 7.41% of total mixture
    expect(p.effectiveOfWaxX100).toBe(799); // 7.99%
    expect(p.effectiveOfTotalX100).toBe(740); // 7.40%
    expect(p.effectiveDiffers).toBe(true);
    expect(p.roundingWarning).toBe(false);
    expect(p.oilsIgnored).toBe(false);
    expect(targets(p.waxes)).toEqual([463_000]);
    expect(targets(p.oils)).toEqual([37_000]);
    expect(shares(p.waxes)).toEqual([10_000]);
    expect(shares(p.oils)).toEqual([10_000]);
  });

  it("WE-2: 500 g total, 8% of total mixture", () => {
    const p = plan(computePlan(base({ basis: "total" })));
    expect(p.fragranceTotalMg).toBe(40_000);
    expect(p.waxTotalMg).toBe(460_000);
    expect(p.equivalentX100).toBe(870); // 8.70% of wax weight
    expect(p.effectiveOfWaxX100).toBe(870);
    expect(p.effectiveOfTotalX100).toBe(800);
    expect(p.effectiveDiffers).toBe(false);
  });

  it("WE-3: 1000 g wax, 10% of wax weight", () => {
    const p = plan(
      computePlan(base({ sizing: { mode: "wax", amountMg: 1000 * G }, fragranceBp: 1000 })),
    );
    expect(p.fragranceTotalMg).toBe(100_000);
    expect(p.totalMg).toBe(1_100_000);
    expect(p.waxTotalMg).toBe(1_000_000);
    expect(p.equivalentX100).toBe(909);
    expect(p.effectiveOfTotalX100).toBe(909);
    expect(p.effectiveDiffers).toBe(false);
  });

  it("WE-4: 450 g wax, 10% of total mixture", () => {
    const p = plan(
      computePlan(
        base({ sizing: { mode: "wax", amountMg: 450 * G }, fragranceBp: 1000, basis: "total" }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(50_000);
    expect(p.totalMg).toBe(500_000);
    expect(p.equivalentX100).toBe(1111);
    expect(p.effectiveOfWaxX100).toBe(1111);
    expect(p.effectiveOfTotalX100).toBe(1000);
    expect(p.effectiveDiffers).toBe(false);
  });

  it("WE-5: 6 vessels x 180 g, 8% of wax weight, oils 3:2:1", () => {
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "vessels", count: 6, fillMg: 180 * G },
          oils: oils(3, 2, 1),
        }),
      ),
    );
    expect(p.totalMg).toBe(1_080_000);
    expect(p.fragranceTotalMg).toBe(80_000);
    expect(p.waxTotalMg).toBe(1_000_000);
    expect(targets(p.oils)).toEqual([40_000, 26_700, 13_300]);
    expect(shares(p.oils)).toEqual([5000, 3333, 1667]);
    expect(p.equivalentX100).toBe(741);
    expect(p.effectiveOfWaxX100).toBe(800);
    expect(p.effectiveOfTotalX100).toBe(741);
    expect(p.effectiveDiffers).toBe(false);
    expect(p.roundingWarning).toBe(false);
  });

  it("WE-6 at 0.1 g: 250 g total, 9% of total mixture, oils 50:30:20 (tie goes to the first)", () => {
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 250 * G },
          fragranceBp: 900,
          basis: "total",
          oils: oils(50, 30, 20),
        }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(22_500);
    expect(p.waxTotalMg).toBe(227_500);
    expect(p.equivalentX100).toBe(989);
    expect(p.effectiveOfWaxX100).toBe(989);
    expect(p.effectiveOfTotalX100).toBe(900);
    expect(targets(p.oils)).toEqual([11_300, 6_700, 4_500]);
    expect(shares(p.oils)).toEqual([5000, 3000, 2000]);
  });

  it("WE-6 at 0.01 g", () => {
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 250 * G },
          fragranceBp: 900,
          basis: "total",
          precisionMg: 10,
          oils: oils(50, 30, 20),
        }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(22_500);
    expect(p.waxTotalMg).toBe(227_500);
    expect(targets(p.oils)).toEqual([11_250, 6_750, 4_500]);
  });

  describe("WE-7: 50 g total, 6% of wax weight, oils 2:1", () => {
    const run = (precisionMg: PrecisionMg) =>
      plan(
        computePlan(
          base({
            sizing: { mode: "total", amountMg: 50 * G },
            fragranceBp: 600,
            precisionMg,
            oils: oils(2, 1),
          }),
        ),
      );

    it("at 1 g: warns (+6.00%)", () => {
      const p = run(1000);
      expect(p.fragranceTotalMg).toBe(3000);
      expect(p.waxTotalMg).toBe(47_000);
      expect(targets(p.oils)).toEqual([2000, 1000]);
      expect(p.effectiveOfWaxX100).toBe(638);
      expect(p.effectiveOfTotalX100).toBe(600);
      expect(p.effectiveDiffers).toBe(true);
      expect(p.roundingWarning).toBe(true);
    });

    it("at 0.1 g: no warning (-1.07%), effective differs", () => {
      const p = run(100);
      expect(p.fragranceTotalMg).toBe(2800);
      expect(p.waxTotalMg).toBe(47_200);
      expect(targets(p.oils)).toEqual([1900, 900]);
      expect(p.effectiveOfWaxX100).toBe(593);
      expect(p.effectiveOfTotalX100).toBe(560);
      expect(p.effectiveDiffers).toBe(true);
      expect(p.roundingWarning).toBe(false);
    });

    it("at 0.01 g: no warning (-0.01%), effective matches", () => {
      const p = run(10);
      expect(p.fragranceTotalMg).toBe(2830);
      expect(p.waxTotalMg).toBe(47_170);
      expect(targets(p.oils)).toEqual([1890, 940]);
      expect(p.effectiveOfWaxX100).toBe(600);
      expect(p.effectiveOfTotalX100).toBe(566);
      expect(p.effectiveDiffers).toBe(false);
      expect(p.roundingWarning).toBe(false);
    });
  });

  it("WE-9a: WE-5 scaled to 10 vessels (recomputed, not multiplied)", () => {
    const p = plan(
      computePlan(
        base({ sizing: { mode: "vessels", count: 10, fillMg: 180 * G }, oils: oils(3, 2, 1) }),
      ),
    );
    expect(p.totalMg).toBe(1_800_000);
    expect(p.fragranceTotalMg).toBe(133_300);
    expect(p.waxTotalMg).toBe(1_666_700);
    expect(targets(p.oils)).toEqual([66_700, 44_400, 22_200]);
  });

  it("WE-9b: WE-5 at 540 g", () => {
    const p = plan(
      computePlan(base({ sizing: { mode: "total", amountMg: 540 * G }, oils: oils(3, 2, 1) })),
    );
    expect(p.fragranceTotalMg).toBe(40_000);
    expect(p.waxTotalMg).toBe(500_000);
    expect(targets(p.oils)).toEqual([20_000, 13_300, 6_700]);
  });

  it("WE-9c: WE-1 at 625 g", () => {
    const p = plan(computePlan(base({ sizing: { mode: "total", amountMg: 625 * G } })));
    expect(p.fragranceTotalMg).toBe(46_300);
    expect(p.waxTotalMg).toBe(578_700);
  });

  it("WE-9d: 500.0 g (333.3 g x 1.5 after half-up rounding) behaves as WE-1", () => {
    const p = plan(computePlan(base({ sizing: { mode: "total", amountMg: 500_000 } })));
    expect(p.fragranceTotalMg).toBe(37_000);
    expect(p.waxTotalMg).toBe(463_000);
  });

  it("WE-10: wax blend 70:30, one oil", () => {
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 800 * G },
          fragranceBp: 1000,
          waxes: waxes(70, 30),
          oils: oils(1),
        }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(72_700);
    expect(p.waxTotalMg).toBe(727_300);
    expect(targets(p.waxes)).toEqual([509_100, 218_200]);
    expect(shares(p.waxes)).toEqual([7000, 3000]);
    expect(targets(p.oils)).toEqual([72_700]);
    expect(p.effectiveOfWaxX100).toBe(1000);
    expect(p.effectiveOfTotalX100).toBe(909);
  });

  it("WE-11: unscented", () => {
    const p = plan(
      computePlan(
        base({ sizing: { mode: "total", amountMg: 300 * G }, fragranceBp: 0, oils: [] }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(0);
    expect(p.waxTotalMg).toBe(300_000);
    expect(p.totalMg).toBe(300_000);
    expect(p.oils).toEqual([]);
    expect(p.equivalentX100).toBe(0);
    expect(p.effectiveOfWaxX100).toBe(0);
    expect(p.effectiveOfTotalX100).toBe(0);
    expect(p.effectiveDiffers).toBe(false);
    expect(p.roundingWarning).toBe(false);
    expect(p.oilsIgnored).toBe(false);
  });

  it("WE-12: 100 g, 8.25% of wax weight, oils 60:40, 0.01 g", () => {
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 100 * G },
          fragranceBp: 825,
          precisionMg: 10,
          oils: oils(60, 40),
        }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(7620);
    expect(p.waxTotalMg).toBe(92_380);
    expect(targets(p.oils)).toEqual([4570, 3050]);
    expect(p.effectiveOfWaxX100).toBe(825);
    expect(p.effectiveOfTotalX100).toBe(762);
    expect(p.effectiveDiffers).toBe(false);
  });
});

describe("failure and edge cases", () => {
  it("WE-13: 5 g total, 1% of wax at 1 g rounds the oil to 0 g (CALC-14 / V-15)", () => {
    const r = computePlan(
      base({
        sizing: { mode: "total", amountMg: 5 * G },
        fragranceBp: 100,
        precisionMg: 1000,
        oils: oils(1),
      }),
    );
    expect(r).toEqual({ ok: false, reason: "zero-component", componentIds: ["o1"] });
  });

  it("lists every zero component, waxes before oils, in order", () => {
    const r = computePlan({
      sizing: { mode: "total", amountMg: 50 * G },
      fragranceBp: 600,
      basis: "wax",
      precisionMg: 1000,
      // 9999 : 0.01 splits 47 g into 47 g and about 0 g
      waxes: [
        { componentId: "w1", partsX100: 999_900 },
        { componentId: "w2", partsX100: 100 },
      ],
      // 3 g in 99:1:1 leaves two oils at 0 g
      oils: [
        { componentId: "o1", partsX100: 9900 },
        { componentId: "o2", partsX100: 100 },
        { componentId: "o3", partsX100: 100 },
      ],
    });
    expect(r).toEqual({ ok: false, reason: "zero-component", componentIds: ["w2", "o2", "o3"] });
  });

  it("V-14: no wax when the batch amount is 0 g", () => {
    expect(computePlan(base({ sizing: { mode: "total", amountMg: 0 } }))).toEqual({
      ok: false,
      reason: "no-wax",
      componentIds: [],
    });
    expect(computePlan(base({ sizing: { mode: "wax", amountMg: 0 } }))).toEqual({
      ok: false,
      reason: "no-wax",
      componentIds: [],
    });
  });

  it("V-14: no wax when rounding the fragrance leaves nothing", () => {
    // 0.1 g total, 50% of total: exact F = 0.05 g rounds half up to 0.1 g, leaving 0 g of wax.
    const r = computePlan(
      base({
        sizing: { mode: "total", amountMg: 100 },
        fragranceBp: 5000,
        basis: "total",
        precisionMg: 100,
      }),
    );
    expect(r).toEqual({ ok: false, reason: "no-wax", componentIds: [] });
  });

  it("CALC-17: oils are ignored and flagged when fragrance is 0%", () => {
    const p = plan(
      computePlan(
        base({ sizing: { mode: "total", amountMg: 300 * G }, fragranceBp: 0, oils: oils(3, 2) }),
      ),
    );
    expect(p.oils).toEqual([]);
    expect(p.oilsIgnored).toBe(true);
    expect(p.fragranceTotalMg).toBe(0);
  });

  it("a single component ignores its stated parts (treated as 100)", () => {
    const p = plan(
      computePlan(
        base({
          waxes: [{ componentId: "w1", partsX100: 1 }],
          oils: [{ componentId: "o1", partsX100: 999_999 }],
        }),
      ),
    );
    expect(targets(p.waxes)).toEqual([463_000]);
    expect(targets(p.oils)).toEqual([37_000]);
    expect(shares(p.oils)).toEqual([10_000]);
  });

  it("breaks largest-remainder ties toward the earlier component", () => {
    // 0.4 g of fragrance over three equal oils at 0.1 g: quotas 0.1333 each, floors 0.1,
    // equal remainders, the one spare step goes to the first listed.
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "wax", amountMg: 100 * G },
          fragranceBp: 40,
          oils: oils(1, 1, 1),
        }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(400);
    expect(targets(p.oils)).toEqual([200, 100, 100]);
  });

  it("CALC-13 is strict: a move of exactly 2.0% does not warn, just above does", () => {
    // 50 g total, 2% of wax at 1 g: exact F = 50000/51 mg, rounded F = 1000 mg,
    // and 1000 = 1.02 x 50000/51 exactly, so the move is exactly +2.0%.
    const exact = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 50 * G },
          fragranceBp: 200,
          precisionMg: 1000,
        }),
      ),
    );
    expect(exact.fragranceTotalMg).toBe(1000);
    expect(exact.roundingWarning).toBe(false);
    // 49 g: exact F = 0.9608 g, rounded 1 g, moved +4.08%.
    const above = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 49 * G },
          fragranceBp: 200,
          precisionMg: 1000,
        }),
      ),
    );
    expect(above.fragranceTotalMg).toBe(1000);
    expect(above.roundingWarning).toBe(true);
  });

  it("a total-basis exact tie: 2.5 g at 1 g rounds half up to 3 g", () => {
    const p = plan(
      computePlan(
        base({
          sizing: { mode: "total", amountMg: 50 * G },
          fragranceBp: 500,
          basis: "total",
          precisionMg: 1000,
        }),
      ),
    );
    expect(p.fragranceTotalMg).toBe(3000);
    expect(p.waxTotalMg).toBe(47_000);
  });

  it("throws on programming errors", () => {
    expect(() => computePlan(base({ waxes: [] }))).toThrow(RangeError);
    expect(() => computePlan(base({ oils: [] }))).toThrow(RangeError);
    expect(() => computePlan(base({ fragranceBp: 1.5 }))).toThrow(RangeError);
    expect(() => computePlan(base({ waxes: waxes(0, 0) }))).toThrow(RangeError);
  });
});

describe("sizingTotalMg", () => {
  it("returns T for total and vessels modes and null for wax mode", () => {
    expect(sizingTotalMg({ mode: "total", amountMg: 500_000 })).toBe(500_000);
    expect(sizingTotalMg({ mode: "vessels", count: 6, fillMg: 180_000 })).toBe(1_080_000);
    expect(sizingTotalMg({ mode: "wax", amountMg: 450_000 })).toBeNull();
  });
});

describe("convertBasis (CALC-04)", () => {
  it("matches the spec's conversion table", () => {
    const fromWax: [number, number][] = [
      [600, 566],
      [800, 741],
      [1000, 909],
      [1200, 1071],
    ];
    const fromTotal: [number, number][] = [
      [600, 638],
      [800, 870],
      [1000, 1111],
      [1200, 1364],
    ];
    for (const [bp, expected] of fromWax) expect(convertBasis(bp, "wax"), `wax ${bp}`).toBe(expected);
    for (const [bp, expected] of fromTotal) {
      expect(convertBasis(bp, "total"), `total ${bp}`).toBe(expected);
    }
    expect(convertBasis(0, "wax")).toBe(0);
    expect(convertBasis(0, "total")).toBe(0);
    expect(convertBasis(825, "wax")).toBe(762); // WE-12
  });

  it("throws for a total-mixture percentage of 100% or more", () => {
    expect(() => convertBasis(10_000, "total")).toThrow(RangeError);
  });
});

describe("property: components always add up", () => {
  // Small deterministic generator so failures reproduce.
  let seed = 123_456_789;
  const next = (n: number) => {
    seed = (Math.imul(seed, 1_103_515_245) + 12_345) & 0x7fffffff;
    return seed % n;
  };

  it("holds over 3000 random valid inputs", () => {
    const precisions: PrecisionMg[] = [1000, 100, 10];
    const bases: Basis[] = ["wax", "total"];
    let okCount = 0;
    for (let i = 0; i < 3000; i++) {
      const precisionMg = precisions[next(3)]!;
      const basis = bases[next(2)]!;
      const steps = 1 + next(2_000_000); // amount in precision steps
      const amountMg = steps * precisionMg;
      const mode = next(3);
      const sizing =
        mode === 0
          ? ({ mode: "total", amountMg } as const)
          : mode === 1
            ? ({ mode: "wax", amountMg } as const)
            : ({ mode: "vessels", count: 1 + next(50), fillMg: (1 + next(5000)) * precisionMg } as const);
      const nWax = 1 + next(5);
      const nOil = 1 + next(10);
      const mk = (prefix: string, n: number) =>
        Array.from({ length: n }, (_, k) => ({
          componentId: `${prefix}${k}`,
          partsX100: 1 + next(999_999),
        }));
      const input: PlanInput = {
        sizing,
        fragranceBp: next(4) === 0 ? 0 : next(5001),
        basis,
        precisionMg,
        waxes: mk("w", nWax),
        oils: mk("o", nOil),
      };
      const result = computePlan(input);
      if (!result.ok) continue;
      okCount++;
      const p = result.plan;
      const sum = (c: { targetMg: number }[]) => c.reduce((a, b) => a + b.targetMg, 0);
      expect(sum(p.waxes)).toBe(p.waxTotalMg);
      expect(sum(p.oils)).toBe(p.fragranceTotalMg);
      expect(p.totalMg).toBe(p.waxTotalMg + p.fragranceTotalMg);
      expect(p.waxTotalMg).toBeGreaterThan(0);
      expect(p.fragranceTotalMg % precisionMg).toBe(0);
      expect(p.waxTotalMg % precisionMg).toBe(0);
      for (const c of [...p.waxes, ...p.oils]) {
        expect(c.targetMg).toBeGreaterThan(0);
        expect(c.targetMg % precisionMg).toBe(0);
      }
      // Each component is within one step of its exact quota (largest remainder).
      const near = (comps: typeof p.waxes, inputs: typeof input.waxes, total: number) => {
        const parts = inputs.length === 1 ? [100] : inputs.map((x) => x.partsX100);
        const psum = BigInt(parts.reduce((a, b) => a + b, 0));
        comps.forEach((c, k) => {
          const diff = BigInt(c.targetMg) * psum - BigInt(total) * BigInt(parts[k]!);
          const abs = diff < BigInt(0) ? -diff : diff;
          expect(abs < BigInt(precisionMg) * psum).toBe(true);
        });
      };
      near(p.waxes, input.waxes, p.waxTotalMg);
      if (input.fragranceBp > 0) near(p.oils, input.oils, p.fragranceTotalMg);
      else expect(p.oils).toEqual([]);
      if (p.oils.length > 1) {
        // Shares are half-up, so their sum is within the number of components of 100%.
        const total = p.oils.reduce((a, b) => a + b.shareX100, 0);
        expect(Math.abs(total - 10_000)).toBeLessThanOrEqual(p.oils.length);
      }
    }
    expect(okCount).toBeGreaterThan(1000);
  });
});
