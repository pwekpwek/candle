/**
 * `@/lib/gramguard` — the only calculation path (TRD-03).
 */
export * from "./contract";
export * from "./fixed";
export * from "./format";
export * from "./plan";
export * from "./measure";
export * from "./scale";
export * from "./validate";
export * from "./from-version";

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
import { compareMeasured, parseMeasured } from "./measure";
import { evaluateScale } from "./scale";
import { emptyEditorFields, evaluateFormula } from "./validate";
import { compareInputFromVersion, fieldsFromVersion, planInputFromVersion } from "./from-version";

/** Compile-time check that the whole engine matches the contract. */
export const _engineCheck: GramGuardEngine = {
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
  evaluateFormula,
  emptyEditorFields,
  fieldsFromVersion,
  planInputFromVersion,
  parseMeasured,
  compareMeasured,
  compareInputFromVersion,
  evaluateScale,
};
