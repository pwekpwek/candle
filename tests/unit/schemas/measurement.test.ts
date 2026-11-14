import { describe, expect, it } from "vitest";
import { MeasurementSchema } from "@/lib/schemas";
import { measurement, omit } from "./sample";

describe("MeasurementSchema", () => {
  it("accepts a valid measurement, with or without the optional fields", () => {
    expect(MeasurementSchema.safeParse(measurement).success).toBe(true);
    const bare = omit(measurement, "measuredOn");
    expect(MeasurementSchema.safeParse({ ...bare, entries: [], notes: undefined }).success).toBe(true);
  });

  it("accepts a measured weight of 0 g (V-16)", () => {
    const zero = { ...measurement, entries: [{ componentId: "row-oil", actualMg: 0 }] };
    expect(MeasurementSchema.safeParse(zero).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ["a negative measured weight", { ...measurement, entries: [{ componentId: "row-wax", actualMg: -1 }] }],
    [
      "a measured weight above 1 000 000 g",
      { ...measurement, entries: [{ componentId: "row-wax", actualMg: 1_000_000_001 }] },
    ],
    ["a fractional measured weight", { ...measurement, entries: [{ componentId: "row-wax", actualMg: 463.1 }] }],
    ["an empty component id in an entry", { ...measurement, entries: [{ componentId: "", actualMg: 1 }] }],
    [
      "the same component measured twice",
      {
        ...measurement,
        entries: [
          { componentId: "row-wax", actualMg: 1 },
          { componentId: "row-wax", actualMg: 2 },
        ],
      },
    ],
    ["an unknown key in an entry", { ...measurement, entries: [{ componentId: "row-wax", actualMg: 1, unit: "g" }] }],
    ["a measuredOn that is not a date", { ...measurement, measuredOn: "14 Nov 2026" }],
    ["a measuredOn with a time", { ...measurement, measuredOn: "2026-11-14T06:00:00.000Z" }],
    ["a measuredOn that is not a real date", { ...measurement, measuredOn: "2026-02-30" }],
    ["a non-UUID versionId", { ...measurement, versionId: "v1" }],
    ["a missing versionId", omit(measurement, "versionId")],
    ["a missing entries list", omit(measurement, "entries")],
    ["a missing createdAt", omit(measurement, "createdAt")],
    ["an unknown top-level key", { ...measurement, draft: true }],
  ])("rejects %s", (_label, input) => {
    expect(MeasurementSchema.safeParse(input).success).toBe(false);
  });
});
