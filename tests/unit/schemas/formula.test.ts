import { describe, expect, it } from "vitest";
import { FormulaSchema } from "@/lib/schemas";
import { formula, omit } from "./sample";

describe("FormulaSchema", () => {
  it("accepts a valid formula and one without notes", () => {
    expect(FormulaSchema.safeParse(formula).success).toBe(true);
    expect(FormulaSchema.safeParse(omit(formula, "notes")).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an empty name", { ...formula, name: "" }],
    ["a name of 81 characters", { ...formula, name: "x".repeat(81) }],
    ["a name that is only whitespace", { ...formula, name: "\t  " }],
    ["latestVersionNumber of 0", { ...formula, latestVersionNumber: 0 }],
    ["a fractional latestVersionNumber", { ...formula, latestVersionNumber: 1.5 }],
    ["a string latestVersionNumber", { ...formula, latestVersionNumber: "1" }],
    ["a non-UUID id", { ...formula, id: "f1" }],
    ["an updatedAt without a time", { ...formula, updatedAt: "2026-11-15" }],
    ["an archivedAt that is an empty string", { ...formula, archivedAt: "" }],
    ["an unknown key", { ...formula, draft: true }],
    ["a missing name", omit(formula, "name")],
    ["a missing latestVersionNumber", omit(formula, "latestVersionNumber")],
    ["a missing archivedAt", omit(formula, "archivedAt")],
  ])("rejects %s", (_label, input) => {
    expect(FormulaSchema.safeParse(input).success).toBe(false);
  });
});
