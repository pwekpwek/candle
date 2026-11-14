/**
 * TEST-07: planned versus measured (WE-8, CALC-18 to CALC-22), plus V-16
 * through parseMeasured. Needs T09's parseMeasured and compareMeasured.
 */
import { describe, expect, it } from "vitest";
import {
  compareMeasured,
  formatMeasured,
  formatSignedGrams,
  formatSignedPercent2,
  parseMeasured,
} from "@/lib/gramguard";
import type { CompareInput } from "@/lib/gramguard";
import { WE_8, WE_8_PARTIAL } from "../../fixtures/worked-examples";
import { deepFreeze } from "./helpers";

describe("TEST-07 WE-8, every row", () => {
  const result = compareMeasured(WE_8.compareInput, WE_8.entries);

  it("lists waxes then oils, in version order", () => {
    expect(result.components.map((c) => [c.componentId, c.kind])).toEqual([
      ["wax-a", "wax"],
      ["oil-a", "oil"],
      ["oil-b", "oil"],
      ["oil-c", "oil"],
    ]);
  });

  it.each(WE_8.components.map((c) => [c.componentId, c] as const))("row %s", (_id, line) => {
    const got = result.components.find((c) => c.componentId === line.componentId);
    expect(got).toBeDefined();
    expect(got).toMatchObject({
      kind: line.kind,
      targetMg: line.targetMg,
      actualMg: line.actualMg,
      diffMg: line.diffMg,
      diffX100: line.diffX100,
      flagged: line.flagged,
      direction: line.direction,
    });
  });

  it("Wax: +3.2 g (+0.32%), not flagged (limit 20.0 g)", () => {
    const c = result.components[0];
    expect(formatSignedGrams(c.diffMg as number, 100)).toBe("+3.2 g");
    expect(formatSignedPercent2(c.diffX100 as number)).toBe("+0.32");
    expect(c.flagged).toBe(false);
    expect(c.direction).toBeNull();
  });

  it("Oil A: +0.4 g (+1.00%), not flagged (limit 0.8 g)", () => {
    const c = result.components[1];
    expect(formatSignedGrams(c.diffMg as number, 100)).toBe("+0.4 g");
    expect(formatSignedPercent2(c.diffX100 as number)).toBe("+1.00");
    expect(c.flagged).toBe(false);
  });

  it("Oil B: -0.6 g (-2.25%), flagged under (limit 0.534 g)", () => {
    const c = result.components[2];
    expect(formatSignedGrams(c.diffMg as number, 100)).toBe("-0.6 g");
    expect(formatSignedPercent2(c.diffX100 as number)).toBe("-2.25");
    expect(c.flagged).toBe(true);
    expect(c.direction).toBe("under");
  });

  it("Oil C: +0.6 g (+4.51%), flagged over (limit 0.266 g)", () => {
    const c = result.components[3];
    expect(formatSignedGrams(c.diffMg as number, 100)).toBe("+0.6 g");
    expect(formatSignedPercent2(c.diffX100 as number)).toBe("+4.51");
    expect(c.flagged).toBe(true);
    expect(c.direction).toBe("over");
  });

  it("Fragrance total: 80.0 g planned, 80.4 g measured, +0.4 g (+0.50%)", () => {
    expect(result.fragrance).toEqual({ targetMg: 80_000, actualMg: 80_400, diffMg: 400, diffX100: 50 });
    expect(formatSignedPercent2(50)).toBe("+0.50");
  });

  it("Total mixture: 1080.0 g planned, 1083.6 g measured, +3.6 g (+0.33%)", () => {
    expect(result.total).toEqual({ targetMg: 1_080_000, actualMg: 1_083_600, diffMg: 3_600, diffX100: 33 });
  });

  it("actual blend: 8.01% of wax weight, 7.42% of total mixture, on both bases", () => {
    expect(result.actualBlend).not.toBeNull();
    const b = result.actualBlend!;
    expect(b.waxMg).toBe(1_003_200);
    expect(b.fragranceMg).toBe(80_400);
    expect(b.totalMg).toBe(1_083_600);
    expect(b.ofWaxX100).toBe(801);
    expect(b.ofTotalX100).toBe(742);
  });

  it("actual oil shares: 50.25%, 32.46%, 17.29%", () => {
    expect(result.actualBlend!.oilShares).toEqual([
      { componentId: "oil-a", shareX100: 5025 },
      { componentId: "oil-b", shareX100: 3246 },
      { componentId: "oil-c", shareX100: 1729 },
    ]);
  });

  it("matches the fixture end to end", () => {
    expect(result.fragrance).toEqual(WE_8.fragrance);
    expect(result.total).toEqual(WE_8.total);
    expect(result.actualBlend).toEqual(WE_8.actualBlend);
  });

  it("the plan's own targets are echoed unchanged (CALC-22)", () => {
    expect(result.components.map((c) => c.targetMg)).toEqual([1_000_000, 40_000, 26_700, 13_300]);
  });
});

describe("TEST-07 partial entry", () => {
  const result = compareMeasured(WE_8_PARTIAL.compareInput, WE_8_PARTIAL.entries);

  it("only wax and oil A entered: two differences show", () => {
    const measured = result.components.filter((c) => c.diffMg !== null);
    expect(measured.map((c) => c.componentId)).toEqual(["wax-a", "oil-a"]);
    expect(measured.map((c) => c.diffMg)).toEqual([3_200, 400]);
    expect(measured.map((c) => c.diffX100)).toEqual([32, 100]);
  });

  it("unmeasured components have no actual, difference, flag or direction", () => {
    for (const id of ["oil-b", "oil-c"]) {
      const c = result.components.find((x) => x.componentId === id)!;
      expect(c.actualMg).toBeNull();
      expect(c.diffMg).toBeNull();
      expect(c.diffX100).toBeNull();
      expect(c.flagged).toBeFalsy();
      expect(c.direction).toBeNull();
    }
  });

  it("fragrance, total and actualBlend are null", () => {
    expect(result.fragrance).toBeNull();
    expect(result.total).toBeNull();
    expect(result.actualBlend).toBeNull();
  });

  it("no entries at all: every component unmeasured, all summaries null", () => {
    const none = compareMeasured(WE_8.compareInput, []);
    expect(none.components).toHaveLength(4);
    expect(none.components.every((c) => c.actualMg === null && c.diffMg === null)).toBe(true);
    expect(none.fragrance).toBeNull();
    expect(none.total).toBeNull();
    expect(none.actualBlend).toBeNull();
  });

  it("all oils measured but no wax: fragrance shows, total and actualBlend do not", () => {
    const r = compareMeasured(WE_8.compareInput, WE_8.entries.filter((e) => e.componentId !== "wax-a"));
    expect(r.fragrance).toEqual(WE_8.fragrance);
    expect(r.total).toBeNull();
    expect(r.actualBlend).toBeNull();
  });

  it("wax and two of three oils: fragrance, total and actualBlend are null", () => {
    const r = compareMeasured(WE_8.compareInput, WE_8.entries.filter((e) => e.componentId !== "oil-c"));
    expect(r.fragrance).toBeNull();
    expect(r.total).toBeNull();
    expect(r.actualBlend).toBeNull();
  });

  it("entries for unknown ids are ignored", () => {
    const r = compareMeasured(WE_8.compareInput, [
      ...WE_8.entries,
      { componentId: "not-a-component", actualMg: 12_345 },
    ]);
    expect(r).toEqual(compareMeasured(WE_8.compareInput, WE_8.entries));
    expect(r.components).toHaveLength(4);
  });
});

describe("CALC-22 compareMeasured never changes its inputs", () => {
  it("does not mutate the plan or the entries (deep-frozen inputs do not throw)", () => {
    const plan = deepFreeze(JSON.parse(JSON.stringify(WE_8.compareInput)) as CompareInput);
    const entries = deepFreeze(JSON.parse(JSON.stringify(WE_8.entries)) as typeof WE_8.entries);
    expect(() => compareMeasured(plan, entries)).not.toThrow();
    expect(plan).toEqual(WE_8.compareInput);
    expect(entries).toEqual(WE_8.entries);
  });

  it("is repeatable: the same inputs give equal results", () => {
    expect(compareMeasured(WE_8.compareInput, WE_8.entries)).toEqual(
      compareMeasured(WE_8.compareInput, WE_8.entries),
    );
  });
});

describe("CALC-21 flag boundaries (strictly greater than the larger of one step or 2% of target)", () => {
  /** One wax, one oil. The wax is the component under test. */
  const input = (precisionMg: 1000 | 100 | 10, waxTargetMg: number): CompareInput => ({
    precisionMg,
    totalMg: waxTargetMg + 10_000,
    waxTotalMg: waxTargetMg,
    fragranceTotalMg: 10_000,
    waxes: [{ componentId: "w", targetMg: waxTargetMg }],
    oils: [{ componentId: "o", targetMg: 10_000 }],
  });
  const flagFor = (precisionMg: 1000 | 100 | 10, target: number, diff: number) =>
    compareMeasured(input(precisionMg, target), [{ componentId: "w", actualMg: target + diff }]).components[0];

  it("2% limit dominates: target 10.0 g at 0.1 g has limit 200 mg", () => {
    expect(flagFor(100, 10_000, 200).flagged).toBe(false); // exactly at the limit
    expect(flagFor(100, 10_000, -200).flagged).toBe(false);
    const over = flagFor(100, 10_000, 201);
    expect(over.flagged).toBe(true);
    expect(over.direction).toBe("over");
    const under = flagFor(100, 10_000, -201);
    expect(under.flagged).toBe(true);
    expect(under.direction).toBe("under");
  });

  it("precision step dominates: target 1.0 g at 0.1 g has limit 100 mg (2% is only 20 mg)", () => {
    expect(flagFor(100, 1_000, 100).flagged).toBe(false);
    expect(flagFor(100, 1_000, -100).flagged).toBe(false);
    expect(flagFor(100, 1_000, 101).flagged).toBe(true);
    expect(flagFor(100, 1_000, -101).direction).toBe("under");
  });

  it("1 g precision: limit is 1000 mg until 2% of target exceeds it", () => {
    expect(flagFor(1000, 10_000, 1000).flagged).toBe(false);
    expect(flagFor(1000, 10_000, 1001).flagged).toBe(true);
    // Target 100 g: 2% is 2000 mg, which exceeds one step.
    expect(flagFor(1000, 100_000, 2000).flagged).toBe(false);
    expect(flagFor(1000, 100_000, 2001).flagged).toBe(true);
  });

  it("0.01 g precision: step is 10 mg", () => {
    expect(flagFor(10, 100, 10).flagged).toBe(false);
    expect(flagFor(10, 100, 11).flagged).toBe(true);
  });

  it("a measured weight equal to the target is not flagged and has no direction", () => {
    const c = flagFor(100, 10_000, 0);
    expect(c.flagged).toBe(false);
    expect(c.direction).toBeNull();
    expect(c.diffMg).toBe(0);
    expect(c.diffX100).toBe(0);
  });

  it("direction is null whenever the component is not flagged", () => {
    const c = flagFor(100, 10_000, 150);
    expect(c.flagged).toBe(false);
    expect(c.direction).toBeNull();
  });
});

describe("CALC-19 percentage rounding and a zero target", () => {
  const input: CompareInput = {
    precisionMg: 100,
    totalMg: 40_000,
    waxTotalMg: 20_000,
    fragranceTotalMg: 20_000,
    waxes: [{ componentId: "w", targetMg: 20_000 }],
    oils: [{ componentId: "o", targetMg: 20_000 }],
  };

  it("rounds half away from zero: +1 mg on 20.0 g is exactly +0.005%, which is +0.01", () => {
    const up = compareMeasured(input, [{ componentId: "w", actualMg: 20_001 }]).components[0];
    expect(up.diffX100).toBe(1);
  });

  it("rounds half away from zero: -1 mg on 20.0 g is -0.01, not 0", () => {
    const down = compareMeasured(input, [{ componentId: "w", actualMg: 19_999 }]).components[0];
    expect(down.diffX100).toBe(-1);
  });

  it("a target of 0 gives no percentage", () => {
    const zero: CompareInput = { ...input, waxes: [{ componentId: "w", targetMg: 0 }], waxTotalMg: 0 };
    const c = compareMeasured(zero, [{ componentId: "w", actualMg: 500 }]).components[0];
    expect(c.diffMg).toBe(500);
    expect(c.diffX100).toBeNull();
  });
});

describe("CALC-20 actual blend edge cases", () => {
  it("zero actual wax: ofWaxX100 is null", () => {
    const input: CompareInput = {
      precisionMg: 100,
      totalMg: 10_000,
      waxTotalMg: 9_000,
      fragranceTotalMg: 1_000,
      waxes: [{ componentId: "w", targetMg: 9_000 }],
      oils: [{ componentId: "o", targetMg: 1_000 }],
    };
    const b = compareMeasured(input, [
      { componentId: "w", actualMg: 0 },
      { componentId: "o", actualMg: 1_000 },
    ]).actualBlend!;
    expect(b.ofWaxX100).toBeNull();
    expect(b.ofTotalX100).toBe(10_000);
  });

  it("zero actual fragrance: oilShares is empty", () => {
    const input: CompareInput = {
      precisionMg: 100,
      totalMg: 10_000,
      waxTotalMg: 9_000,
      fragranceTotalMg: 1_000,
      waxes: [{ componentId: "w", targetMg: 9_000 }],
      oils: [{ componentId: "o", targetMg: 1_000 }],
    };
    const b = compareMeasured(input, [
      { componentId: "w", actualMg: 9_000 },
      { componentId: "o", actualMg: 0 },
    ]).actualBlend!;
    expect(b.oilShares).toEqual([]);
    expect(b.ofWaxX100).toBe(0);
    expect(b.ofTotalX100).toBe(0);
  });

  it("an unscented plan (no oils) has no fragrance row", () => {
    const input: CompareInput = {
      precisionMg: 100,
      totalMg: 300_000,
      waxTotalMg: 300_000,
      fragranceTotalMg: 0,
      waxes: [{ componentId: "w", targetMg: 300_000 }],
      oils: [],
    };
    const r = compareMeasured(input, [{ componentId: "w", actualMg: 300_100 }]);
    expect(r.fragrance).toBeNull();
  });
});

describe("parseMeasured (V-16, V-01, CALC-18)", () => {
  const ok = (text: string) => parseMeasured(text, "measured.wax-a");

  it("empty text means not measured and is valid", () => {
    expect(ok("")).toEqual({ ok: true, actualMg: null });
  });

  it("whitespace-only text also means not measured", () => {
    expect(ok("   ")).toEqual({ ok: true, actualMg: null });
  });

  it.each([
    ["1003.2", 1_003_200],
    ["40.4", 40_400],
    ["26.1", 26_100],
    ["13.9", 13_900],
    ["26.15", 26_150],
    ["0", 0],
    ["0.01", 10],
    [".5", 500],
    ["5.", 5_000],
    [" 12.5 ", 12_500],
    ["26.150", 26_150],
    ["1000000", 1_000_000_000],
  ])("accepts %j", (text, mg) => {
    expect(ok(text)).toEqual({ ok: true, actualMg: mg });
  });

  it("accepts up to 2 decimals whatever the formula precision (no precision argument)", () => {
    expect(parseMeasured("40.45", "measured.oil-a")).toEqual({ ok: true, actualMg: 40_450 });
  });

  it.each(["-2", "+5", "1,000", "1 000", "1e3", "abc", "."])("%j breaks V-01 on the given field", (text) => {
    const r = ok(text);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issue.rule).toBe("V-01");
      expect(r.issue.field).toBe("measured.wax-a");
      expect(r.issue.severity).toBe("error");
    }
  });

  it.each(["26.155", "1.001", "1000000.01", "1000001", "99999999999999999999"])(
    "%j breaks V-16 (more than 2 decimals, or above 1 000 000 g)",
    (text) => {
      const r = ok(text);
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.issue.rule).toBe("V-16");
        expect(r.issue.field).toBe("measured.wax-a");
        expect(r.issue.severity).toBe("error");
      }
    },
  );

  it("reports the field it was given", () => {
    const r = parseMeasured("-2", "measured.oil-b");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issue.field).toBe("measured.oil-b");
  });
});

describe("measured formatting of the WE-8 figures", () => {
  it("formatMeasured shows what was typed, at least the formula's decimals", () => {
    expect(formatMeasured(1_003_200, 100)).toBe("1003.2");
    expect(formatMeasured(26_100, 100)).toBe("26.1");
    expect(formatMeasured(80_400, 100)).toBe("80.4");
    expect(formatMeasured(1_083_600, 100)).toBe("1083.6");
  });
});
