/**
 * Exact fractions for TrueCandle Cost (bigint only, no floating point).
 * A `Fraction` is normalised: d > 0, gcd(|n|, d) = 1, and zero is 0/1.
 */
import { divHalfAwayFromZero } from "@/lib/gramguard/fixed";
import type { Fraction } from "./contract";

function abs(x: bigint): bigint {
  return x < BigInt(0) ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== BigInt(0)) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function toBigInt(value: number | bigint, what: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) throw new RangeError(`${what} must be a safe integer.`);
  return BigInt(value);
}

function make(n: bigint, d: bigint): Fraction {
  if (d === BigInt(0)) throw new RangeError("Fraction denominator cannot be 0.");
  if (n === BigInt(0)) return { n: BigInt(0), d: BigInt(1) };
  const sign = d < BigInt(0) ? BigInt(-1) : BigInt(1);
  const g = gcd(n, d);
  return { n: (sign * n) / g, d: (sign * d) / g };
}

/** A whole number (number or bigint) over an optional denominator, in lowest terms. */
export function fraction(n: number | bigint, d: number | bigint = 1): Fraction {
  return make(toBigInt(n, "numerator"), toBigInt(d, "denominator"));
}

export function add(a: Fraction, b: Fraction): Fraction {
  return make(a.n * b.d + b.n * a.d, a.d * b.d);
}

export function sub(a: Fraction, b: Fraction): Fraction {
  return make(a.n * b.d - b.n * a.d, a.d * b.d);
}

export function mul(a: Fraction, b: Fraction): Fraction {
  return make(a.n * b.n, a.d * b.d);
}

/** Throws RangeError when b is 0. */
export function div(a: Fraction, b: Fraction): Fraction {
  if (b.n === BigInt(0)) throw new RangeError("Division by zero.");
  return make(a.n * b.d, a.d * b.n);
}

/** Rounded half away from zero to a whole number. */
export function roundCentavos(value: Fraction): bigint {
  return divHalfAwayFromZero(value.n, value.d);
}

export const ZERO: Fraction = { n: BigInt(0), d: BigInt(1) };
export const ONE: Fraction = { n: BigInt(1), d: BigInt(1) };

export function sum(values: readonly Fraction[]): Fraction {
  return values.reduce((acc, v) => add(acc, v), ZERO);
}

export function isZero(a: Fraction): boolean {
  return a.n === BigInt(0);
}
