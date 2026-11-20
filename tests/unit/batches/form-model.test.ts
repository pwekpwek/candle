import { describe, expect, it } from "vitest";
import { checkDate, validateForm } from "@/components/batches/form-model";
import { MESSAGES } from "@/lib/messages";

const B = MESSAGES.batches;
const TODAY = "2026-11-20";
const values = (producedOn: string) => ({ producedOn, label: "", notes: "", texts: {} });

describe("batch date against the earliest burn test", () => {
  const message = B.errProducedAfterBurnTest("Nov 12, 2026");

  it("refuses a date after it", () => {
    expect(checkDate("2026-11-13", TODAY, "2026-11-12")).toBe(message);
    const { errors, input } = validateForm(values("2026-11-13"), [], TODAY, "2026-11-12");
    expect(errors.producedOn).toBe(message);
    expect(input).toBeNull();
  });

  it("accepts the same day and earlier", () => {
    expect(checkDate("2026-11-12", TODAY, "2026-11-12")).toBeNull();
    expect(checkDate("2026-11-01", TODAY, "2026-11-12")).toBeNull();
    expect(validateForm(values("2026-11-12"), [], TODAY, "2026-11-12").input).not.toBeNull();
  });

  it("ignores it when there is no burn test", () => {
    expect(checkDate("2026-11-13", TODAY, null)).toBeNull();
    expect(checkDate("2026-11-13", TODAY)).toBeNull();
  });
});
