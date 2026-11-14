/**
 * TEST-11, text-entry side: typed decimals reach the plan exactly. Needs T09's
 * evaluateFormula.
 */
import { describe, expect, it } from "vitest";
import { evaluateFormula } from "@/lib/gramguard";
import { baseFields, lookup } from "./helpers";

describe("TEST-11 typed decimals are exact through evaluateFormula", () => {
  it("4.35% becomes 435 hundredths, not 434.99999999999994, and plans as in the drift cases", () => {
    expect(4.35 * 100).not.toBe(435);
    const ev = evaluateFormula(
      baseFields({ amount: "10", fragrancePct: "4.35", basis: "total", precisionMg: 10 }),
      lookup,
    );
    expect(ev.issues).toEqual([]);
    expect(ev.input!.fragranceBp).toBe(435);
    // F = 0.435 g exactly, half up to 0.44 g; W = 9.56 g.
    expect(ev.plan!.fragranceTotalMg).toBe(440);
    expect(ev.plan!.waxTotalMg).toBe(9_560);
  });

  it("an amount of 1.001 g is rejected as V-04 at 0.1 g, not rounded", () => {
    const ev = evaluateFormula(baseFields({ amount: "1.001", precisionMg: 100 }), lookup);
    expect(ev.issues.some((i) => i.rule === "V-04" && i.field === "amount")).toBe(true);
  });

  it("an amount of 462.5 g is exactly 462500 mg", () => {
    const ev = evaluateFormula(baseFields({ amount: "462.5" }), lookup);
    expect(ev.input!.sizing).toEqual({ mode: "total", amountMg: 462_500 });
  });

  it("a fill of 0.1 g times 3 vessels is exactly 300 mg", () => {
    const ev = evaluateFormula(
      baseFields({ sizingMode: "vessels", vesselCount: "3", fillWeight: "0.1", fragrancePct: "0" , oils: [] }),
      lookup,
    );
    expect(ev.input!.sizing).toEqual({ mode: "vessels", count: 3, fillMg: 100 });
    expect(ev.plan!.totalMg).toBe(300);
  });
});
