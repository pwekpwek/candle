import { describe, expect, it } from "vitest";
import { compareMeasured, parseMeasured, type CompareInput } from "@/lib/gramguard";

const G = 1000;
const we5: CompareInput = {
  precisionMg: 100,
  totalMg: 1080 * G,
  waxTotalMg: 1000 * G,
  fragranceTotalMg: 80 * G,
  waxes: [{ componentId: "w", targetMg: 1000 * G }],
  oils: [
    { componentId: "a", targetMg: 40 * G },
    { componentId: "b", targetMg: 26.7 * G },
    { componentId: "c", targetMg: 13.3 * G },
  ],
};
const all = [
  { componentId: "w", actualMg: 1003200 },
  { componentId: "a", actualMg: 40400 },
  { componentId: "b", actualMg: 26100 },
  { componentId: "c", actualMg: 13900 },
];

describe("parseMeasured", () => {
  it("accepts empty, zero and decimals", () => {
    expect(parseMeasured("  ", "m")).toEqual({ ok: true, actualMg: null });
    expect(parseMeasured("0", "m")).toEqual({ ok: true, actualMg: 0 });
    expect(parseMeasured("26.15", "m")).toEqual({ ok: true, actualMg: 26150 });
    expect(parseMeasured("1000000", "m")).toEqual({ ok: true, actualMg: 1_000_000_000 });
  });
  it("rejects bad format with V-01, range and decimals with V-16", () => {
    expect(parseMeasured("-2", "f")).toEqual({
      ok: false,
      issue: { rule: "V-01", field: "f", severity: "error" },
    });
    expect(parseMeasured("1,5", "f").ok).toBe(false);
    expect(parseMeasured("1.234", "f")).toEqual({
      ok: false,
      issue: { rule: "V-16", field: "f", severity: "error" },
    });
    expect(parseMeasured("1.230", "f")).toEqual({ ok: true, actualMg: 1230 });
    expect(parseMeasured("1.2345", "f")).toEqual({
      ok: false,
      issue: { rule: "V-16", field: "f", severity: "error" },
    });
    expect(parseMeasured("1000000.01", "f")).toMatchObject({ ok: false, issue: { rule: "V-16" } });
  });
});

describe("compareMeasured (WE-8)", () => {
  const r = compareMeasured(we5, all);
  const by = (id: string) => r.components.find((c) => c.componentId === id)!;

  it("component differences and flags", () => {
    expect(by("w")).toMatchObject({ diffMg: 3200, diffX100: 32, flagged: false, direction: null, kind: "wax" });
    expect(by("a")).toMatchObject({ diffMg: 400, diffX100: 100, flagged: false });
    expect(by("b")).toMatchObject({ diffMg: -600, diffX100: -225, flagged: true, direction: "under", kind: "oil" });
    expect(by("c")).toMatchObject({ diffMg: 600, diffX100: 451, flagged: true, direction: "over" });
    expect(r.components.map((c) => c.componentId)).toEqual(["w", "a", "b", "c"]);
  });
  it("fragrance, total and actual blend", () => {
    expect(r.fragrance).toMatchObject({ actualMg: 80400, diffMg: 400, diffX100: 50 });
    expect(r.total).toMatchObject({ actualMg: 1083600, diffMg: 3600, diffX100: 33 });
    expect(r.actualBlend).toEqual({
      waxMg: 1003200,
      fragranceMg: 80400,
      totalMg: 1083600,
      ofWaxX100: 801,
      ofTotalX100: 742,
      oilShares: [
        { componentId: "a", shareX100: 5025 },
        { componentId: "b", shareX100: 3246 },
        { componentId: "c", shareX100: 1729 },
      ],
    });
  });
  it("partial entries show only component rows", () => {
    const p = compareMeasured(we5, all.slice(0, 2));
    expect(p.fragrance).toBeNull();
    expect(p.total).toBeNull();
    expect(p.actualBlend).toBeNull();
    expect(p.components[2]).toMatchObject({ actualMg: null, diffMg: null, flagged: false });
  });
  it("ignores unknown ids and lets the last entry win", () => {
    const p = compareMeasured(we5, [
      { componentId: "zzz", actualMg: 5 },
      { componentId: "w", actualMg: 1 },
      { componentId: "w", actualMg: 1003200 },
    ]);
    expect(p.components[0]!.actualMg).toBe(1003200);
    expect(p.components).toHaveLength(4);
  });
  it("flag needs both limits: one precision step and 2%", () => {
    // diff exactly 2% of 40 g = 0.8 g is not above; 0.9 g is.
    const t = compareMeasured(we5, [{ componentId: "a", actualMg: 40800 }]);
    expect(t.components[1]!.flagged).toBe(false);
    const u = compareMeasured(we5, [{ componentId: "a", actualMg: 40900 }]);
    expect(u.components[1]!.flagged).toBe(true);
  });
  it("handles unscented plans", () => {
    const r2 = compareMeasured(
      { ...we5, oils: [], fragranceTotalMg: 0, totalMg: 1000 * G },
      [{ componentId: "w", actualMg: 1000 * G }],
    );
    expect(r2.fragrance).toBeNull();
    expect(r2.total).toMatchObject({ diffMg: 0 });
    expect(r2.actualBlend).toMatchObject({ fragranceMg: 0, ofWaxX100: 0, oilShares: [] });
  });
});
