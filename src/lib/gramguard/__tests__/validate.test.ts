import { describe, expect, it } from "vitest";
import {
  emptyEditorFields,
  evaluateFormula,
  type EditorFields,
  type MaterialInfo,
} from "@/lib/gramguard";

const mats: Record<string, MaterialInfo> = {
  soy: { id: "soy", type: "wax", name: "Soy 464", maxFragranceBp: 1000 },
  coco: { id: "coco", type: "wax", name: "Coconut", maxFragranceBp: 800, maxFragranceBasis: "total" },
  lav: { id: "lav", type: "fragranceOil", name: "Lavender" },
  van: { id: "van", type: "fragranceOil", name: "Vanilla" },
};
const lookup = (id: string) => mats[id];

let n = 0;
const base = (over: Partial<EditorFields> = {}): EditorFields => ({
  ...emptyEditorFields(() => `r${++n}`),
  name: "Test",
  amount: "500",
  fragrancePct: "8",
  waxes: [{ rowId: "w1", materialId: "soy", parts: "" }],
  oils: [{ rowId: "o1", materialId: "lav", parts: "" }],
  ...over,
});
const rules = (f: Partial<EditorFields>) => evaluateFormula(base(f), lookup).issues.map((i) => `${i.rule}@${i.field}`);

describe("emptyEditorFields", () => {
  it("is a blank editor", () => {
    let k = 0;
    const f = emptyEditorFields(() => `id${++k}`);
    expect(f).toMatchObject({
      name: "",
      sizingMode: "total",
      basis: "wax",
      precisionMg: 100,
      waxes: [{ rowId: "id1", materialId: null, parts: "" }],
      oils: [{ rowId: "id2", materialId: null, parts: "" }],
      wickId: null,
      vesselId: null,
    });
  });
});

describe("evaluateFormula", () => {
  it("a valid formula (WE-1)", () => {
    const e = evaluateFormula(base(), lookup);
    expect(e.issues).toEqual([]);
    expect(e.plan?.fragranceTotalMg).toBe(37_000);
    expect(e.plan?.waxes[0]?.componentId).toBe("w1");
    expect(e.input).toMatchObject({
      name: "Test",
      sizing: { mode: "total", amountMg: 500_000 },
      fragranceBp: 800,
      waxes: [{ rowId: "w1", materialId: "soy", partsX100: 100 }],
      oils: [{ rowId: "o1", materialId: "lav", partsX100: 100 }],
    });
  });
  it("empty editor reports in field order and gives no plan", () => {
    const e = evaluateFormula(emptyEditorFields(() => "x"), lookup);
    expect(e.issues.map((i) => i.rule)).toEqual(["V-02", "V-03", "V-07", "V-10"]);
    expect(e.plan).toBeNull();
    expect(e.input).toBeNull();
  });
  it("V-01 beats range rules; WE-13 amounts", () => {
    expect(rules({ amount: "1,000" })).toEqual(["V-01@amount"]);
    expect(rules({ amount: "0" })).toEqual(["V-03@amount"]);
    expect(rules({ amount: "" })).toEqual(["V-03@amount"]);
    expect(rules({ amount: "1000001" })).toEqual(["V-03@amount"]);
    expect(rules({ amount: "-5" })).toEqual(["V-01@amount"]);
    const e = evaluateFormula(base({ amount: "500.55" }), lookup);
    expect(e.issues[0]).toEqual({
      rule: "V-04",
      field: "amount",
      severity: "error",
      precisionMg: 100,
      lower: "500.5",
      upper: "500.6",
      finerPrecisionMg: 10,
    });
    expect(e.plan).toBeNull();
  });
  it("V-04 with 3+ decimals has no finer precision", () => {
    const e = evaluateFormula(base({ amount: "500.555" }), lookup);
    expect(e.issues[0]).toMatchObject({ rule: "V-04", lower: "500.5", upper: "500.6", finerPrecisionMg: null });
    const e2 = evaluateFormula(base({ amount: "500.55555", precisionMg: 10 }), lookup);
    expect(e2.issues[0]).toMatchObject({ rule: "V-04", lower: "500.55", upper: "500.56", finerPrecisionMg: null });
    expect(evaluateFormula(base({ amount: "500.5", precisionMg: 1000 }), lookup).issues[0]).toMatchObject({
      lower: "500",
      upper: "501",
      finerPrecisionMg: 100,
    });
  });
  it("name", () => {
    expect(rules({ name: "   " })).toEqual(["V-02@name"]);
    expect(rules({ name: "a".repeat(81) })).toEqual(["V-02@name"]);
    expect(rules({ name: "a".repeat(80) })).toEqual([]);
    expect(evaluateFormula(base({ name: "" }), lookup).plan).not.toBeNull();
  });
  it("fragrance", () => {
    expect(rules({ fragrancePct: "80" })).toEqual(["V-07@fragrancePct"]);
    expect(rules({ fragrancePct: "8.255" })).toEqual(["V-07@fragrancePct"]);
    expect(rules({ fragrancePct: "" })).toEqual(["V-07@fragrancePct"]);
    expect(rules({ fragrancePct: "8%" })).toEqual(["V-01@fragrancePct"]);
    expect(rules({ fragrancePct: "50" })).toEqual([]);
  });
  it("vessels mode", () => {
    const v = (o: Partial<EditorFields>) => rules({ sizingMode: "vessels", ...o });
    expect(v({ vesselCount: "", fillWeight: "" })).toEqual(["V-05@vesselCount", "V-06@fillWeight"]);
    expect(v({ vesselCount: "2.5", fillWeight: "180" })).toEqual(["V-05@vesselCount"]);
    expect(v({ vesselCount: "0", fillWeight: "180" })).toEqual(["V-05@vesselCount"]);
    expect(v({ vesselCount: "10000", fillWeight: "180" })).toEqual(["V-05@vesselCount"]);
    expect(v({ vesselCount: "9999", fillWeight: "1000" })).toEqual(["V-06@fillWeight"]);
    const e = evaluateFormula(base({ sizingMode: "vessels", vesselCount: "6", fillWeight: "180.05" }), lookup);
    expect(e.issues[0]).toMatchObject({ rule: "V-06", as: "V-04", lower: "180.0", upper: "180.1" });
    const ok = evaluateFormula(base({ sizingMode: "vessels", vesselCount: "6", fillWeight: "180" }), lookup);
    expect(ok.input?.sizing).toEqual({ mode: "vessels", count: 6, fillMg: 180_000 });
  });
  it("blends: V-10, V-11, V-12, V-13", () => {
    expect(rules({ waxes: [] })).toEqual(["V-10@waxes"]);
    expect(rules({ waxes: [{ rowId: "w1", materialId: null, parts: "" }] })).toEqual(["V-10@waxes.w1.material"]);
    expect(rules({ oils: [] })).toEqual(["V-11@oils"]);
    expect(rules({ oils: [{ rowId: "o1", materialId: null, parts: "" }] })).toEqual(["V-11@oils.o1.material"]);
    expect(
      rules({
        oils: [
          { rowId: "o1", materialId: "lav", parts: "3" },
          { rowId: "o2", materialId: "van", parts: "" },
        ],
      }),
    ).toEqual(["V-12@oils.o2.parts"]);
    expect(
      rules({
        oils: [
          { rowId: "o1", materialId: "lav", parts: "3" },
          { rowId: "o2", materialId: "van", parts: "1,5" },
          { rowId: "o3", materialId: "van", parts: "0" },
        ],
      }),
    ).toEqual(["V-01@oils.o2.parts", "V-13@oils.o3.material", "V-12@oils.o3.parts"]);
    const dup = evaluateFormula(
      base({
        oils: [
          { rowId: "o1", materialId: "lav", parts: "1" },
          { rowId: "o2", materialId: "lav", parts: "1" },
        ],
      }),
      lookup,
    );
    expect(dup.issues).toEqual([
      { rule: "V-13", field: "oils.o2.material", severity: "error", materialName: "Lavender" },
    ]);
    expect(rules({ oils: [{ rowId: "o1", materialId: "lav", parts: "garbage" }] })).toEqual([]);
    expect(rules({ oils: [{ rowId: "o1", materialId: "lav", parts: "10000" }, { rowId: "o2", materialId: "van", parts: "1" }] })).toEqual(["V-12@oils.o1.parts"]);
  });
  it("throws above the row limits", () => {
    const row = (i: number) => ({ rowId: `r${i}`, materialId: null, parts: "" });
    expect(() => evaluateFormula(base({ waxes: [1, 2, 3, 4, 5, 6].map(row) }), lookup)).toThrow(RangeError);
    expect(() => evaluateFormula(base({ oils: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(row) }), lookup)).toThrow(RangeError);
  });
  it("unscented (CALC-17)", () => {
    const e = evaluateFormula(base({ fragrancePct: "0" }), lookup);
    expect(e.issues).toEqual([]);
    expect(e.warnings).toEqual([{ rule: "CALC-17", field: "oils", severity: "note" }]);
    expect(e.input?.oils).toEqual([]);
    expect(e.plan?.oils).toEqual([]);
    const none = evaluateFormula(base({ fragrancePct: "0", oils: [{ rowId: "o1", materialId: null, parts: "" }] }), lookup);
    expect(none.issues).toEqual([]);
    expect(none.warnings).toEqual([]);
  });
  it("V-08 and V-09 warnings are exact and never block", () => {
    const e13 = evaluateFormula(base({ fragrancePct: "13" }), lookup);
    expect(e13.input).not.toBeNull();
    expect(e13.warnings.map((w) => w.rule)).toEqual(["V-08", "V-09"]);
    expect(e13.warnings[1]).toMatchObject({ maxBp: 1000, waxName: "Soy 464", field: "fragrancePct" });
    // 12% of wax: not above. 12.01 is.
    expect(evaluateFormula(base({ fragrancePct: "12" }), lookup).warnings.map((w) => w.rule)).toEqual(["V-09"]);
    expect(evaluateFormula(base({ fragrancePct: "12.01" }), lookup).warnings.map((w) => w.rule)).toEqual(["V-08", "V-09"]);
    // total basis: 12% of wax = 10.714% of total. 10.72 is above, 10.71 is not.
    const t = (p: string) =>
      evaluateFormula(base({ basis: "total", fragrancePct: p, waxes: [{ rowId: "w1", materialId: "coco", parts: "" }] }), lookup);
    expect(t("10.72").warnings.map((w) => w.rule)).toEqual(["V-08", "V-09"]);
    expect(t("10.71").warnings.map((w) => w.rule)).toEqual(["V-09"]);
    // coco max 8% on total basis, user basis total: 8 is not above, 8.01 is.
    expect(t("8").warnings).toEqual([]);
    expect(t("8.01").warnings.map((w) => w.rule)).toEqual(["V-09"]);
    // fragrance invalid: no V-08/V-09
    expect(evaluateFormula(base({ fragrancePct: "80" }), lookup).warnings).toEqual([]);
  });
  it("V-14 and V-15 land on result", () => {
    // 1 g total, 50% of total at 1 g precision: F rounds to 1 g, leaving no wax.
    const nowax = evaluateFormula(base({ amount: "1", basis: "total", fragrancePct: "50", precisionMg: 1000 }), lookup);
    expect(nowax.issues).toEqual([{ rule: "V-14", field: "result", severity: "error" }]);
    expect(nowax.plan).toBeNull();
    const z = evaluateFormula(base({ amount: "5", fragrancePct: "1", precisionMg: 1000 }), lookup);
    expect(z.issues).toEqual([{ rule: "V-15", field: "result", severity: "error", materialName: "Lavender" }]);
    expect(z.plan).toBeNull();
    expect(z.input).toBeNull();
  });
  it("CALC-13 warning on result (WE-7 at 1 g)", () => {
    const e = evaluateFormula(
      base({
        amount: "50",
        fragrancePct: "6",
        precisionMg: 1000,
        oils: [
          { rowId: "o1", materialId: "lav", parts: "2" },
          { rowId: "o2", materialId: "van", parts: "1" },
        ],
      }),
      lookup,
    );
    expect(e.issues).toEqual([]);
    expect(e.warnings).toEqual([
      { rule: "CALC-13", field: "result", severity: "warning", precisionMg: 1000, requestedBp: 600, basis: "wax", effectiveX100: 638 },
    ]);
  });
  it("trims notes and keeps wick and vessel ids", () => {
    const e = evaluateFormula(base({ notes: "  hi  ", wickId: "k", vesselId: "j", changeNote: "x" }), lookup);
    expect(e.input).toMatchObject({ notes: "hi", wickId: "k", vesselId: "j", changeNote: "x" });
  });
});
