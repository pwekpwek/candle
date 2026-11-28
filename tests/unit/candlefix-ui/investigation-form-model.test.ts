import { describe, expect, it } from "vitest";
import {
  buildInput,
  checkErrorKey,
  emptyHypothesis,
  formErrors,
  hypothesisErrorKey,
  investigationTitle,
  newFormValues,
  noLongerListed,
  validateForm,
  valuesFromInvestigation,
  type Context,
  type FormValues,
} from "@/components/candlefix/investigation/form-model";
import { MESSAGES } from "@/lib/messages";
import type { Investigation } from "@/lib/types";

const M = MESSAGES.candleFix;
const ctx: Context = { today: "2026-11-28", producedOn: "2026-11-10", formatDate: (d) => `<${d}>` };

function values(overrides: Partial<FormValues> = {}): FormValues {
  return { ...newFormValues("2026-11-20"), issues: ["frosting"], ...overrides };
}

const stored: Investigation = {
  id: "i1",
  batchId: "b1",
  observedOn: "2026-11-14",
  title: "Rough top",
  issues: ["frosting", "other"],
  otherIssue: "Pitting",
  notes: "Seen on day 2",
  checks: [
    { itemId: "frosting.pour-temperature", issue: "frosting", label: "Pour temperature at the time", checked: true, note: "58 C" },
    { itemId: "soot.wick-size", issue: "soot", label: "Wick size", checked: true },
  ],
  hypotheses: [
    { id: "h1", text: "Cold container", status: "testing", notes: "n", createdAt: "2026-11-14T10:00:00.000Z", updatedAt: "2026-11-14T10:00:00.000Z" },
  ],
  archivedAt: null,
  createdAt: "2026-11-14T10:00:00.000Z",
  updatedAt: "2026-11-14T10:00:00.000Z",
};

describe("investigation form model", () => {
  it("starts a new form on today with nothing chosen", () => {
    const v = newFormValues("2026-11-20");
    expect(v).toMatchObject({ observedOn: "2026-11-20", issues: [], hypotheses: [], checks: {}, storedTicks: [] });
    expect(formErrors(v, ctx).issues).toBe(M.errIssuesRequired);
  });

  it("round-trips a stored investigation, keeping hypothesis ids and stored ticks", () => {
    let n = 0;
    const v = valuesFromInvestigation(stored, () => `k${n++}`);
    expect(v.hypotheses).toEqual([{ key: "k0", id: "h1", text: "Cold container", status: "testing", notes: "n" }]);
    const input = buildInput(v);
    expect(input).toMatchObject({
      observedOn: "2026-11-14",
      title: "Rough top",
      issues: ["frosting", "other"],
      otherIssue: "Pitting",
      notes: "Seen on day 2",
      hypotheses: [{ id: "h1", text: "Cold container", status: "testing", notes: "n" }],
    });
    // The soot tick is not in a chosen issue: it goes back unchanged.
    expect(noLongerListed(v).map((t) => t.itemId)).toEqual(["soot.wick-size"]);
    expect(input.checks).toEqual([
      { itemId: "frosting.pour-temperature", issue: "frosting", label: "Pour temperature at the time", checked: true, note: "58 C" },
      { itemId: "soot.wick-size", issue: "soot", label: "Wick size", checked: true },
    ]);
  });

  it("drops an unticked, unnoted item but keeps a note on an unticked one", () => {
    const v = values({
      checks: {
        "frosting.pour-temperature": { checked: false, note: "" },
        "frosting.cure-time": { checked: false, note: " looked later " },
      },
    });
    const checks = buildInput(v).checks;
    expect(checks.map((c) => c.itemId)).toEqual(["frosting.cure-time"]);
    expect(checks[0]).toMatchObject({ checked: false, note: "looked later" });
  });

  it("trims text and leaves out empty optional fields", () => {
    const input = buildInput(
      values({ title: "  ", notes: " ", otherIssue: "ignored", hypotheses: [{ ...emptyHypothesis("k"), text: " idea ", notes: " " }] }),
    );
    expect(input).toEqual({
      observedOn: "2026-11-20",
      issues: ["frosting"],
      checks: [],
      hypotheses: [{ text: "idea", status: "open" }],
    });
  });

  it("requires a real date, not in the future, not before production", () => {
    expect(formErrors(values({ observedOn: "" }), ctx).observedOn).toBe(M.errDateRequired);
    expect(formErrors(values({ observedOn: "2026-02-31" }), ctx).observedOn).toBe(M.errDateInvalid);
    expect(formErrors(values({ observedOn: "2026-11-29" }), ctx).observedOn).toBe(M.errDateFuture);
    expect(formErrors(values({ observedOn: "2026-11-09" }), ctx).observedOn).toBe(M.errDateBeforeProduced("<2026-11-10>"));
    expect(formErrors(values({ observedOn: "2026-11-10" }), ctx).observedOn).toBeUndefined();
    expect(formErrors(values({ observedOn: "2026-11-28" }), ctx).observedOn).toBeUndefined();
  });

  it("keeps a stored date that no longer follows the rule", () => {
    const v = values({ observedOn: "2026-11-01" });
    expect(formErrors(v, { ...ctx, storedObservedOn: "2026-11-01" }).observedOn).toBeUndefined();
    expect(formErrors(values({ observedOn: "2026-11-02" }), { ...ctx, storedObservedOn: "2026-11-01" }).observedOn).toBeDefined();
  });

  it("needs the Other text only when Other is chosen, 1 to 80 characters", () => {
    expect(formErrors(values({ issues: ["other"], otherIssue: " " }), ctx).otherIssue).toBe(M.errOtherRequired);
    expect(formErrors(values({ issues: ["other"], otherIssue: "x".repeat(81) }), ctx).otherIssue).toBe(M.errOtherTooLong(80));
    expect(formErrors(values({ issues: ["other"], otherIssue: "x".repeat(80) }), ctx).otherIssue).toBeUndefined();
    expect(formErrors(values({ issues: ["frosting"], otherIssue: "" }), ctx).otherIssue).toBeUndefined();
  });

  it("limits the title, notes and check notes", () => {
    const e = formErrors(
      values({
        title: "x".repeat(61),
        notes: "x".repeat(2001),
        checks: { "frosting.cure-time": { checked: true, note: "x".repeat(501) } },
      }),
      ctx,
    );
    expect(e.title).toBe(M.errTitleTooLong(60));
    expect(e.notes).toBe(M.errNotesTooLong(2000));
    expect(e[checkErrorKey("frosting.cure-time")]).toBe(M.errCheckNoteTooLong(500));
  });

  it("requires hypothesis text of 1 to 500 characters", () => {
    const a = { ...emptyHypothesis("a"), text: "  " };
    const b = { ...emptyHypothesis("b"), text: "x".repeat(501) };
    const c = { ...emptyHypothesis("c"), text: "fine", notes: "x".repeat(2001) };
    const e = formErrors(values({ hypotheses: [a, b, c] }), ctx);
    expect(e[hypothesisErrorKey("a", "text")]).toBe(M.errHypothesisRequired);
    expect(e[hypothesisErrorKey("b", "text")]).toBe(M.errHypothesisTooLong(500));
    expect(e[hypothesisErrorKey("c", "notes")]).toBe(M.errHypothesisNotesTooLong(2000));
    expect(validateForm(values({ hypotheses: [a] }), ctx).input).toBeNull();
  });

  it("gives the title, else the issue labels", () => {
    expect(investigationTitle({ title: "Rough top", issues: ["frosting"] })).toBe("Rough top");
    expect(investigationTitle({ issues: ["frosting", "other"], otherIssue: "Pitting" })).toBe("Frosting, Other: Pitting");
  });
});
