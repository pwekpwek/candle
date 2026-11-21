import { describe, expect, it } from "vitest";
import {
  WICK_OWN,
  checkAfter,
  checkBefore,
  checkDate,
  checkDuration,
  checkMm,
  emptyBurn,
  emptyCandle,
  gramsText,
  newFormValues,
  parseWeight,
  validateForm,
  valuesFromSession,
  type Context,
  type FormValues,
} from "@/components/burn/session/form-model";
import { MESSAGES } from "@/lib/messages";
import type { BurnSession } from "@/lib/types";

const M = MESSAGES.burn;
const ctx: Context = { today: "2026-11-19", producedOn: "2026-11-01", formatDate: (d) => `on ${d}` };

let n = 0;
const key = () => `k${++n}`;

function filled(): FormValues {
  const values = newFormValues("2026-11-19", key, false);
  values.candles[0].wickText = "CD-10";
  const burn = emptyBurn(key());
  burn.duration = "120";
  burn.before = "200.5";
  burn.after = "197.25";
  burn.diameter = "55";
  burn.soot = "light";
  values.candles[0].burns.push(burn);
  return values;
}

describe("field checks", () => {
  it("date: required, real, not future, not before production", () => {
    expect(checkDate("", ctx)).toBe(M.errDateRequired);
    expect(checkDate("2026-02-30", ctx)).toBe(M.errDateInvalid);
    expect(checkDate("2026-11-20", ctx)).toBe(M.errDateFuture);
    expect(checkDate("2026-10-31", ctx)).toBe(M.errDateBeforeProduced("on 2026-11-01"));
    expect(checkDate("2026-11-01", ctx)).toBeNull();
    expect(checkDate("2026-11-19", ctx)).toBeNull();
  });

  it("duration: whole minutes 1 to 1440", () => {
    expect(checkDuration("")).toBe(M.errDurationRequired);
    expect(checkDuration("1.5")).toBe(M.errDurationWhole);
    expect(checkDuration("-3")).toBe(M.errDurationWhole);
    expect(checkDuration("0")).toBe(M.errDurationRange(1440));
    expect(checkDuration("1441")).toBe(M.errDurationRange(1440));
    expect(checkDuration("1440")).toBeNull();
  });

  it("millimetres: optional whole 0 to 500", () => {
    expect(checkMm("")).toBeNull();
    expect(checkMm("0")).toBeNull();
    expect(checkMm("500")).toBeNull();
    expect(checkMm("501")).toBe(M.errMmRange(500));
    expect(checkMm("5.5")).toBe(M.errMmWhole);
  });

  it("weights: grams with up to 2 decimals become whole milligrams", () => {
    expect(parseWeight("")).toEqual({ ok: true, mg: null });
    expect(parseWeight("123.45")).toEqual({ ok: true, mg: 123450 });
    expect(parseWeight("0.5")).toEqual({ ok: true, mg: 500 });
    expect(parseWeight("1.234")).toEqual({ ok: false, error: M.errWeightDecimals });
    expect(parseWeight("1,5")).toEqual({ ok: false, error: M.errWeightFormat });
    expect(checkBefore("0")).toBe(M.errWeightBeforeZero);
    expect(checkBefore("12.5")).toBeNull();
  });

  it("weight after: not above the weight before, zero allowed", () => {
    expect(checkAfter("201", "200")).toBe(M.errWeightAfterAbove);
    expect(checkAfter("200", "200")).toBeNull();
    expect(checkAfter("0", "200")).toBeNull();
    expect(checkAfter("201", "")).toBeNull();
  });
});

describe("validateForm", () => {
  it("builds the input: trimmed, blanks absent, grams as mg, numbers as numbers", () => {
    const values = filled();
    values.label = "  Round 1  ";
    values.conclusion = "  Even melt.  ";
    values.candles[0].coldThrow = "  ";
    const { errors, input } = validateForm(values, ctx);
    expect(errors).toEqual({});
    expect(input).toEqual({
      testedOn: "2026-11-19",
      label: "Round 1",
      milestoneId: null,
      candles: [
        {
          label: "Candle 1",
          wick: { text: "CD-10" },
          burns: [
            {
              durationMin: 120,
              weightBeforeMg: 200500,
              weightAfterMg: 197250,
              meltPoolDiameterMm: 55,
              soot: "light",
            },
          ],
        },
      ],
      conclusion: "Even melt.",
    });
  });

  it("sends a library wick by id and the existing ids of candles and burns", () => {
    const values = filled();
    values.candles[0].id = "cid";
    values.candles[0].burns[0].id = "bid";
    values.candles[0].wick = "mat-1";
    values.milestoneId = "ms-1";
    const { input } = validateForm(values, ctx);
    expect(input?.milestoneId).toBe("ms-1");
    expect(input?.candles[0]).toMatchObject({ id: "cid", wick: { materialId: "mat-1" } });
    expect(input?.candles[0].burns[0].id).toBe("bid");
  });

  it("reports every problem by field path and gives no input", () => {
    const values = filled();
    values.testedOn = "2026-12-01";
    values.candles[0].label = " ";
    values.candles[0].wick = "";
    const burn = values.candles[0].burns[0];
    burn.duration = "";
    burn.after = "999";
    const { errors, input } = validateForm(values, ctx);
    expect(input).toBeNull();
    expect(errors.testedOn).toBe(M.errDateFuture);
    expect(errors[`${values.candles[0].key}.label`]).toBe(M.errCandleLabelRequired);
    expect(errors[`${values.candles[0].key}.wick`]).toBe(M.errWickRequired);
    expect(errors[`${burn.key}.duration`]).toBe(M.errDurationRequired);
    expect(errors[`${burn.key}.after`]).toBe(M.errWeightAfterAbove);
  });

  it("asks for the typed wick name only in typed mode", () => {
    const values = filled();
    values.candles[0].wickText = " ";
    expect(validateForm(values, ctx).errors[`${values.candles[0].key}.wick`]).toBe(M.errWickRequired);
  });

  it("a new candle starts as typed text without library wicks, unchosen with them", () => {
    expect(emptyCandle("a", 2, false)).toMatchObject({ label: "Candle 2", wick: WICK_OWN });
    expect(emptyCandle("a", 3, true)).toMatchObject({ label: "Candle 3", wick: "" });
  });
});

describe("stored session to form", () => {
  const session: BurnSession = {
    id: "s1",
    batchId: "b1",
    testedOn: "2026-11-10",
    label: "Round 1",
    milestoneId: "ms-1",
    candles: [
      {
        id: "c1",
        label: "A",
        wick: { materialId: "m1", name: "Wick A" },
        coldThrow: "Soft",
        burns: [
          { id: "r1", durationMin: 90, weightBeforeMg: 200000, weightAfterMg: 198500, soot: "none" },
        ],
      },
      { id: "c2", label: "B", wick: { materialId: "gone", name: "Old wick" }, burns: [] },
      { id: "c3", label: "C", wick: { materialId: null, name: "Typed" }, burns: [] },
    ],
    conclusion: "Mine",
    createdAt: "2026-11-10T08:00:00.000Z",
    updatedAt: "2026-11-10T08:00:00.000Z",
  };
  const make = (linkResolves: boolean) =>
    valuesFromSession(session, { newKey: key, knownMaterialIds: new Set(["m1"]), linkResolves });

  it("keeps ids, shows grams and keeps a known wick", () => {
    const values = make(true);
    expect(values.milestoneId).toBe("ms-1");
    expect(values.candles[0]).toMatchObject({ id: "c1", wick: "m1", coldThrow: "Soft" });
    expect(values.candles[0].burns[0]).toMatchObject({
      id: "r1",
      duration: "90",
      before: "200",
      after: "198.5",
      soot: "none",
    });
  });

  it("shows a wick whose material is gone, or typed, as typed text", () => {
    const values = make(true);
    expect(values.candles[1]).toMatchObject({ wick: WICK_OWN, wickText: "Old wick" });
    expect(values.candles[2]).toMatchObject({ wick: WICK_OWN, wickText: "Typed" });
  });

  it("shows a link that no longer resolves as not linked", () => {
    expect(make(false).milestoneId).toBe("");
  });

  it("round trips without changing the burns", () => {
    const { input } = validateForm(make(true), ctx);
    expect(input?.candles[0].burns[0]).toEqual({
      id: "r1",
      durationMin: 90,
      weightBeforeMg: 200000,
      weightAfterMg: 198500,
      soot: "none",
    });
  });

  it("gramsText uses the fewest decimals", () => {
    expect(gramsText(123450)).toBe("123.45");
    expect(gramsText(500)).toBe("0.5");
    expect(gramsText(200000)).toBe("200");
    expect(gramsText(10)).toBe("0.01");
  });
});

describe("test date already stored", () => {
  const editing: Context = { ...ctx, storedTestedOn: "2026-10-20" };

  it("accepts the stored date even when it is before production", () => {
    expect(checkDate("2026-10-20", editing)).toBeNull();
  });

  it("still refuses a different date before production, and any when nothing is stored", () => {
    expect(checkDate("2026-10-21", editing)).toBe(M.errDateBeforeProduced("on 2026-11-01"));
    expect(checkDate("2026-10-20", ctx)).toBe(M.errDateBeforeProduced("on 2026-11-01"));
  });
});
