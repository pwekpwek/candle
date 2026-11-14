import { describe, expect, it } from "vitest";
import {
  compareInputFromVersion,
  computePlan,
  evaluateFormula,
  fieldsFromVersion,
  planInputFromVersion,
} from "@/lib/gramguard";
import type { Component, FormulaVersion } from "@/lib/types";

const snap = { type: "wax", name: "x" } as const;
const comp = (componentId: string, materialId: string, partsX100: number): Component => ({
  componentId,
  materialId,
  snapshot: { ...snap },
  partsX100,
});

const version: FormulaVersion = {
  id: "v1",
  formulaId: "f1",
  number: 1,
  origin: "initial",
  parentVersionId: null,
  scale: null,
  createdAt: "2026-11-15T00:00:00.000Z",
  calcVersion: 1,
  inputs: {
    sizing: { mode: "vessels", count: 6, fillMg: 180_000 },
    fragranceBp: 800,
    basis: "wax",
    precisionMg: 100,
    waxes: [comp("cw", "soy", 100)],
    oils: [comp("ca", "A", 300), comp("cb", "B", 200), comp("cc", "C", 100)],
    wick: { materialId: "wick1", snapshot: { type: "wick", name: "w" } },
    vessel: null,
    notes: "n",
  },
  targets: {
    totalMg: 1_080_000,
    waxTotalMg: 1_000_000,
    fragranceTotalMg: 80_000,
    components: [
      { componentId: "cw", targetMg: 1_000_000 },
      { componentId: "ca", targetMg: 40_000 },
      { componentId: "cb", targetMg: 26_700 },
      { componentId: "cc", targetMg: 13_300 },
    ],
  },
};

describe("from-version", () => {
  it("fieldsFromVersion reproduces the version", () => {
    let k = 0;
    const f = fieldsFromVersion(version, () => `row${++k}`);
    expect(f).toMatchObject({
      name: "",
      sizingMode: "vessels",
      amount: "",
      vesselCount: "6",
      fillWeight: "180",
      fragrancePct: "8",
      basis: "wax",
      precisionMg: 100,
      wickId: "wick1",
      vesselId: null,
      notes: "n",
      changeNote: "",
    });
    expect(f.waxes).toEqual([{ rowId: "row1", materialId: "soy", parts: "1" }]);
    expect(f.oils.map((o) => [o.materialId, o.parts])).toEqual([["A", "3"], ["B", "2"], ["C", "1"]]);
  });
  it("round-trips through evaluateFormula to the stored targets", () => {
    let k = 0;
    const f = { ...fieldsFromVersion(version, () => `row${++k}`), name: "WE-5" };
    const e = evaluateFormula(f, (id) => ({ id, type: "wax", name: id }));
    expect(e.issues).toEqual([]);
    expect(e.plan?.oils.map((o) => o.targetMg)).toEqual([40_000, 26_700, 13_300]);
    expect(e.input?.sizing).toEqual(version.inputs.sizing);
  });
  it("handles total mode, fractional values and no oils", () => {
    const v: FormulaVersion = {
      ...version,
      inputs: {
        ...version.inputs,
        sizing: { mode: "total", amountMg: 462_500 },
        fragranceBp: 825,
        oils: [],
        notes: undefined,
      },
    };
    const f = fieldsFromVersion(v, () => "r");
    expect(f).toMatchObject({ amount: "462.5", vesselCount: "", fillWeight: "", fragrancePct: "8.25", notes: "", oils: [] });
  });
  it("planInputFromVersion matches the saved targets", () => {
    const input = planInputFromVersion(version);
    expect(input.oils).toEqual([
      { componentId: "ca", partsX100: 300 },
      { componentId: "cb", partsX100: 200 },
      { componentId: "cc", partsX100: 100 },
    ]);
    const r = computePlan(input);
    expect(r.ok && r.plan.waxes[0]?.targetMg).toBe(1_000_000);
  });
  it("compareInputFromVersion reads stored targets", () => {
    expect(compareInputFromVersion(version)).toEqual({
      precisionMg: 100,
      totalMg: 1_080_000,
      waxTotalMg: 1_000_000,
      fragranceTotalMg: 80_000,
      waxes: [{ componentId: "cw", targetMg: 1_000_000 }],
      oils: [
        { componentId: "ca", targetMg: 40_000 },
        { componentId: "cb", targetMg: 26_700 },
        { componentId: "cc", targetMg: 13_300 },
      ],
    });
  });
});
