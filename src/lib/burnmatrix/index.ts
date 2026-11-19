/**
 * `@/lib/burnmatrix`: pure BurnMatrix calculations, comparison and CSV.
 */
export * from "./contract";
export * from "./calc";
export * from "./comparison";
export * from "./csv";

import type { BurnMatrixModule } from "./contract";
import { burnFigures, candleTotals, formatDuration, formatMm, formatRate } from "./calc";
import { buildComparison } from "./comparison";
import { buildBurnCsv, csvFileName } from "./csv";

/** Compile-time check that the module matches the contract. */
export const _burnMatrixCheck: BurnMatrixModule = {
  burnFigures,
  candleTotals,
  buildComparison,
  formatDuration,
  formatRate,
  formatMm,
  buildBurnCsv,
  csvFileName,
};
