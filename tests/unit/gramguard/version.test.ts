/**
 * emptyEditorFields, fieldsFromVersion, planInputFromVersion and
 * compareInputFromVersion. Needs T09's exports.
 */
import { describe, expect, it } from "vitest";
import {
  compareInputFromVersion,
  compareMeasured,
  computePlan,
  emptyEditorFields,
  evaluateFormula,
  fieldsFromVersion,
  planInputFromVersion,
} from "@/lib/gramguard";
import type { FormulaVersion, MaterialSnapshot, VersionInputs } from "@/lib/types";
import { WE_1, WE_5, WE_8 } from "../../fixtures/worked-examples";
import type { WorkedExample } from "../../fixtures/worked-examples";
import { expectPlanMatches, lookup } from "./helpers";

const snap = (type: MaterialSnapshot["type"], name: string): MaterialSnapshot => ({ type, name });

/** A version built by hand for a worked example, using the example's own component ids. */
function versionFor(ex: WorkedExample, materials: { waxes: string[]; oils: string[] }): FormulaVersion {
  const inputs: VersionInputs = {
    sizing: ex.input.sizing,
    fragranceBp: ex.input.fragranceBp,
    basis: ex.input.basis,
    precisionMg: ex.input.precisionMg,
    waxes: ex.input.waxes.map((w, i) => ({
      componentId: w.componentId,
      materialId: materials.waxes[i],
      snapshot: snap("wax", `Wax ${i}`),
      partsX100: w.partsX100,
    })),
    oils: ex.input.oils.map((o, i) => ({
      componentId: o.componentId,
      materialId: materials.oils[i],
      snapshot: snap("fragranceOil", `Oil ${i}`),
      partsX100: o.partsX100,
    })),
    wick: null,
    vessel: null,
    notes: "Hand-made",
  };
  return {
    id: "ver-1",
    formulaId: "f-1",
    number: 1,
    origin: "initial",
    parentVersionId: null,
    scale: null,
    createdAt: "2026-11-15T00:00:00.000Z",
    inputs,
    targets: {
      totalMg: ex.expect.totalMg,
      waxTotalMg: ex.expect.waxTotalMg,
      fragranceTotalMg: ex.expect.fragranceTotalMg,
      components: [
        ...ex.expect.waxes.map((c) => ({ componentId: c.componentId, targetMg: c.targetMg })),
        ...ex.expect.oils.map((c) => ({ componentId: c.componentId, targetMg: c.targetMg })),
      ],
    },
    calcVersion: 1,
  };
}

const we5Version = () => versionFor(WE_5, { waxes: ["wax-plain"], oils: ["oil-lav", "oil-van", "oil-cit"] });

function counter() {
  let n = 0;
  return () => `row-${++n}`;
}

describe("emptyEditorFields", () => {
  it("is a blank editor: total mode, wax basis, 0.1 g, one empty wax row, one empty oil row", () => {
    const f = emptyEditorFields(counter());
    expect(f.sizingMode).toBe("total");
    expect(f.basis).toBe("wax");
    expect(f.precisionMg).toBe(100);
    expect(f.waxes).toHaveLength(1);
    expect(f.oils).toHaveLength(1);
    expect(f.waxes[0].materialId).toBeNull();
    expect(f.oils[0].materialId).toBeNull();
    expect(f.waxes[0].parts).toBe("");
    expect(f.oils[0].parts).toBe("");
    expect(f.name).toBe("");
    expect(f.amount).toBe("");
    expect(f.fragrancePct).toBe("");
    expect(f.wickId).toBeNull();
    expect(f.vesselId).toBeNull();
    expect(f.notes).toBe("");
    expect(f.changeNote).toBe("");
  });

  it("gives the two rows different ids drawn from newRowId", () => {
    const f = emptyEditorFields(counter());
    expect(f.waxes[0].rowId).not.toBe(f.oils[0].rowId);
    expect(f.waxes[0].rowId).toMatch(/^row-\d+$/);
    expect(f.oils[0].rowId).toMatch(/^row-\d+$/);
  });

  it("evaluates to errors and no plan", () => {
    const ev = evaluateFormula(emptyEditorFields(counter()), lookup);
    expect(ev.issues.length).toBeGreaterThan(0);
    expect(ev.plan).toBeNull();
    expect(ev.input).toBeNull();
  });
});

describe("fieldsFromVersion", () => {
  it("reproduces a saved WE-5 version for Revise", () => {
    const f = fieldsFromVersion(we5Version(), counter());
    expect(f.sizingMode).toBe("vessels");
    expect(f.vesselCount).toBe("6");
    expect(f.fillWeight).toBe("180");
    expect(f.fragrancePct).toBe("8");
    expect(f.basis).toBe("wax");
    expect(f.precisionMg).toBe(100);
    expect(f.waxes.map((r) => r.materialId)).toEqual(["wax-plain"]);
    expect(f.oils.map((r) => r.materialId)).toEqual(["oil-lav", "oil-van", "oil-cit"]);
    expect(f.changeNote).toBe("");
    expect(f.notes).toBe("Hand-made");
    expect(f.wickId).toBeNull();
    expect(f.vesselId).toBeNull();
  });

  it("gives every row its own id", () => {
    const f = fieldsFromVersion(we5Version(), counter());
    const ids = [...f.waxes, ...f.oils].map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(4);
  });

  it("round trip: the fields evaluate to the WE-5 plan", () => {
    const f = { ...fieldsFromVersion(we5Version(), counter()), name: "Round trip" };
    const ev = evaluateFormula(f, lookup);
    expect(ev.issues).toEqual([]);
    expect(ev.plan).not.toBeNull();
    // The plan's component ids are the new row ids, in order.
    const rowIdOf = new Map<string, string>([
      ["wax-a", f.waxes[0].rowId],
      ["oil-a", f.oils[0].rowId],
      ["oil-b", f.oils[1].rowId],
      ["oil-c", f.oils[2].rowId],
    ]);
    expectPlanMatches(ev.plan!, WE_5.expect, (id) => rowIdOf.get(id)!);
    expect(ev.input!.sizing).toEqual({ mode: "vessels", count: 6, fillMg: 180_000 });
    expect(ev.input!.oils.map((o) => o.partsX100)).toEqual([300, 200, 100]);
  });

  it("total mode puts the amount in grams in the amount field", () => {
    const f = fieldsFromVersion(versionFor(WE_1, { waxes: ["wax-plain"], oils: ["oil-lav"] }), counter());
    expect(f.sizingMode).toBe("total");
    expect(f.amount).toBe("500");
    expect(f.fragrancePct).toBe("8");
  });

  it("carries wick and vessel ids when the version has them", () => {
    const v = we5Version();
    v.inputs.wick = { materialId: "wick-1", snapshot: snap("wick", "Wick") };
    v.inputs.vessel = { materialId: "vessel-1", snapshot: snap("vessel", "Jar") };
    const f = fieldsFromVersion(v, counter());
    expect(f.wickId).toBe("wick-1");
    expect(f.vesselId).toBe("vessel-1");
  });

  it("does not change the version", () => {
    const v = we5Version();
    const copy = JSON.parse(JSON.stringify(v));
    fieldsFromVersion(v, counter());
    expect(v).toEqual(copy);
  });
});

describe("planInputFromVersion", () => {
  it("keys the plan input by the version's component ids", () => {
    const input = planInputFromVersion(we5Version());
    expect(input).toEqual(WE_5.input);
  });

  it("the plan input computes the WE-5 plan", () => {
    const result = computePlan(planInputFromVersion(we5Version()));
    expect(result.ok).toBe(true);
    if (result.ok) expectPlanMatches(result.plan, WE_5.expect);
  });

  it("an unscented version has no oils", () => {
    const v = versionFor(WE_1, { waxes: ["wax-plain"], oils: ["oil-lav"] });
    v.inputs.fragranceBp = 0;
    v.inputs.oils = [];
    const input = planInputFromVersion(v);
    expect(input.fragranceBp).toBe(0);
    expect(input.oils).toEqual([]);
  });
});

describe("compareInputFromVersion", () => {
  it("reads the stored targets of WE-5 into the WE-8 plan", () => {
    expect(compareInputFromVersion(we5Version())).toEqual(WE_8.compareInput);
  });

  it("feeds compareMeasured to reproduce WE-8", () => {
    const r = compareMeasured(compareInputFromVersion(we5Version()), WE_8.entries);
    expect(r.actualBlend).toEqual(WE_8.actualBlend);
    expect(r.fragrance).toEqual(WE_8.fragrance);
  });

  it("uses the stored targets and never recalculates (CALC-22)", () => {
    const v = we5Version();
    // Store targets that the inputs would not produce today.
    v.targets = {
      totalMg: 1_081_000,
      waxTotalMg: 1_000_500,
      fragranceTotalMg: 80_500,
      components: [
        { componentId: "wax-a", targetMg: 1_000_500 },
        { componentId: "oil-a", targetMg: 40_500 },
        { componentId: "oil-b", targetMg: 26_500 },
        { componentId: "oil-c", targetMg: 13_500 },
      ],
    };
    const c = compareInputFromVersion(v);
    expect(c.totalMg).toBe(1_081_000);
    expect(c.waxTotalMg).toBe(1_000_500);
    expect(c.fragranceTotalMg).toBe(80_500);
    expect(c.waxes).toEqual([{ componentId: "wax-a", targetMg: 1_000_500 }]);
    expect(c.oils.map((o) => o.targetMg)).toEqual([40_500, 26_500, 13_500]);
    expect(c.precisionMg).toBe(100);
  });
});
