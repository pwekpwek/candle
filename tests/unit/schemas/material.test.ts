import { describe, expect, it } from "vitest";
import { MaterialSchema, MaterialSnapshotSchema } from "@/lib/schemas";
import { clone, omit, oilMaterial, vesselMaterial, waxMaterial } from "./sample";

describe("MaterialSchema", () => {
  it("accepts a valid sample of each material type", () => {
    for (const sample of [waxMaterial, oilMaterial, vesselMaterial]) {
      expect(MaterialSchema.safeParse(sample).success).toBe(true);
    }
  });

  it("accepts a minimal material and an 80-character name", () => {
    const minimal = omit(oilMaterial, "notes");
    expect(MaterialSchema.safeParse(minimal).success).toBe(true);
    expect(MaterialSchema.safeParse({ ...oilMaterial, name: "x".repeat(80) }).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an empty name", { ...oilMaterial, name: "" }],
    ["a name that is only spaces", { ...oilMaterial, name: "   " }],
    ["an 81-character name", { ...oilMaterial, name: "x".repeat(81) }],
    ["an unknown material type", { ...oilMaterial, type: "candle" }],
    ["a non-UUID id", { ...oilMaterial, id: "lavender-1" }],
    ["a createdAt that is not ISO 8601", { ...oilMaterial, createdAt: "14/11/2026" }],
    ["a timestamp with a non-UTC offset", { ...oilMaterial, updatedAt: "2026-11-14T06:05:12+01:00" }],
    ["a number as the name", { ...oilMaterial, name: 42 }],
    ["an unknown top-level key", { ...oilMaterial, colour: "red" }],
    ["a missing id", omit(oilMaterial, "id")],
    ["a missing name", omit(oilMaterial, "name")],
    ["a missing type", omit(oilMaterial, "type")],
    ["a missing createdAt", omit(oilMaterial, "createdAt")],
    ["a missing updatedAt", omit(oilMaterial, "updatedAt")],
    ["a missing archivedAt (must be null, not absent)", omit(oilMaterial, "archivedAt")],
    ["a non-string supplier", { ...oilMaterial, supplier: 7 }],
    ["a wax maximum above 50%", { ...waxMaterial, wax: { maxFragranceBp: 5001 } }],
    ["a negative wax maximum", { ...waxMaterial, wax: { maxFragranceBp: -1 } }],
    ["a fractional wax maximum", { ...waxMaterial, wax: { maxFragranceBp: 10.5 } }],
    ["an unknown wax maximum basis", { ...waxMaterial, wax: { maxFragranceBasis: "sum" } }],
    ["an unknown key in wax details", { ...waxMaterial, wax: { maxFragranceBp: 800, grade: "A" } }],
    ["a non-string wick size", { ...oilMaterial, wick: { size: 12 } }],
    ["a zero vessel capacity", { ...vesselMaterial, vessel: { capacityMl: 0 } }],
    ["a zero default fill", { ...vesselMaterial, vessel: { defaultFillMg: 0 } }],
    ["a default fill above the weight limit", { ...vesselMaterial, vessel: { defaultFillMg: 1_000_000_001 } }],
    ["a fractional default fill", { ...vesselMaterial, vessel: { defaultFillMg: 180000.5 } }],
    ["an unknown key in vessel details", { ...vesselMaterial, vessel: { capacityMl: 200, shape: "tin" } }],
  ])("rejects %s", (_label, input) => {
    expect(MaterialSchema.safeParse(input).success).toBe(false);
  });

  it("rejects an unknown key added to an otherwise valid material", () => {
    const input = clone(waxMaterial) as unknown as Record<string, unknown>;
    input.extra = true;
    expect(MaterialSchema.safeParse(input).success).toBe(false);
  });
});

describe("MaterialSnapshotSchema", () => {
  it("accepts a snapshot and rejects an empty name or an unknown key", () => {
    const snapshot = { type: "fragranceOil", name: "Lavender" };
    expect(MaterialSnapshotSchema.safeParse(snapshot).success).toBe(true);
    expect(MaterialSnapshotSchema.safeParse({ ...snapshot, name: "" }).success).toBe(false);
    expect(MaterialSnapshotSchema.safeParse({ ...snapshot, id: "x" }).success).toBe(false);
  });
});
