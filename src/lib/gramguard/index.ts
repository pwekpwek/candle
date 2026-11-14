/**
 * `@/lib/gramguard` — the only calculation path (TRD-03).
 *
 * T08 provides parsing, formatting and planning. T09 adds measure, scale,
 * validate and from-version exports to this file.
 */
export * from "./contract";
export * from "./fixed";
export * from "./format";
export * from "./plan";

import type { GramGuardEngine } from "./contract";
import { parseFixed, precisionDecimals, precisionLabel } from "./fixed";
import {
  formatFactor,
  formatGrams,
  formatHundredths,
  formatMeasured,
  formatMinimalGrams,
  formatPercent2,
  formatRequestedPercent,
  formatSignedGrams,
  formatSignedPercent2,
  formatWeight,
} from "./format";
import { computePlan, convertBasis, sizingTotalMg } from "./plan";

/**
 * Compile-time check that the engine core matches the contract. Wave 4 (T09)
 * widens this to the full `GramGuardEngine` and may rename it.
 */
export const _engineCoreCheck: Pick<
  GramGuardEngine,
  | "parseFixed"
  | "precisionDecimals"
  | "precisionLabel"
  | "formatWeight"
  | "formatGrams"
  | "formatMeasured"
  | "formatSignedGrams"
  | "formatMinimalGrams"
  | "formatPercent2"
  | "formatSignedPercent2"
  | "formatRequestedPercent"
  | "formatHundredths"
  | "formatFactor"
  | "computePlan"
  | "sizingTotalMg"
  | "convertBasis"
> = {
  parseFixed,
  precisionDecimals,
  precisionLabel,
  formatWeight,
  formatGrams,
  formatMeasured,
  formatSignedGrams,
  formatMinimalGrams,
  formatPercent2,
  formatSignedPercent2,
  formatRequestedPercent,
  formatHundredths,
  formatFactor,
  computePlan,
  sizingTotalMg,
  convertBasis,
};
