/**
 * TEST-09: every validation rule V-01 to V-17 and every row of the WE-13 table,
 * through evaluateFormula (and parseMeasured / evaluateScale for V-16 / V-17).
 * Needs T09's evaluateFormula. Each bullet of the EvaluateFormula doc comment
 * in contract.ts is a test below.
 */
import { describe, expect, it } from "vitest";
import { evaluateFormula, parseMeasured, evaluateScale } from "@/lib/gramguard";
import type { EditorFields, Evaluation, Issue } from "@/lib/gramguard";
import { WE_13, WE_5, WE_10, WE_12, ALL_WORKED_EXAMPLES } from "../../fixtures/worked-examples";
import { baseFields, expectPlanMatches, fieldsForInput, lookup, row } from "./helpers";

const run = (over: Partial<EditorFields> = {}): Evaluation => evaluateFormula(baseFields(over), lookup);

function find(list: Issue[], rule: string, field?: string): Issue | undefined {
  return list.find((i) => i.rule === rule && (field === undefined || i.field === field));
}
function rules(list: Issue[]): string[] {
  return list.map((i) => i.rule);
}

/** An evaluation that blocks saving: an error is present, input is null. */
function expectBlocked(ev: Evaluation, rule: string, field: string): Issue {
  const issue = find(ev.issues, rule, field);
  expect(issue, `expected ${rule} on ${field}, got ${JSON.stringify(ev.issues)}`).toBeDefined();
  expect(issue!.severity).toBe("error");
  expect(ev.input).toBeNull();
  return issue!;
}

describe("a valid formula", () => {
  it("returns no issues, a plan and the validated input", () => {
    const ev = run({ name: "  Lavender Soy  ", notes: "  some notes  ", changeNote: "first", wickId: "wick-1", vesselId: "v-1" });
    expect(ev.issues).toEqual([]);
    expect(ev.plan).not.toBeNull();
    expect(ev.input).toEqual({
      name: "Lavender Soy",
      sizing: { mode: "total", amountMg: 500_000 },
      fragranceBp: 800,
      basis: "wax",
      precisionMg: 100,
      waxes: [{ rowId: "w1", materialId: "wax-plain", partsX100: 100 }],
      oils: [{ rowId: "o1", materialId: "oil-lav", partsX100: 100 }],
      wickId: "wick-1",
      vesselId: "v-1",
      notes: "some notes",
      changeNote: "first",
    });
  });

  it("the plan uses the row ids as component ids and equals WE-1", () => {
    const ev = run();
    expect(ev.plan!.waxes.map((c) => c.componentId)).toEqual(["w1"]);
    expect(ev.plan!.oils.map((c) => c.componentId)).toEqual(["o1"]);
    expect(ev.plan!.fragranceTotalMg).toBe(37_000);
    expect(ev.plan!.waxTotalMg).toBe(463_000);
  });

  it("blank notes become an empty string", () => {
    expect(run({ notes: "   " }).input!.notes).toBe("");
  });

  it("every worked example entered as text reproduces its plan", () => {
    for (const ex of ALL_WORKED_EXAMPLES) {
      const ev = evaluateFormula(fieldsForInput(ex.input), lookup);
      expect(ev.issues, ex.id).toEqual([]);
      expect(ev.plan, ex.id).not.toBeNull();
      expectPlanMatches(ev.plan!, ex.expect);
      expect(ev.input, ex.id).not.toBeNull();
    }
  });

  it("vessels mode: 6 x 180 g gives the WE-5 plan and the vessels sizing", () => {
    const ev = evaluateFormula(fieldsForInput(WE_5.input), lookup);
    expect(ev.issues).toEqual([]);
    expect(ev.input!.sizing).toEqual({ mode: "vessels", count: 6, fillMg: 180_000 });
    expect(ev.input!.waxes[0].partsX100).toBe(100);
    expect(ev.input!.oils.map((o) => o.partsX100)).toEqual([300, 200, 100]);
  });

  it("wax blend: parts typed as text reach the validated rows in hundredths", () => {
    const ev = evaluateFormula(fieldsForInput(WE_10.input), lookup);
    expect(ev.input!.waxes.map((w) => w.partsX100)).toEqual([7000, 3000]);
  });

  it("two-decimal percentage and 0.01 g precision (WE-12)", () => {
    const ev = evaluateFormula(fieldsForInput(WE_12.input), lookup);
    expect(ev.input!.fragranceBp).toBe(825);
    expect(ev.input!.precisionMg).toBe(10);
  });
});

describe("V-02 formula name", () => {
  it.each(["", "   ", "\t \n"])("%j is V-02 on name", (name) => {
    expectBlocked(run({ name }), "V-02", "name");
  });
  it("81 characters is V-02; 80 is fine", () => {
    expectBlocked(run({ name: "x".repeat(81) }), "V-02", "name");
    expect(run({ name: "x".repeat(80) }).issues).toEqual([]);
  });
  it("the length is counted after trimming", () => {
    expect(run({ name: ` ${"x".repeat(80)} ` }).issues).toEqual([]);
  });
  it("the plan does not need the name", () => {
    const ev = run({ name: "" });
    expect(ev.plan).not.toBeNull();
    expect(ev.input).toBeNull();
  });
});

describe("V-01 any number field", () => {
  it.each(["1,000", "1e3", "-5", "+5", "1 000", "abc", "."])("amount %j is V-01, not V-03", (amount) => {
    const ev = run({ amount });
    expectBlocked(ev, "V-01", "amount");
    expect(find(ev.issues, "V-03", "amount")).toBeUndefined();
    expect(ev.plan).toBeNull();
  });

  it("vessel count and fill weight report V-01 on their own fields", () => {
    const ev = run({ sizingMode: "vessels", vesselCount: "1e3", fillWeight: "1,5" });
    expectBlocked(ev, "V-01", "vesselCount");
    expectBlocked(ev, "V-01", "fillWeight");
    expect(find(ev.issues, "V-05", "vesselCount")).toBeUndefined();
    expect(find(ev.issues, "V-06", "fillWeight")).toBeUndefined();
  });

  it.each(["1,5", "-2", "abc", "8%"])("fragrance %j is V-01, not V-07", (fragrancePct) => {
    const ev = run({ fragrancePct });
    expectBlocked(ev, "V-01", "fragrancePct");
    expect(find(ev.issues, "V-07", "fragrancePct")).toBeUndefined();
    expect(ev.plan).toBeNull();
  });

  it.each(["abc", "1,5", "-1", "1e1"])("parts %j is V-01, not V-12", (parts) => {
    const ev = run({ oils: [row("o1", "oil-lav", "3"), row("o2", "oil-van", parts)] });
    expectBlocked(ev, "V-01", "oils.o2.parts");
    expect(find(ev.issues, "V-12", "oils.o2.parts")).toBeUndefined();
    expect(ev.plan).toBeNull();
  });

  it("wax parts report V-01 on the wax row", () => {
    const ev = run({ waxes: [row("w1", "wax-plain", "x"), row("w2", "wax-coco", "1")] });
    expectBlocked(ev, "V-01", "waxes.w1.parts");
  });
});

describe("V-03 batch amount, total and wax modes", () => {
  it.each([
    ["total", "0"],
    ["total", ""],
    ["total", "0.0"],
    ["wax", "0"],
    ["wax", ""],
  ] as const)("%s mode amount %j is V-03 on amount, results empty", (sizingMode, amount) => {
    const ev = run({ sizingMode, amount });
    expectBlocked(ev, "V-03", "amount");
    expect(ev.plan).toBeNull();
  });

  it("above 1 000 000 g is V-03; exactly 1 000 000 g is fine", () => {
    expectBlocked(run({ amount: "1000000.1" }), "V-03", "amount");
    expect(find(run({ amount: "1000000" }).issues, "V-03")).toBeUndefined();
  });

  it("vessel-mode fields are ignored in total mode", () => {
    const ev = run({ sizingMode: "total", vesselCount: "abc", fillWeight: "" });
    expect(ev.issues).toEqual([]);
  });

  it("amount is ignored in vessels mode", () => {
    const ev = run({ sizingMode: "vessels", amount: "", vesselCount: "6", fillWeight: "180" });
    expect(ev.issues).toEqual([]);
  });
});

describe("V-04 decimals beyond the precision", () => {
  it("500.55 at 0.1 g (WE-13) names the neighbours and the finer precision", () => {
    const ev = run({ amount: "500.55", precisionMg: 100 });
    const issue = expectBlocked(ev, "V-04", "amount");
    expect(issue).toMatchObject({ precisionMg: 100, lower: "500.5", upper: "500.6", finerPrecisionMg: 10 });
    expect(ev.plan).toBeNull();
  });

  it("500.5 at 1 g: neighbours 500 and 501, finer precision 0.1 g", () => {
    const issue = expectBlocked(run({ amount: "500.5", precisionMg: 1000 }), "V-04", "amount");
    expect(issue).toMatchObject({ precisionMg: 1000, lower: "500", upper: "501", finerPrecisionMg: 100 });
  });

  it("500.55 at 1 g: the coarsest finer precision that fits two decimals is 0.01 g", () => {
    const issue = expectBlocked(run({ amount: "500.55", precisionMg: 1000 }), "V-04", "amount");
    expect(issue).toMatchObject({ lower: "500", upper: "501", finerPrecisionMg: 10 });
  });

  it("three decimals offer no finer precision", () => {
    const issue = expectBlocked(run({ amount: "500.555", precisionMg: 10 }), "V-04", "amount");
    expect(issue).toMatchObject({ lower: "500.55", upper: "500.56", finerPrecisionMg: null });
  });

  it("is not rounded silently, in wax mode too", () => {
    expectBlocked(run({ sizingMode: "wax", amount: "450.05" }), "V-04", "amount");
  });

  it("500.55 is fine at 0.01 g", () => {
    expect(run({ amount: "500.55", precisionMg: 10 }).issues).toEqual([]);
  });
});

describe("V-05 vessel count", () => {
  const vessels = (vesselCount: string, fillWeight = "100") =>
    run({ sizingMode: "vessels", vesselCount, fillWeight });

  it.each(["2.5", "0", "", "10000", ".5"])("count %j is V-05 on vesselCount (WE-13: 2.5)", (count) => {
    const ev = vessels(count);
    expectBlocked(ev, "V-05", "vesselCount");
    expect(ev.plan).toBeNull();
  });

  it("1 and 9999 are accepted", () => {
    expect(vessels("1").issues).toEqual([]);
    expect(vessels("9999").issues).toEqual([]);
  });
});

describe("V-06 fill weight", () => {
  const fill = (fillWeight: string, over: Partial<EditorFields> = {}) =>
    run({ sizingMode: "vessels", vesselCount: "6", fillWeight, ...over });

  it("empty and 0 are V-06 as V-03", () => {
    for (const t of ["", "0"]) {
      const ev = fill(t);
      const issue = expectBlocked(ev, "V-06", "fillWeight");
      expect(issue).toMatchObject({ rule: "V-06", as: "V-03" });
      expect(ev.plan).toBeNull();
    }
  });

  it("too many decimals is V-06 as V-04 with the V-04 details", () => {
    const issue = expectBlocked(fill("180.55"), "V-06", "fillWeight");
    expect(issue).toMatchObject({
      as: "V-04",
      precisionMg: 100,
      lower: "180.5",
      upper: "180.6",
      finerPrecisionMg: 10,
    });
  });

  it("the derived total above 1 000 000 g is V-06 as V-03 on fillWeight", () => {
    const ev = fill("101", { vesselCount: "9999" });
    const issue = expectBlocked(ev, "V-06", "fillWeight");
    expect(issue).toMatchObject({ as: "V-03" });
    expect(ev.plan).toBeNull();
  });

  it("a derived total of exactly 1 000 000 g is fine", () => {
    expect(fill("1000", { vesselCount: "1000" }).issues).toEqual([]);
  });
});

describe("V-07 fragrance percentage", () => {
  it.each(["80", "50.01", "51", "100", ""])("%j is V-07 on fragrancePct", (fragrancePct) => {
    const ev = run({ fragrancePct });
    expectBlocked(ev, "V-07", "fragrancePct");
    expect(ev.plan).toBeNull();
  });

  it("more than two decimals is V-07", () => {
    expectBlocked(run({ fragrancePct: "8.255" }), "V-07", "fragrancePct");
  });

  it("0, 50 and 50.00 are accepted, on either basis", () => {
    for (const basis of ["wax", "total"] as const) {
      for (const fragrancePct of ["0", "0.01", "50", "50.00"]) {
        const ev = run({ basis, fragrancePct });
        expect(find(ev.issues, "V-07"), `${basis} ${fragrancePct}`).toBeUndefined();
      }
    }
  });

  it("100 of total mixture does not throw (computePlan would)", () => {
    expect(() => run({ basis: "total", fragrancePct: "100" })).not.toThrow();
  });
});

describe("V-08 above 12% of wax weight (warning, exact comparison)", () => {
  it("wax basis: 12 does not warn, 12.01 does", () => {
    expect(find(run({ fragrancePct: "12" }).warnings, "V-08")).toBeUndefined();
    expect(find(run({ fragrancePct: "12.00" }).warnings, "V-08")).toBeUndefined();
    const ev = run({ fragrancePct: "12.01" });
    const w = find(ev.warnings, "V-08");
    expect(w).toMatchObject({ rule: "V-08", severity: "warning", field: "fragrancePct" });
  });

  it("total basis: 10.71 is 11.995% of wax weight (no warning), 10.72 is 12.007% (warning)", () => {
    expect(find(run({ basis: "total", fragrancePct: "10.71" }).warnings, "V-08")).toBeUndefined();
    expect(find(run({ basis: "total", fragrancePct: "10.72" }).warnings, "V-08")).toBeDefined();
  });

  it("WE-13: 13% of wax weight saves with a V-08 warning", () => {
    const ev = run({ fragrancePct: "13" });
    expect(ev.issues).toEqual([]);
    expect(find(ev.warnings, "V-08", "fragrancePct")).toBeDefined();
    expect(ev.input).not.toBeNull();
    expect(ev.plan).not.toBeNull();
  });
});

describe("V-09 above the wax's supplier maximum, on the supplier's basis (warning)", () => {
  it("soy, max 10% (basis not recorded, so wax): 10 is fine, 10.01 warns", () => {
    const fields = (fragrancePct: string) => run({ waxes: [row("w1", "wax-soy")], fragrancePct });
    expect(find(fields("10").warnings, "V-09")).toBeUndefined();
    const ev = fields("10.01");
    expect(ev.issues).toEqual([]);
    expect(ev.input).not.toBeNull();
    expect(find(ev.warnings, "V-09")).toMatchObject({
      rule: "V-09",
      severity: "warning",
      maxBp: 1000,
      waxName: "Soy 464",
    });
    expect(find(ev.warnings, "V-08")).toBeUndefined();
  });

  it("the user's total-mixture percentage is converted to the supplier's wax basis, exactly", () => {
    const fields = (fragrancePct: string) =>
      run({ waxes: [row("w1", "wax-soy")], basis: "total", fragrancePct });
    // 9.09% of total is 9.9989% of wax; 9.1% of total is 10.011% of wax.
    expect(find(fields("9.09").warnings, "V-09")).toBeUndefined();
    expect(find(fields("9.1").warnings, "V-09")).toBeDefined();
  });

  it("a supplier maximum stated on total mixture (8%) is compared on that basis", () => {
    const wax = (fragrancePct: string, basis: "wax" | "total") =>
      run({ waxes: [row("w1", "wax-capt")], basis, fragrancePct });
    // Same-basis comparison.
    expect(find(wax("8", "total").warnings, "V-09")).toBeUndefined();
    expect(find(wax("8.01", "total").warnings, "V-09")).toBeDefined();
    // 8.7% of wax is 8.0037% of total (870 / 10870), 8.69% is 7.9953%.
    expect(find(wax("8.69", "wax").warnings, "V-09")).toBeUndefined();
    const over = find(wax("8.7", "wax").warnings, "V-09");
    expect(over).toMatchObject({ maxBp: 800, waxName: "Capped Total" });
  });

  it("one warning per wax that is exceeded", () => {
    const both = run({
      waxes: [row("w1", "wax-soy", "1"), row("w2", "wax-capt", "1")],
      fragrancePct: "11",
    });
    const v09 = both.warnings.filter((w) => w.rule === "V-09");
    expect(v09.map((w) => (w as { waxName: string }).waxName).sort()).toEqual(["Capped Total", "Soy 464"]);

    // 9% of wax: soy (10) is fine, the capped-wax wax (5) is exceeded.
    const one = run({
      waxes: [row("w1", "wax-soy", "1"), row("w2", "wax-capw", "1")],
      fragrancePct: "9",
    });
    const only = one.warnings.filter((w) => w.rule === "V-09");
    expect(only).toHaveLength(1);
    expect(only[0]).toMatchObject({ maxBp: 500, waxName: "Capped Wax" });
  });

  it("V-08 and V-09 can appear together; neither blocks", () => {
    const ev = run({ waxes: [row("w1", "wax-soy")], fragrancePct: "13" });
    expect(find(ev.warnings, "V-08")).toBeDefined();
    expect(find(ev.warnings, "V-09")).toBeDefined();
    expect(ev.issues).toEqual([]);
    expect(ev.input).not.toBeNull();
  });

  it("a wax with no recorded maximum never warns", () => {
    expect(find(run({ fragrancePct: "11" }).warnings, "V-09")).toBeUndefined();
  });
});

describe("V-10 wax", () => {
  it("a wax row with no material is V-10 on that row's material", () => {
    const ev = run({ waxes: [row("w1", null)] });
    expectBlocked(ev, "V-10", "waxes.w1.material");
    expect(ev.plan).toBeNull();
  });

  it("no wax rows at all is V-10 on waxes", () => {
    const ev = run({ waxes: [] });
    expectBlocked(ev, "V-10", "waxes");
    expect(ev.plan).toBeNull();
  });

  it("only the blank row of a two-wax blend is reported", () => {
    const ev = run({ waxes: [row("w1", "wax-plain", "1"), row("w2", null, "1")] });
    expectBlocked(ev, "V-10", "waxes.w2.material");
    expect(find(ev.issues, "V-10", "waxes.w1.material")).toBeUndefined();
  });
});

describe("V-11 oils", () => {
  it("fragrance above 0 and no oil rows is V-11 on oils (WE-13: 8%, no oil)", () => {
    const ev = run({ oils: [] });
    expectBlocked(ev, "V-11", "oils");
    expect(ev.plan).toBeNull();
  });

  it("an oil row with no material is V-11 on that row's material", () => {
    const ev = run({ oils: [row("o1", null)] });
    expectBlocked(ev, "V-11", "oils.o1.material");
    expect(ev.plan).toBeNull();
  });

  it("the blank row of a two-oil blend is the one reported", () => {
    const ev = run({ oils: [row("o1", "oil-lav", "1"), row("o2", null, "1")] });
    expectBlocked(ev, "V-11", "oils.o2.material");
    expect(find(ev.issues, "V-11", "oils.o1.material")).toBeUndefined();
  });
});

describe("V-12 parts", () => {
  const twoOils = (parts: string) => run({ oils: [row("o1", "oil-lav", "3"), row("o2", "oil-van", parts)] });

  it.each(["", "0", "0.00", "10000", "0.001"])("%j is V-12 on the row's parts (WE-13: empty)", (parts) => {
    const ev = twoOils(parts);
    expectBlocked(ev, "V-12", "oils.o2.parts");
    expect(find(ev.issues, "V-12", "oils.o1.parts")).toBeUndefined();
    expect(ev.plan).toBeNull();
  });

  it("9999.99 and 0.01 are accepted", () => {
    // Equal parts on both rows, so no oil rounds to 0 g.
    for (const p of ["9999.99", "0.01"]) {
      const ev = run({ oils: [row("o1", "oil-lav", p), row("o2", "oil-van", p)] });
      expect(ev.issues, p).toEqual([]);
      expect(ev.input!.oils.map((o) => o.partsX100)).toEqual([Math.round(Number(p) * 100), Math.round(Number(p) * 100)]);
    }
  });

  it("wax rows report V-12 on waxes.<rowId>.parts", () => {
    const ev = run({ waxes: [row("w1", "wax-plain", ""), row("w2", "wax-coco", "")] });
    expectBlocked(ev, "V-12", "waxes.w1.parts");
    expectBlocked(ev, "V-12", "waxes.w2.parts");
  });

  it("a single row needs no parts: it counts as 100 and the text is ignored", () => {
    const ev = run({ waxes: [row("w1", "wax-plain", "abc")], oils: [row("o1", "oil-lav", "")] });
    expect(ev.issues).toEqual([]);
    expect(ev.input!.waxes[0].partsX100).toBe(100);
    expect(ev.input!.oils[0].partsX100).toBe(100);
  });
});

describe("V-13 the same material twice in one blend", () => {
  it("the second row is V-13, the first is not (WE-13)", () => {
    const ev = run({ oils: [row("o1", "oil-lav", "1"), row("o2", "oil-lav", "1")] });
    const issue = expectBlocked(ev, "V-13", "oils.o2.material");
    expect(issue).toMatchObject({ materialName: "Lavender" });
    expect(find(ev.issues, "V-13", "oils.o1.material")).toBeUndefined();
    expect(ev.plan).toBeNull();
  });

  it("every later repeat is reported", () => {
    const ev = run({
      oils: [row("o1", "oil-lav", "1"), row("o2", "oil-lav", "1"), row("o3", "oil-van", "1"), row("o4", "oil-lav", "1")],
    });
    expect(ev.issues.filter((i) => i.rule === "V-13").map((i) => i.field)).toEqual([
      "oils.o2.material",
      "oils.o4.material",
    ]);
  });

  it("applies to waxes too", () => {
    const ev = run({ waxes: [row("w1", "wax-coco", "1"), row("w2", "wax-coco", "1")] });
    const issue = expectBlocked(ev, "V-13", "waxes.w2.material");
    expect(issue).toMatchObject({ materialName: "Coconut Wax" });
  });
});

describe("V-14 no wax", () => {
  it("1 g total at 50% of total mixture and 1 g precision leaves no wax", () => {
    const ev = run({ amount: "1", fragrancePct: "50", basis: "total", precisionMg: 1000 });
    expectBlocked(ev, "V-14", "result");
    expect(ev.plan).toBeNull();
  });
});

describe("V-15 zero component (CALC-14)", () => {
  it("WE-13: 5 g total, 1% of wax, 1 g precision", () => {
    const ev = run({ amount: "5", fragrancePct: "1", precisionMg: 1000 });
    const issue = expectBlocked(ev, "V-15", "result");
    expect(issue).toMatchObject({ materialName: "Lavender" });
    expect(ev.plan).toBeNull();
  });

  it("yields one issue per component that rounds to 0 g, named from the lookup, in order", () => {
    // Wax mode 1000 g, 0.01% of wax is 0.1 g of fragrance at 0.1 g, three oils 1 : 1 : 1.
    // The spare step goes to the first oil, so Vanilla and Citrus are 0.
    const ev = run({
      sizingMode: "wax",
      amount: "1000",
      fragrancePct: "0.01",
      oils: [row("o1", "oil-lav", "1"), row("o2", "oil-van", "1"), row("o3", "oil-cit", "1")],
    });
    const v15 = ev.issues.filter((i) => i.rule === "V-15");
    expect(v15.map((i) => (i as { materialName: string }).materialName)).toEqual(["Vanilla", "Citrus"]);
    expect(v15.every((i) => i.field === "result")).toBe(true);
    expect(ev.plan).toBeNull();
    expect(ev.input).toBeNull();
  });

  it("applies to a wax that rounds to 0 g", () => {
    // 500 g total, 1% of wax: F 5.0 g, W 495.0 g. Waxes 9999 : 1 give the second wax 0.0495 g.
    const ev = run({
      fragrancePct: "1",
      waxes: [row("w1", "wax-plain", "9999"), row("w2", "wax-coco", "1")],
    });
    const issue = expectBlocked(ev, "V-15", "result");
    expect(issue).toMatchObject({ materialName: "Coconut Wax" });
    expect(ev.issues.filter((i) => i.rule === "V-15")).toHaveLength(1);
  });
});

describe("CALC-13 rounding warning (does not block)", () => {
  const small = (over: Partial<EditorFields> = {}) =>
    run({
      amount: "50",
      fragrancePct: "6",
      precisionMg: 1000,
      oils: [row("o1", "oil-lav", "2"), row("o2", "oil-van", "1")],
      ...over,
    });

  it("WE-7 at 1 g warns, with the effective percentage on the formula's basis", () => {
    const ev = small();
    expect(ev.issues).toEqual([]);
    expect(ev.input).not.toBeNull();
    expect(ev.plan).not.toBeNull();
    expect(find(ev.warnings, "CALC-13")).toMatchObject({
      rule: "CALC-13",
      severity: "warning",
      field: "result",
      precisionMg: 1000,
      requestedBp: 600,
      basis: "wax",
      effectiveX100: 638,
    });
  });

  it("WE-7 at 0.1 g and 0.01 g does not warn", () => {
    expect(find(small({ precisionMg: 100 }).warnings, "CALC-13")).toBeUndefined();
    expect(find(small({ precisionMg: 10 }).warnings, "CALC-13")).toBeUndefined();
  });

  it("on total mixture the effective figure is on total mixture", () => {
    // 50 g, 5.7% of total: F 2.85 g rounds to 3 g (+5.26%). 3 / 50 is 6.00% of total.
    const ev = small({ basis: "total", fragrancePct: "5.7" });
    expect(find(ev.warnings, "CALC-13")).toMatchObject({
      requestedBp: 570,
      basis: "total",
      effectiveX100: 600,
    });
  });
});

describe("CALC-17 unscented with oils listed", () => {
  it("0% with an oil chosen adds the note and ignores the oil", () => {
    const ev = run({ fragrancePct: "0" });
    expect(ev.issues).toEqual([]);
    expect(find(ev.warnings, "CALC-17")).toMatchObject({ rule: "CALC-17", severity: "note" });
    expect(ev.input).not.toBeNull();
    expect(ev.input!.oils).toEqual([]);
    expect(ev.plan!.fragranceTotalMg).toBe(0);
    expect(ev.plan!.oils).toEqual([]);
  });

  it("a blank placeholder oil row does not trigger the note", () => {
    const ev = run({ fragrancePct: "0", oils: [row("o1", null)] });
    expect(ev.issues).toEqual([]);
    expect(find(ev.warnings, "CALC-17")).toBeUndefined();
    expect(ev.input!.oils).toEqual([]);
  });

  it("no oil rows at all: no note", () => {
    const ev = run({ fragrancePct: "0", oils: [] });
    expect(ev.issues).toEqual([]);
    expect(find(ev.warnings, "CALC-17")).toBeUndefined();
    expect(ev.input!.oils).toEqual([]);
  });

  it("one placeholder and one chosen oil: the note appears", () => {
    const ev = run({ fragrancePct: "0", oils: [row("o1", null, "1"), row("o2", "oil-van", "1")] });
    expect(find(ev.warnings, "CALC-17")).toBeDefined();
    expect(ev.issues).toEqual([]);
  });

  it("oil rows are not validated at 0%: bad parts and repeated materials raise nothing", () => {
    const ev = run({
      fragrancePct: "0.00",
      oils: [row("o1", "oil-lav", "abc"), row("o2", "oil-lav", "")],
    });
    expect(ev.issues).toEqual([]);
    expect(ev.input!.oils).toEqual([]);
    expect(find(ev.warnings, "CALC-17")).toBeDefined();
  });

  it("WE-11: 300 g total, 0%, no oil needed", () => {
    const ev = run({ amount: "300", fragrancePct: "0", oils: [] });
    expect(ev.issues).toEqual([]);
    expect(ev.plan!.totalMg).toBe(300_000);
    expect(ev.plan!.waxTotalMg).toBe(300_000);
  });
});

describe("error order and the plan (PRD-12)", () => {
  it("errors come in field order: name, batch size, fragrance, waxes, oils, result", () => {
    const ev = run({
      name: "",
      amount: "0",
      fragrancePct: "8",
      waxes: [row("w1", null)],
      oils: [],
    });
    expect(rules(ev.issues)).toEqual(["V-02", "V-03", "V-10", "V-11"]);
    expect(ev.plan).toBeNull();
    expect(ev.input).toBeNull();
  });

  it("input is null whenever issues is non-empty, and non-null when it is empty", () => {
    expect(run({ name: "" }).input).toBeNull();
    expect(run({ amount: "x" }).input).toBeNull();
    expect(run().input).not.toBeNull();
    expect(run({ fragrancePct: "13" }).input).not.toBeNull();
  });

  it("plan is null while batch size, fragrance, waxes or oils are invalid", () => {
    expect(run({ amount: "" }).plan).toBeNull();
    expect(run({ fragrancePct: "" }).plan).toBeNull();
    expect(run({ waxes: [row("w1", null)] }).plan).toBeNull();
    expect(run({ oils: [row("o1", null)] }).plan).toBeNull();
  });

  it("an empty editor reports problems and shows no plan", () => {
    const ev = evaluateFormula(
      baseFields({ name: "", amount: "", fragrancePct: "", waxes: [row("w1", null)], oils: [row("o1", null)] }),
      lookup,
    );
    expect(ev.issues.length).toBeGreaterThan(0);
    expect(ev.plan).toBeNull();
    expect(ev.input).toBeNull();
  });

  it("never throws on awkward input", () => {
    for (const fragrancePct of ["50", "100", "0", "49.99"]) {
      for (const basis of ["wax", "total"] as const) {
        expect(() => run({ fragrancePct, basis })).not.toThrow();
      }
    }
  });

  it("does not change the fields it is given", () => {
    const fields = baseFields({ name: "  padded  ", notes: " n " });
    const copy = JSON.parse(JSON.stringify(fields));
    evaluateFormula(fields, lookup);
    expect(fields).toEqual(copy);
  });
});

describe("TEST-09 the WE-13 table", () => {
  const fieldsById: Record<string, EditorFields> = {
    "WE-13.1": baseFields({ amount: "1,000" }),
    "WE-13.2": baseFields({ amount: "500.55" }),
    "WE-13.3": baseFields({ amount: "0" }),
    "WE-13.4": baseFields({ amount: "" }),
    "WE-13.5": baseFields({ fragrancePct: "80" }),
    "WE-13.6": baseFields({ fragrancePct: "13" }),
    "WE-13.7": baseFields({ fragrancePct: "8", oils: [] }),
    "WE-13.8": baseFields({ oils: [row("oil-a", "oil-lav", "3"), row("oil-b", "oil-van", "")] }),
    "WE-13.9": baseFields({ oils: [row("oil-a", "oil-lav", "1"), row("oil-b", "oil-lav", "1")] }),
    "WE-13.10": baseFields({ amount: "5", fragrancePct: "1", precisionMg: 1000 }),
    "WE-13.12": baseFields({ sizingMode: "vessels", vesselCount: "2.5", fillWeight: "180" }),
  };

  const table = WE_13.filter((r) => r.id !== "WE-13.11");

  it.each(table.map((r) => [r.id, r.description, r] as const))("%s: %s", (id, _desc, example) => {
    const fields = { ...fieldsById[id], precisionMg: example.precisionMg };
    const ev = evaluateFormula(fields, lookup);
    const list = example.severity === "error" ? ev.issues : ev.warnings;
    const hit = find(list, example.rule, example.field);
    expect(hit, `${id}: expected ${example.rule} on ${example.field}`).toBeDefined();
    expect(hit!.severity).toBe(example.severity);
    if (example.saveBlocked) {
      expect(ev.issues.length).toBeGreaterThan(0);
      expect(ev.input).toBeNull();
    } else {
      expect(ev.issues).toEqual([]);
      expect(ev.input).not.toBeNull();
    }
    if (example.resultsPanelEmpty) expect(ev.plan).toBeNull();
    else expect(ev.plan).not.toBeNull();
  });

  it("WE-13.1: a comma is neither 1 g nor 1000 g, so no plan and no V-03", () => {
    const ev = evaluateFormula(fieldsById["WE-13.1"], lookup);
    expect(find(ev.issues, "V-03")).toBeUndefined();
    expect(ev.plan).toBeNull();
  });

  it("WE-13.11: measured weight -2 is V-01", () => {
    const r = parseMeasured("-2", "measured.oil-a");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issue).toMatchObject({ rule: "V-01", field: "measured.oil-a", severity: "error" });
    }
  });
});

describe("V-16 and V-17 through their own entry points", () => {
  it("V-16: more than 2 decimals, above 1 000 000 g", () => {
    for (const t of ["12.345", "1000000.01"]) {
      const r = parseMeasured(t, "measured.wax-a");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issue.rule).toBe("V-16");
    }
  });

  it("V-17: multiplier bounds", () => {
    const sizing = { mode: "total", amountMg: 500_000 } as const;
    const bad = evaluateScale(sizing, 100, { method: "multiplier", multiplier: "0" });
    expect(find(bad.issues, "V-17", "scale.multiplier")).toBeDefined();
    const good = evaluateScale(sizing, 100, { method: "multiplier", multiplier: "0.01" });
    expect(good.issues).toEqual([]);
  });
});
