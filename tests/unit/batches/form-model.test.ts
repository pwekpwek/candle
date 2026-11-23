import { describe, expect, it } from "vitest";
import {
  EMPTY_LOT_CHOICES,
  checkDate,
  initialLotChoices,
  lotInputs,
  validateForm,
} from "@/components/batches/form-model";
import type { BatchLot } from "@/lib/types";
import { MESSAGES } from "@/lib/messages";

const B = MESSAGES.batches;
const TODAY = "2026-11-20";
const values = (producedOn: string) => ({
  producedOn,
  label: "",
  notes: "",
  texts: {},
});

describe("batch date against the earliest burn test", () => {
  const message = B.errProducedAfterBurnTest("Nov 12, 2026");

  it("refuses a date after it", () => {
    expect(checkDate("2026-11-13", TODAY, "2026-11-12")).toBe(message);
    const { errors, input } = validateForm(
      values("2026-11-13"),
      [],
      TODAY,
      "2026-11-12",
    );
    expect(errors.producedOn).toBe(message);
    expect(input).toBeNull();
  });

  it("accepts the same day and earlier", () => {
    expect(checkDate("2026-11-12", TODAY, "2026-11-12")).toBeNull();
    expect(checkDate("2026-11-01", TODAY, "2026-11-12")).toBeNull();
    expect(
      validateForm(values("2026-11-12"), [], TODAY, "2026-11-12").input,
    ).not.toBeNull();
  });

  it("ignores it when there is no burn test", () => {
    expect(checkDate("2026-11-13", TODAY, null)).toBeNull();
    expect(checkDate("2026-11-13", TODAY)).toBeNull();
  });
});

describe("batch date already stored", () => {
  const message = B.errProducedAfterBurnTest("Nov 12, 2026");

  it("accepts the stored date even when it is after the earliest burn test", () => {
    expect(
      checkDate("2026-11-15", TODAY, "2026-11-12", "2026-11-15"),
    ).toBeNull();
    const { errors, input } = validateForm(
      values("2026-11-15"),
      [],
      TODAY,
      "2026-11-12",
      "2026-11-15",
    );
    expect(errors.producedOn).toBeUndefined();
    expect(input).not.toBeNull();
  });

  it("still refuses a different later date", () => {
    expect(checkDate("2026-11-16", TODAY, "2026-11-12", "2026-11-15")).toBe(
      message,
    );
    expect(
      validateForm(values("2026-11-16"), [], TODAY, "2026-11-12", "2026-11-15")
        .input,
    ).toBeNull();
  });
});

describe("lot choices", () => {
  const snapshot = (lotId: string, rest: object) => ({
    lotId,
    lotCode: `CODE-${lotId}`,
    supplierId: null,
    ...rest,
  });

  it("starts empty without stored lots", () => {
    expect(initialLotChoices(undefined)).toEqual({
      rows: {},
      wick: "",
      vessel: "",
    });
    expect(initialLotChoices([])).toEqual(EMPTY_LOT_CHOICES);
  });

  it("starts from the stored rows, wick and vessel", () => {
    const choices = initialLotChoices([
      snapshot("l1", { part: "row", componentId: "wax-1" }),
      snapshot("l2", { part: "row", componentId: "oil-1" }),
      snapshot("l3", { part: "wick" }),
      snapshot("l4", { part: "vessel" }),
    ] as BatchLot[]);
    expect(choices).toEqual({
      rows: { "wax-1": "l1", "oil-1": "l2" },
      wick: "l3",
      vessel: "l4",
    });
  });

  it("sends rows in the version's order, then the wick, then the vessel", () => {
    const input = lotInputs(
      { rows: { "oil-1": "l2", "wax-1": "l1" }, wick: "l3", vessel: "l4" },
      ["wax-1", "oil-1"],
    );
    expect(input).toEqual([
      { part: "row", componentId: "wax-1", lotId: "l1" },
      { part: "row", componentId: "oil-1", lotId: "l2" },
      { part: "wick", lotId: "l3" },
      { part: "vessel", lotId: "l4" },
    ]);
  });

  it("leaves out cleared choices and rows that are not in the version", () => {
    expect(
      lotInputs(
        { rows: { "wax-1": "", "gone-1": "l9" }, wick: "", vessel: "l4" },
        ["wax-1"],
      ),
    ).toEqual([{ part: "vessel", lotId: "l4" }]);
    expect(lotInputs(EMPTY_LOT_CHOICES, ["wax-1"])).toEqual([]);
  });

  it("round trips: stored links to the form and back", () => {
    const stored = [
      snapshot("l1", { part: "row", componentId: "wax-1" }),
      snapshot("l3", { part: "wick" }),
    ] as BatchLot[];
    expect(lotInputs(initialLotChoices(stored), ["wax-1", "oil-1"])).toEqual([
      { part: "row", componentId: "wax-1", lotId: "l1" },
      { part: "wick", lotId: "l3" },
    ]);
  });

  it("validateForm sends the full lots array, and [] when all are cleared", () => {
    const withLots = validateForm(
      {
        ...values("2026-11-10"),
        lots: { rows: { "wax-1": "l1" }, wick: "", vessel: "" },
      },
      ["wax-1"],
      TODAY,
    );
    expect(withLots.input?.lots).toEqual([
      { part: "row", componentId: "wax-1", lotId: "l1" },
    ]);
    const cleared = validateForm(
      { ...values("2026-11-10"), lots: EMPTY_LOT_CHOICES },
      ["wax-1"],
      TODAY,
    );
    expect(cleared.input?.lots).toEqual([]);
  });

  it("validateForm leaves lots out when the form has no lot state", () => {
    const { input } = validateForm(values("2026-11-10"), [], TODAY);
    expect(input).not.toBeNull();
    expect(input && "lots" in input).toBe(false);
  });
});
