/**
 * TEST-08: scaling (WE-9a to 9d, CALC-23 to CALC-26) and V-17, plus the
 * "scale.*" validation fields. Needs T09's evaluateScale.
 */
import { describe, expect, it } from "vitest";
import { evaluateScale, formatFactor } from "@/lib/gramguard";
import type { Issue, ScaleFields } from "@/lib/gramguard";
import type { Sizing } from "@/lib/types";
import {
  ALL_SCALE_EXAMPLES,
  WE_1,
  WE_3,
  WE_5,
  WE_9A,
  WE_9B,
  WE_9C,
  WE_9D,
} from "../../fixtures/worked-examples";
import type { ScaleExample } from "../../fixtures/worked-examples";
import { expectPlanMatches, okPlan } from "./helpers";

const total = (g: number): Sizing => ({ mode: "total", amountMg: g * 1000 });
const wax = (g: number): Sizing => ({ mode: "wax", amountMg: g * 1000 });
const vessels = (count: number, fillG: number): Sizing => ({ mode: "vessels", count, fillMg: fillG * 1000 });

function findIssue(issues: Issue[], rule: string, field: string): Issue | undefined {
  return issues.find((i) => i.rule === rule && i.field === field);
}

describe("TEST-08 WE-9 scaling, then computePlan on the new sizing", () => {
  it("9a: WE-5 from 6 to 10 vessels", () => {
    const r = evaluateScale(WE_5.input.sizing, 100, { method: "vesselCount", count: "10", fill: "" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(WE_9A.newSizing);
    expect(r.scale).toEqual({ method: "vesselCount", factorX10000: 16_667 });
    expect(formatFactor(r.scale!.factorX10000)).toBe("1.67");
    const plan = okPlan({ ...WE_5.input, sizing: r.sizing! });
    expectPlanMatches(plan, WE_9A.expect);
    expect(plan.oils.map((o) => o.targetMg)).toEqual([66_700, 44_400, 22_200]);
    expect(plan.fragranceTotalMg).toBe(133_300);
    expect(plan.waxTotalMg).toBe(1_666_700);
  });

  it("9b: WE-5 halved (3 vessels at the same fill)", () => {
    const r = evaluateScale(WE_5.input.sizing, 100, { method: "vesselCount", count: "3", fill: "" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(WE_9B.newSizing);
    expect(r.scale).toEqual({ method: "vesselCount", factorX10000: 5_000 });
    expectPlanMatches(okPlan({ ...WE_5.input, sizing: r.sizing! }), WE_9B.expect);
  });

  it("9b: the same half batch by keeping 6 vessels at a 90 g fill", () => {
    const r = evaluateScale(WE_5.input.sizing, 100, { method: "vesselCount", count: "6", fill: "90" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(vessels(6, 90));
    expect(r.scale).toEqual({ method: "vesselCount", factorX10000: 5_000 });
    expectPlanMatches(okPlan({ ...WE_5.input, sizing: r.sizing! }), WE_9B.expect);
  });

  it("9c: WE-1 times 1.25 is 625 g total", () => {
    const r = evaluateScale(WE_1.input.sizing, 100, { method: "multiplier", multiplier: "1.25" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(WE_9C.newSizing);
    expect(r.scale).toEqual({ method: "multiplier", factorX10000: 12_500 });
    const plan = okPlan({ ...WE_1.input, sizing: r.sizing! });
    expectPlanMatches(plan, WE_9C.expect);
    expect(plan.fragranceTotalMg).toBe(46_300);
    expect(plan.waxTotalMg).toBe(578_700);
  });

  it("9d: 333.3 g times 1.5 is 499.95 g, which rounds half up to 500.0 g", () => {
    const r = evaluateScale(total(333.3), 100, { method: "multiplier", multiplier: "1.5" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual({ mode: "total", amountMg: 500_000 });
    // New amount over old amount: 500.0 / 333.3 = 1.500150..., so 15001.5002, half up 15002.
    expect(r.scale).toEqual({ method: "multiplier", factorX10000: 15_002 });
    expectPlanMatches(okPlan({ ...WE_1.input, sizing: r.sizing! }), WE_9D.expect);
  });

  it("every ScaleExample fixture reproduces through evaluateScale", () => {
    const sources: Record<string, Sizing> = {
      "WE-5": WE_5.input.sizing,
      "WE-1": WE_1.input.sizing,
    };
    for (const ex of ALL_SCALE_EXAMPLES as readonly ScaleExample[]) {
      const source = ex.id === "WE-9d" ? total(333.3) : sources[ex.sourceId];
      let fields: ScaleFields;
      if (ex.method === "vesselCount") {
        fields = { method: "vesselCount", count: String(ex.newVesselCount), fill: "" };
      } else {
        const x = ex.multiplierX100 as number;
        fields = {
          method: "multiplier",
          multiplier: `${Math.floor(x / 100)}${x % 100 === 0 ? "" : "." + String(x % 100).padStart(2, "0")}`,
        };
      }
      const r = evaluateScale(source, 100, fields);
      expect(r.issues, ex.id).toEqual([]);
      expect(r.sizing, ex.id).toEqual(ex.newSizing);
      expect(r.scale, ex.id).toEqual({ method: ex.method, factorX10000: ex.factorX10000 });
    }
  });
});

describe("CALC-26 recompute, never multiply rounded weights", () => {
  it("multiplying the rounded WE-5 oil weights by 10/6 gives 66.7, 44.5, 22.2 (sum 133.4)", () => {
    const wrong = [40_000, 26_700, 13_300].map((mg) => Math.round(((mg * 10) / 6) / 100) * 100);
    expect(wrong).toEqual([66_700, 44_500, 22_200]);
    expect(wrong.reduce((a, b) => a + b, 0)).toBe(133_400);
  });

  it("the engine's result differs and adds up to the planned fragrance total", () => {
    const r = evaluateScale(WE_5.input.sizing, 100, { method: "vesselCount", count: "10", fill: "" });
    const plan = okPlan({ ...WE_5.input, sizing: r.sizing! });
    const oils = plan.oils.map((o) => o.targetMg);
    expect(oils).not.toEqual([66_700, 44_500, 22_200]);
    expect(WE_9A.forbidden?.oilsMg).toEqual([66_700, 44_500, 22_200]);
    expect(oils).toEqual([66_700, 44_400, 22_200]);
    expect(oils.reduce((a, b) => a + b, 0)).toBe(plan.fragranceTotalMg);
    expect(plan.fragranceTotalMg).toBe(133_300);
  });

  it("only the batch size changes: percentage, basis, precision and parts are untouched", () => {
    const r = evaluateScale(WE_5.input.sizing, 100, { method: "vesselCount", count: "10", fill: "" });
    const plan = okPlan({ ...WE_5.input, sizing: r.sizing! });
    expect(plan.fragranceBp).toBe(800);
    expect(plan.basis).toBe("wax");
    expect(plan.precisionMg).toBe(100);
    expect(plan.oils.map((o) => o.shareX100)).toEqual([5000, 3333, 1667]);
  });
});

describe("scaling methods by sizing mode (CALC-24)", () => {
  it("amount method in total mode", () => {
    const r = evaluateScale(total(500), 100, { method: "amount", amount: "625" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(total(625));
    expect(r.scale).toEqual({ method: "amount", factorX10000: 12_500 });
  });

  it("amount method in wax mode keeps the mode", () => {
    const r = evaluateScale(WE_3.input.sizing, 100, { method: "amount", amount: "1500" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(wax(1500));
    expect(r.scale).toEqual({ method: "amount", factorX10000: 15_000 });
  });

  it("multiplier method in wax mode keeps the mode", () => {
    const r = evaluateScale(wax(1000), 100, { method: "multiplier", multiplier: "0.5" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(wax(500));
    expect(r.scale).toEqual({ method: "multiplier", factorX10000: 5_000 });
  });

  it("vessels mode: a new count and a new fill together compare the totals", () => {
    // 6 x 180 g = 1080 g to 4 x 90 g = 360 g: 360 / 1080 = 0.33333, 3333 half up.
    const r = evaluateScale(vessels(6, 180), 100, { method: "vesselCount", count: "4", fill: "90" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(vessels(4, 90));
    expect(r.scale).toEqual({ method: "vesselCount", factorX10000: 3_333 });
  });

  it("a blank fill keeps the current fill", () => {
    const r = evaluateScale(vessels(6, 180), 100, { method: "vesselCount", count: "7", fill: "" });
    expect(r.sizing).toEqual(vessels(7, 180));
  });

  it("the multiplier rounds half up to the precision (1.5 g becomes 2 g at 1 g)", () => {
    const r = evaluateScale(total(3), 1000, { method: "multiplier", multiplier: "0.5" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(total(2));
    // 2 / 3 = 0.66667 -> 6667
    expect(r.scale).toEqual({ method: "multiplier", factorX10000: 6_667 });
  });

  it("the multiplier rounds to the formula's precision at 0.01 g", () => {
    // 12.34 g x 1.5 = 18.51 g exactly.
    const r = evaluateScale(total(12.34), 10, { method: "multiplier", multiplier: "1.5" });
    expect(r.sizing).toEqual({ mode: "total", amountMg: 18_510 });
  });

  it("the source sizing is not mutated", () => {
    const src = Object.freeze({ mode: "total", amountMg: 500_000 } as const);
    expect(() => evaluateScale(src, 100, { method: "multiplier", multiplier: "2" })).not.toThrow();
    expect(src).toEqual({ mode: "total", amountMg: 500_000 });
  });
});

describe("a method that does not fit the sizing mode is a programming error", () => {
  it("vesselCount on total mode throws", () => {
    expect(() => evaluateScale(total(500), 100, { method: "vesselCount", count: "3", fill: "" })).toThrow();
  });
  it("vesselCount on wax mode throws", () => {
    expect(() => evaluateScale(wax(500), 100, { method: "vesselCount", count: "3", fill: "" })).toThrow();
  });
  it("amount on vessels mode throws", () => {
    expect(() => evaluateScale(vessels(6, 180), 100, { method: "amount", amount: "100" })).toThrow();
  });
  it("multiplier on vessels mode throws", () => {
    expect(() => evaluateScale(vessels(6, 180), 100, { method: "multiplier", multiplier: "2" })).toThrow();
  });
});

describe("V-17 multiplier bounds", () => {
  it("0.01 is accepted", () => {
    const r = evaluateScale(total(500), 100, { method: "multiplier", multiplier: "0.01" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(total(5));
    expect(r.scale).toEqual({ method: "multiplier", factorX10000: 100 });
  });

  it("1000 is accepted", () => {
    const r = evaluateScale(total(500), 100, { method: "multiplier", multiplier: "1000" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual(total(500_000));
    expect(r.scale).toEqual({ method: "multiplier", factorX10000: 10_000_000 });
  });

  it.each(["0", "0.00", "0.001", "1000.01", "1001", "0.005"])("%j is rejected as V-17", (text) => {
    const r = evaluateScale(total(500), 100, { method: "multiplier", multiplier: text });
    expect(findIssue(r.issues, "V-17", "scale.multiplier")).toBeDefined();
    expect(r.sizing).toBeNull();
    expect(r.scale).toBeNull();
  });

  it.each(["1,5", "-1", "+2", "1e2", "abc", "."])("%j breaks V-01 on scale.multiplier", (text) => {
    const r = evaluateScale(total(500), 100, { method: "multiplier", multiplier: text });
    expect(findIssue(r.issues, "V-01", "scale.multiplier")).toBeDefined();
    expect(r.sizing).toBeNull();
    expect(r.scale).toBeNull();
  });

  it("a result that rounds to 0 g reports V-17", () => {
    // 0.1 g x 0.01 = 0.001 g, which rounds to 0.0 g at 0.1 g precision.
    const r = evaluateScale(total(0.1), 100, { method: "multiplier", multiplier: "0.01" });
    expect(findIssue(r.issues, "V-17", "scale.multiplier")).toBeDefined();
    expect(r.sizing).toBeNull();
  });

  it("a result above 1 000 000 g reports V-17", () => {
    const r = evaluateScale(total(2000), 100, { method: "multiplier", multiplier: "1000" });
    expect(findIssue(r.issues, "V-17", "scale.multiplier")).toBeDefined();
    expect(r.sizing).toBeNull();
  });

  it("a result of exactly 1 000 000 g is accepted", () => {
    const r = evaluateScale(total(1000), 100, { method: "multiplier", multiplier: "1000" });
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual({ mode: "total", amountMg: 1_000_000_000 });
  });
});

describe("new amount validation on scale.amount", () => {
  const amountIssue = (text: string, precisionMg: 1000 | 100 | 10 = 100) =>
    evaluateScale(total(500), precisionMg, { method: "amount", amount: text });

  it("empty and 0 are V-03", () => {
    for (const t of ["", "0", "0.0"]) {
      const r = amountIssue(t);
      expect(findIssue(r.issues, "V-03", "scale.amount"), t).toBeDefined();
      expect(r.sizing).toBeNull();
      expect(r.scale).toBeNull();
    }
  });

  it("above 1 000 000 g is V-03; exactly 1 000 000 g is accepted", () => {
    expect(findIssue(amountIssue("1000000.1").issues, "V-03", "scale.amount")).toBeDefined();
    expect(amountIssue("1000000").issues).toEqual([]);
  });

  it("a comma is V-01, not 1 g or 1000 g", () => {
    const r = amountIssue("1,000");
    expect(findIssue(r.issues, "V-01", "scale.amount")).toBeDefined();
    expect(r.sizing).toBeNull();
  });

  it("too many decimals is V-04 with the neighbours and the finer precision", () => {
    const r = amountIssue("500.55");
    const issue = findIssue(r.issues, "V-04", "scale.amount");
    expect(issue).toMatchObject({
      rule: "V-04",
      severity: "error",
      precisionMg: 100,
      lower: "500.5",
      upper: "500.6",
      finerPrecisionMg: 10,
    });
  });

  it("V-04 at 1 g: 500.5 sits between 500 and 501 and fits 0.1 g", () => {
    const issue = findIssue(amountIssue("500.5", 1000).issues, "V-04", "scale.amount");
    expect(issue).toMatchObject({ precisionMg: 1000, lower: "500", upper: "501", finerPrecisionMg: 100 });
  });

  it("V-04 with three decimals offers no finer precision", () => {
    const issue = findIssue(amountIssue("500.555", 10).issues, "V-04", "scale.amount");
    expect(issue).toMatchObject({ precisionMg: 10, lower: "500.55", upper: "500.56", finerPrecisionMg: null });
  });

  it("a valid amount at 0.01 g precision is accepted as typed", () => {
    const r = amountIssue("500.55", 10);
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual({ mode: "total", amountMg: 500_550 });
  });
});

describe("new count and fill validation on scale.count and scale.fill", () => {
  const scaleVessels = (count: string, fill: string) =>
    evaluateScale(vessels(6, 180), 100, { method: "vesselCount", count, fill });

  it.each(["", "0", "2.5", "10000", ".5"])("count %j is V-05 on scale.count", (text) => {
    const r = scaleVessels(text, "");
    expect(findIssue(r.issues, "V-05", "scale.count")).toBeDefined();
    expect(r.sizing).toBeNull();
    expect(r.scale).toBeNull();
  });

  it("count 1 and 9999 are accepted", () => {
    expect(scaleVessels("1", "").issues).toEqual([]);
    // 9999 x 100 g = 999 900 g, inside the 1 000 000 g limit (the kept 180 g fill would exceed it).
    expect(scaleVessels("9999", "100").issues).toEqual([]);
  });

  it.each(["1,000", "-2", "abc"])("count %j breaks V-01 on scale.count", (text) => {
    const r = scaleVessels(text, "");
    expect(findIssue(r.issues, "V-01", "scale.count")).toBeDefined();
  });

  it("fill 0 is V-06 as V-03 on scale.fill", () => {
    const r = scaleVessels("6", "0");
    expect(findIssue(r.issues, "V-06", "scale.fill")).toMatchObject({ rule: "V-06", as: "V-03" });
    expect(r.sizing).toBeNull();
  });

  it("fill with too many decimals is V-06 as V-04 on scale.fill", () => {
    const r = scaleVessels("6", "90.55");
    expect(findIssue(r.issues, "V-06", "scale.fill")).toMatchObject({
      rule: "V-06",
      as: "V-04",
      precisionMg: 100,
      lower: "90.5",
      upper: "90.6",
      finerPrecisionMg: 10,
    });
  });

  it("fill with a comma breaks V-01 on scale.fill", () => {
    const r = scaleVessels("6", "1,5");
    expect(findIssue(r.issues, "V-01", "scale.fill")).toBeDefined();
  });

  it("count times fill above 1 000 000 g is V-06 as V-03 on scale.fill", () => {
    const r = scaleVessels("9999", "101");
    expect(findIssue(r.issues, "V-06", "scale.fill")).toMatchObject({ as: "V-03" });
    expect(r.sizing).toBeNull();
  });

  it("a valid new fill is accepted", () => {
    const r = scaleVessels("6", "90.5");
    expect(r.issues).toEqual([]);
    expect(r.sizing).toEqual({ mode: "vessels", count: 6, fillMg: 90_500 });
  });
});
