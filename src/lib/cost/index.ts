/**
 * `@/lib/cost`: pure TrueCandle Cost calculation, formatting and parsing.
 */
export * from "./contract";

import type { CostModule } from "./contract";
import { add, div, fraction, mul, roundCentavos, sub } from "./rational";
import { calculateCost, calculateScenario } from "./calc";
import {
  centavosToInput,
  formatBp,
  formatCentavos,
  formatHours,
  formatMargin,
  formatPeso,
  formatUnitPrice,
} from "./format";
import { parseHours, parseMoney, parsePercent, parseWholeNumber } from "./parse";

export {
  add,
  div,
  fraction,
  mul,
  roundCentavos,
  sub,
  calculateCost,
  calculateScenario,
  centavosToInput,
  formatBp,
  formatCentavos,
  formatHours,
  formatMargin,
  formatPeso,
  formatUnitPrice,
  parseHours,
  parseMoney,
  parsePercent,
  parseWholeNumber,
};

/** Compile-time check that the module matches the contract. */
export const _costCheck: CostModule = {
  fraction,
  add,
  sub,
  mul,
  div,
  roundCentavos,
  calculateCost,
  calculateScenario,
  formatPeso,
  formatCentavos,
  formatMargin,
  formatBp,
  formatHours,
  formatUnitPrice,
  centavosToInput,
  parseMoney,
  parseHours,
  parsePercent,
  parseWholeNumber,
};
