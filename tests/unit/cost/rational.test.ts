import { describe, expect, it } from "vitest";
import { add, div, fraction, mul, roundCentavos, sub } from "@/lib/cost";

describe("fractions", () => {
  it("normalises by gcd and keeps the sign in the numerator", () => {
    expect(fraction(6, 4)).toEqual({ n: BigInt(3), d: BigInt(2) });
    expect(fraction(3, -6)).toEqual({ n: BigInt(-1), d: BigInt(2) });
    expect(fraction(-3, -6)).toEqual({ n: BigInt(1), d: BigInt(2) });
    expect(fraction(0, 7)).toEqual({ n: BigInt(0), d: BigInt(1) });
    expect(fraction(BigInt(10), BigInt(5))).toEqual({ n: BigInt(2), d: BigInt(1) });
  });

  it("rejects a zero denominator and unsafe numbers", () => {
    expect(() => fraction(1, 0)).toThrow(RangeError);
    expect(() => fraction(1.5)).toThrow(RangeError);
  });

  it("adds, subtracts, multiplies and divides exactly", () => {
    const a = fraction(1, 3);
    const b = fraction(1, 6);
    expect(add(a, b)).toEqual(fraction(1, 2));
    expect(sub(b, a)).toEqual(fraction(-1, 6));
    expect(mul(a, b)).toEqual(fraction(1, 18));
    expect(div(a, b)).toEqual(fraction(2));
    expect(sub(a, a)).toEqual({ n: BigInt(0), d: BigInt(1) });
  });

  it("throws RangeError dividing by zero", () => {
    expect(() => div(fraction(1), fraction(0))).toThrow(RangeError);
  });

  it("rounds half away from zero", () => {
    expect(roundCentavos(fraction(5, 2))).toBe(BigInt(3));
    expect(roundCentavos(fraction(-5, 2))).toBe(BigInt(-3));
    expect(roundCentavos(fraction(499, 1000))).toBe(BigInt(0));
    expect(roundCentavos(fraction(-499, 1000))).toBe(BigInt(0));
    expect(roundCentavos(fraction(1, 2))).toBe(BigInt(1));
    expect(roundCentavos(fraction(7))).toBe(BigInt(7));
  });
});
