/**
 * GramGuard fixed-point parsing and exact integer helpers (T08).
 *
 * Source of truth: docs/specs/2 Calculation Rules.md (V-01, CALC-06, CALC-07,
 * CALC-08). Pure functions, BigInt for every intermediate, no floating point.
 */
import type { PrecisionMg } from "@/lib/types";
import type {
  ParseFixed,
  ParseFixedResult,
  PrecisionDecimals,
  PrecisionLabel,
} from "./contract";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/** A BigInt as a safe-integer `number`. Throws RangeError beyond ±MAX_SAFE_INTEGER. */
export function toSafeInt(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new RangeError("Value is outside the safe integer range.");
  }
  return Number(value);
}

/** A `number` that must be a safe integer, as a BigInt. Throws RangeError otherwise. */
export function toBig(value: number, what = "value"): bigint {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${what} must be a safe integer.`);
  }
  return BigInt(value);
}

/** n ÷ d rounded half up, for n >= 0 and d > 0 (CALC-08). */
export function divHalfUp(n: bigint, d: bigint): bigint {
  if (d <= BigInt(0) || n < BigInt(0)) throw new RangeError("divHalfUp needs n >= 0 and d > 0.");
  return (BigInt(2) * n + d) / (BigInt(2) * d);
}

/** n ÷ d rounded half away from zero, for d > 0 (CALC-08, signed differences). */
export function divHalfAwayFromZero(n: bigint, d: bigint): bigint {
  if (d <= BigInt(0)) throw new RangeError("divHalfAwayFromZero needs d > 0.");
  return n < BigInt(0) ? -divHalfUp(-n, d) : divHalfUp(n, d);
}

/**
 * V-01. Parses digits with at most one period into an exact integer
 * `value × 10^scale`. See `ParseFixedResult` in contract.ts.
 */
export const parseFixed: ParseFixed = (text, scale): ParseFixedResult => {
  if (!Number.isInteger(scale) || scale < 0) {
    throw new RangeError("scale must be a whole number of 0 or more.");
  }
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  const match = /^(\d*)(?:\.(\d*))?$/.exec(trimmed);
  if (!match) return { ok: false, reason: "format" };
  const intPart = match[1] ?? "";
  const fracPart = match[2] ?? "";
  if (intPart.length + fracPart.length === 0) return { ok: false, reason: "format" };

  const fracSignificant = fracPart.replace(/0+$/, "");
  const decimals = fracSignificant.length;
  if (decimals > scale) return { ok: false, reason: "tooManyDecimals" };

  const digits = (intPart + fracSignificant.padEnd(scale, "0")).replace(/^0+(?=\d)/, "");
  const value = BigInt(digits === "" ? "0" : digits);
  if (value > MAX_SAFE) return { ok: false, reason: "tooLarge" };

  return { ok: true, value: Number(value), decimals };
};

/** 0, 1 or 2 decimals for 1 g, 0.1 g, 0.01 g. */
export const precisionDecimals: PrecisionDecimals = (precisionMg) => {
  switch (precisionMg) {
    case 1000:
      return 0;
    case 100:
      return 1;
    case 10:
      return 2;
    default:
      throw new RangeError("precisionMg must be 1000, 100 or 10.");
  }
};

/** "1 g" | "0.1 g" | "0.01 g". */
export const precisionLabel: PrecisionLabel = (precisionMg: PrecisionMg) => {
  switch (precisionMg) {
    case 1000:
      return "1 g";
    case 100:
      return "0.1 g";
    case 10:
      return "0.01 g";
    default:
      throw new RangeError("precisionMg must be 1000, 100 or 10.");
  }
};
