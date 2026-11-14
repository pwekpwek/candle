import { describe, expect, it } from "vitest";
import { evaluateScale } from "@/lib/gramguard";
import type { Sizing } from "@/lib/types";

const vessels: Sizing = { mode: "vessels", count: 6, fillMg: 180_000 };
const total: Sizing = { mode: "total", amountMg: 333_300 };

describe("evaluateScale", () => {
  it("vessel count (WE-9a)", () => {
    const r = evaluateScale(vessels, 100, { method: "vesselCount", count: "10", fill: "" });
    expect(r).toEqual({
      issues: [],
      sizing: { mode: "vessels", count: 10, fillMg: 180_000 },
      scale: { method: "vesselCount", factorX10000: 16667 },
    });
  });
  it("new fill weight changes the total factor", () => {
    const r = evaluateScale(vessels, 100, { method: "vesselCount", count: "6", fill: "90" });
    expect(r.sizing).toEqual({ mode: "vessels", count: 6, fillMg: 90_000 });
    expect(r.scale?.factorX10000).toBe(5000);
  });
  it("vessel issues", () => {
    expect(evaluateScale(vessels, 100, { method: "vesselCount", count: "2.5", fill: "" }).issues).toEqual([
      { rule: "V-05", field: "scale.count", severity: "error" },
    ]);
    expect(evaluateScale(vessels, 100, { method: "vesselCount", count: "1,0", fill: "" }).issues[0]).toMatchObject({ rule: "V-01" });
    const r = evaluateScale(vessels, 100, { method: "vesselCount", count: "9999", fill: "1000" });
    expect(r.issues).toEqual([{ rule: "V-06", field: "scale.fill", severity: "error", as: "V-03" }]);
    expect(r.sizing).toBeNull();
    expect(r.scale).toBeNull();
    expect(evaluateScale(vessels, 100, { method: "vesselCount", count: "3", fill: "10.05" }).issues[0]).toMatchObject({
      rule: "V-06",
      as: "V-04",
      field: "scale.fill",
      lower: "10.0",
      upper: "10.1",
      finerPrecisionMg: 10,
    });
  });
  it("amount", () => {
    const r = evaluateScale(total, 100, { method: "amount", amount: "500" });
    expect(r.sizing).toEqual({ mode: "total", amountMg: 500_000 });
    expect(r.scale).toEqual({ method: "amount", factorX10000: 15002 });
    expect(evaluateScale(total, 100, { method: "amount", amount: "" }).issues[0]).toMatchObject({ rule: "V-03", field: "scale.amount" });
    expect(evaluateScale(total, 100, { method: "amount", amount: "500.55" }).issues[0]).toMatchObject({
      rule: "V-04",
      lower: "500.5",
      upper: "500.6",
      finerPrecisionMg: 10,
    });
  });
  it("multiplier (WE-9d)", () => {
    const r = evaluateScale(total, 100, { method: "multiplier", multiplier: "1.5" });
    expect(r.sizing).toEqual({ mode: "total", amountMg: 500_000 });
    expect(r.scale?.method).toBe("multiplier");
    expect(r.scale?.factorX10000).toBe(15002);
    const w = evaluateScale({ mode: "wax", amountMg: 500_000 }, 100, { method: "multiplier", multiplier: "1.25" });
    expect(w.sizing).toEqual({ mode: "wax", amountMg: 625_000 });
    expect(w.scale?.factorX10000).toBe(12500);
  });
  it("multiplier issues", () => {
    const bad = (m: string) => evaluateScale(total, 100, { method: "multiplier", multiplier: m }).issues[0];
    expect(bad("")).toMatchObject({ rule: "V-17", field: "scale.multiplier" });
    expect(bad("0")).toMatchObject({ rule: "V-17" });
    expect(bad("1000.01")).toMatchObject({ rule: "V-17" });
    expect(bad("1.234")).toMatchObject({ rule: "V-17" });
    expect(bad("-1")).toMatchObject({ rule: "V-01" });
  });
  it("a result rounding to 0 g or above the limit is V-17", () => {
    const tiny: Sizing = { mode: "total", amountMg: 1000 };
    expect(evaluateScale(tiny, 1000, { method: "multiplier", multiplier: "0.01" }).issues[0]).toMatchObject({ rule: "V-17" });
    const big: Sizing = { mode: "total", amountMg: 500_000_000 };
    expect(evaluateScale(big, 100, { method: "multiplier", multiplier: "3" }).issues[0]).toMatchObject({ rule: "V-17" });
  });
  it("throws on a method that does not fit the mode", () => {
    expect(() => evaluateScale(total, 100, { method: "vesselCount", count: "1", fill: "" })).toThrow();
    expect(() => evaluateScale(vessels, 100, { method: "amount", amount: "1" })).toThrow();
    expect(() => evaluateScale(vessels, 100, { method: "multiplier", multiplier: "1" })).toThrow();
  });
});
