/**
 * `@/lib/candlefix`: pure CandleFix logic (things to check, before-and-after, timeline).
 */
export * from "./contract";
export * from "./checklists";
export * from "./comparison";
export * from "./timeline";

import type { CandleFixModule } from "./contract";
import { checklistFor, checklistItemById, checklistView } from "./checklists";
import { batchBurnSummary, buildBeforeAfter } from "./comparison";
import { buildTimeline } from "./timeline";

/** Compile-time check that the module matches the contract. */
export const _candleFixCheck: CandleFixModule = {
  checklistFor,
  checklistItemById,
  checklistView,
  batchBurnSummary,
  buildBeforeAfter,
  buildTimeline,
};
