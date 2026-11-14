/**
 * GramGuard display formatting (T08). CALC-11, CALC-18.
 *
 * Every function turns an integer into text with BigInt arithmetic only. No
 * Number.prototype.toFixed, no floating point, no thousands separators. Negatives use the ASCII
 * hyphen-minus. Values that need rounding round half away from zero.
 */
import { precisionDecimals, toBig } from "./fixed";
import type {
  FormatFactor,
  FormatGrams,
  FormatHundredths,
  FormatMeasured,
  FormatMinimalGrams,
  FormatPercent2,
  FormatRequestedPercent,
  FormatSignedGrams,
  FormatSignedPercent2,
  FormatWeight,
} from "./contract";

const TEN = BigInt(10);

function pow10(n: number): bigint {
  let result = BigInt(1);
  for (let i = 0; i < n; i++) result *= TEN;
  return result;
}

type Fixed = {
  /** Absolute value as text with `dp` decimals. */
  text: string;
  /** True only when the value is negative and does not round to zero. */
  negative: boolean;
  /** True when the rounded value is zero. */
  zero: boolean;
};

/**
 * `value` is an integer in units of 10^-valueScale. Renders it with exactly
 * `dp` decimals. When dp < valueScale the value is rounded half away from zero.
 */
function renderFixed(value: number, valueScale: number, dp: number, what: string): Fixed {
  const big = toBig(value, what);
  const abs = big < BigInt(0) ? -big : big;
  let q: bigint;
  if (dp < valueScale) {
    const div = pow10(valueScale - dp);
    q = (BigInt(2) * abs + div) / (BigInt(2) * div);
  } else {
    q = abs * pow10(dp - valueScale);
  }
  const s = q.toString().padStart(dp + 1, "0");
  const text = dp > 0 ? `${s.slice(0, s.length - dp)}.${s.slice(s.length - dp)}` : s;
  return { text, negative: big < BigInt(0) && q !== BigInt(0), zero: q === BigInt(0) };
}

/** Fewest decimals (0..valueScale) that show the value exactly. */
function minimalDecimals(value: number, valueScale: number, what: string): number {
  const big = toBig(value, what);
  let abs = big < BigInt(0) ? -big : big;
  let dp = valueScale;
  while (dp > 0 && abs % TEN === BigInt(0)) {
    abs /= TEN;
    dp -= 1;
  }
  return dp;
}

/** A value shown with its fewest exact decimals, signed with "-" only. */
function minimalText(value: number, valueScale: number, what: string): string {
  const dp = minimalDecimals(value, valueScale, what);
  const f = renderFixed(value, valueScale, dp, what);
  return f.negative ? `-${f.text}` : f.text;
}

/** CALC-11. 463000 mg at 0.1 g → "463.0". */
export const formatWeight: FormatWeight = (mg, precisionMg) => {
  const f = renderFixed(mg, 3, precisionDecimals(precisionMg), "mg");
  return f.negative ? `-${f.text}` : f.text;
};

/** FormatWeight plus the unit: "463.0 g". */
export const formatGrams: FormatGrams = (mg, precisionMg) => `${formatWeight(mg, precisionMg)} g`;

/** Decimals for a measured weight: the formula's, or up to 2 when finer was typed. */
function measuredDecimals(mg: number, precisionMg: Parameters<FormatMeasured>[1]): number {
  const needed = Math.min(minimalDecimals(mg, 3, "mg"), 2);
  return Math.max(precisionDecimals(precisionMg), needed);
}

/** CALC-18. 1003200 at 0.1 g → "1003.2"; 26150 → "26.15". */
export const formatMeasured: FormatMeasured = (mg, precisionMg) => {
  const f = renderFixed(mg, 3, measuredDecimals(mg, precisionMg), "mg");
  return f.negative ? `-${f.text}` : f.text;
};

/** +3200 → "+3.2 g", -600 → "-0.6 g", 0 → "0.0 g". */
export const formatSignedGrams: FormatSignedGrams = (mg, precisionMg) => {
  const f = renderFixed(mg, 3, measuredDecimals(mg, precisionMg), "mg");
  const sign = f.zero ? "" : f.negative ? "-" : "+";
  return `${sign}${f.text} g`;
};

/** 180000 → "180", 462500 → "462.5". */
export const formatMinimalGrams: FormatMinimalGrams = (mg) => minimalText(mg, 3, "mg");

/** 741 → "7.41". */
export const formatPercent2: FormatPercent2 = (hundredths) => {
  const f = renderFixed(hundredths, 2, 2, "hundredths");
  return f.negative ? `-${f.text}` : f.text;
};

/** 32 → "+0.32", -225 → "-2.25", 0 → "0.00". */
export const formatSignedPercent2: FormatSignedPercent2 = (hundredths) => {
  const f = renderFixed(hundredths, 2, 2, "hundredths");
  const sign = f.zero ? "" : f.negative ? "-" : "+";
  return `${sign}${f.text}`;
};

/** 800 → "8", 825 → "8.25". */
export const formatRequestedPercent: FormatRequestedPercent = (bp) => minimalText(bp, 2, "bp");

/** 300 → "3", 3333 → "33.33". */
export const formatHundredths: FormatHundredths = (x100) => minimalText(x100, 2, "x100");

/** 16667 → "1.67". */
export const formatFactor: FormatFactor = (factorX10000) => {
  const f = renderFixed(factorX10000, 4, 2, "factorX10000");
  return f.negative ? `-${f.text}` : f.text;
};
