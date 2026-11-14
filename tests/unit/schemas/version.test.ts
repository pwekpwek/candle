import { describe, expect, it } from "vitest";
import {
  FormulaVersionSchema,
  SizingSchema,
  VersionInputsSchema,
  VersionTargetsSchema,
} from "@/lib/schemas";
import { IDS, clone, omit, version } from "./sample";

const inputs = version.inputs;
const targets = version.targets;
const wax = inputs.waxes[0];
const oil = inputs.oils[0];

/** Valid inputs with some fields replaced. */
function inputsWith(patch: Record<string, unknown>): unknown {
  return { ...inputs, ...patch };
}

/** Valid targets with some fields replaced. */
function targetsWith(patch: Record<string, unknown>): unknown {
  return { ...targets, ...patch };
}

describe("FormulaVersionSchema", () => {
  it("accepts a valid initial version", () => {
    expect(FormulaVersionSchema.safeParse(version).success).toBe(true);
  });

  it("accepts a revision with a parent and a scaled version with a scale record", () => {
    const revision = {
      ...version,
      number: 2,
      origin: "revision",
      parentVersionId: IDS.version,
      changeNote: "More oil",
    };
    const scaled = {
      ...version,
      number: 3,
      originalNumber: 1,
      origin: "scaled",
      parentVersionId: IDS.version,
      scale: { method: "multiplier", factorX10000: 15000 },
    };
    expect(FormulaVersionSchema.safeParse(revision).success).toBe(true);
    expect(FormulaVersionSchema.safeParse(scaled).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["number 0", { ...version, number: 0 }],
    ["a fractional number", { ...version, number: 1.2 }],
    ["originalNumber 0", { ...version, originalNumber: 0 }],
    ["an unknown origin", { ...version, origin: "copied" }],
    ["a non-UUID formulaId", { ...version, formulaId: "f" }],
    ["a non-UUID parentVersionId", { ...version, parentVersionId: "v0" }],
    ["an unknown scale method", { ...version, scale: { method: "half", factorX10000: 5000 } }],
    ["a negative scale factor", { ...version, scale: { method: "amount", factorX10000: -1 } }],
    ["calcVersion 0", { ...version, calcVersion: 0 }],
    ["an unknown top-level key", { ...version, parentNote: "x" }],
    ["inputs that break VersionInputsSchema", { ...version, inputs: inputsWith({ fragranceBp: 5001 }) }],
    ["targets that break VersionTargetsSchema", { ...version, targets: targetsWith({ totalMg: 1 }) }],
    ["a missing inputs", omit(version, "inputs")],
    ["a missing targets", omit(version, "targets")],
    ["a missing calcVersion", omit(version, "calcVersion")],
    ["a missing parentVersionId (must be null)", omit(version, "parentVersionId")],
    ["a missing scale (must be null)", omit(version, "scale")],
  ])("rejects %s", (_label, input) => {
    expect(FormulaVersionSchema.safeParse(input).success).toBe(false);
  });
});

describe("VersionInputsSchema", () => {
  it("accepts the valid inputs, with no wick, vessel or notes", () => {
    expect(VersionInputsSchema.safeParse(inputs).success).toBe(true);
    const bare = { ...omit(inputs, "notes"), wick: null, vessel: null };
    expect(VersionInputsSchema.safeParse(bare).success).toBe(true);
  });

  it("accepts an unscented version with no oils", () => {
    expect(VersionInputsSchema.safeParse(inputsWith({ fragranceBp: 0, oils: [] })).success).toBe(true);
  });

  it("accepts five waxes and ten oils", () => {
    const waxes = Array.from({ length: 5 }, (_, i) => ({ ...wax, componentId: `w${i}` }));
    const oils = Array.from({ length: 10 }, (_, i) => ({ ...oil, componentId: `o${i}` }));
    expect(VersionInputsSchema.safeParse(inputsWith({ waxes, oils })).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["fragrance above 50%", inputsWith({ fragranceBp: 5001 })],
    ["negative fragrance", inputsWith({ fragranceBp: -1 })],
    ["fractional fragrance (must be whole hundredths)", inputsWith({ fragranceBp: 800.5 })],
    ["an unknown basis", inputsWith({ basis: "sum" })],
    ["precision 1 mg", inputsWith({ precisionMg: 1 })],
    ["precision 500", inputsWith({ precisionMg: 500 })],
    ["no waxes", inputsWith({ waxes: [] })],
    [
      "six waxes",
      inputsWith({ waxes: Array.from({ length: 6 }, (_, i) => ({ ...wax, componentId: `w${i}` })) }),
    ],
    [
      "eleven oils",
      inputsWith({ oils: Array.from({ length: 11 }, (_, i) => ({ ...oil, componentId: `o${i}` })) }),
    ],
    ["an unscented version that still has oils", inputsWith({ fragranceBp: 0 })],
    ["a scented version with no oils", inputsWith({ oils: [] })],
    ["a duplicate component id across waxes and oils", inputsWith({ oils: [{ ...oil, componentId: wax.componentId }] })],
    ["parts of 0", inputsWith({ waxes: [{ ...wax, partsX100: 0 }] })],
    ["parts above 9999.99", inputsWith({ waxes: [{ ...wax, partsX100: 1_000_000 }] })],
    ["an empty component id", inputsWith({ waxes: [{ ...wax, componentId: "" }] })],
    ["a component with a non-UUID material", inputsWith({ waxes: [{ ...wax, materialId: "soy" }] })],
    ["a component with an unknown key", inputsWith({ waxes: [{ ...wax, colour: "red" }] })],
    [
      "a linked wick with an unknown key",
      inputsWith({ wick: { ...inputs.wick, extra: 1 } }),
    ],
    ["a missing sizing", omit(inputs, "sizing")],
    ["a missing waxes", omit(inputs, "waxes")],
    ["a missing wick (must be null)", omit(inputs, "wick")],
    ["a missing vessel (must be null)", omit(inputs, "vessel")],
    ["an unknown top-level key", inputsWith({ batchNote: "x" })],
  ])("rejects %s", (_label, input) => {
    expect(VersionInputsSchema.safeParse(input).success).toBe(false);
  });
});

describe("SizingSchema", () => {
  it.each<[string, unknown, boolean]>([
    ["total mode", { mode: "total", amountMg: 500000 }, true],
    ["wax mode", { mode: "wax", amountMg: 463000 }, true],
    ["vessels mode", { mode: "vessels", count: 3, fillMg: 180000 }, true],
    ["total mode with amount 0", { mode: "total", amountMg: 0 }, false],
    ["wax mode above 1 000 000 g", { mode: "wax", amountMg: 1_000_000_001 }, false],
    ["total mode with a fractional amount", { mode: "total", amountMg: 500.5 }, false],
    ["total mode with a count", { mode: "total", amountMg: 1000, count: 2 }, false],
    ["vessels mode with 0 vessels", { mode: "vessels", count: 0, fillMg: 1000 }, false],
    ["vessels mode with 10 000 vessels", { mode: "vessels", count: 10000, fillMg: 1000 }, false],
    ["vessels mode with a fractional count", { mode: "vessels", count: 2.5, fillMg: 1000 }, false],
    ["vessels mode with fill 0", { mode: "vessels", count: 2, fillMg: 0 }, false],
    ["vessels mode with total above 1 000 000 g", { mode: "vessels", count: 9999, fillMg: 200000 }, false],
    ["vessels mode with total exactly 1 000 000 g", { mode: "vessels", count: 2, fillMg: 500000 }, true],
    ["an unknown mode", { mode: "pour", amountMg: 1000 }, false],
    ["no mode", { amountMg: 1000 }, false],
  ])("%s", (_label, input, valid) => {
    expect(SizingSchema.safeParse(input).success).toBe(valid);
  });
});

describe("VersionTargetsSchema", () => {
  it("accepts the sample targets and an unscented target with a zero fragrance total", () => {
    expect(VersionTargetsSchema.safeParse(targets).success).toBe(true);
    const unscented = clone(targets);
    unscented.fragranceTotalMg = 0;
    unscented.totalMg = unscented.waxTotalMg;
    unscented.components = [{ componentId: "row-wax", targetMg: unscented.waxTotalMg }];
    expect(VersionTargetsSchema.safeParse(unscented).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a wax total of 0", targetsWith({ waxTotalMg: 0, totalMg: 37000 })],
    ["a negative fragrance total", targetsWith({ fragranceTotalMg: -1 })],
    ["a total that is not wax plus fragrance", targetsWith({ totalMg: 500001 })],
    ["a component target of 0", targetsWith({ components: [{ componentId: "row-wax", targetMg: 0 }] })],
    ["a fractional component target", targetsWith({ components: [{ componentId: "row-wax", targetMg: 463.5 }] })],
    [
      "a duplicate component id",
      targetsWith({
        components: [
          { componentId: "row-wax", targetMg: 1 },
          { componentId: "row-wax", targetMg: 2 },
        ],
      }),
    ],
    ["an empty component id", targetsWith({ components: [{ componentId: "", targetMg: 1 }] })],
    ["a missing components list", omit(targets, "components")],
    ["a missing totalMg", omit(targets, "totalMg")],
    ["an unknown key in a component target", targetsWith({ components: [{ componentId: "row-wax", targetMg: 1, actual: 1 }] })],
  ])("rejects %s", (_label, input) => {
    expect(VersionTargetsSchema.safeParse(input).success).toBe(false);
  });
});
