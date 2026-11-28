/**
 * CandleFix pure logic — contract (v0.3 CandleFix, lead). Pure functions only:
 * nothing here reads the clock, IndexedDB or the DOM.
 * Design: docs/v0.3-candlefix.md ("Things to check", "Before-and-after view").
 *
 * `@/lib/candlefix` must export every function in `CandleFixModule` below, by
 * these names, plus the types in this file.
 *
 * Rules:
 *   - Things to check are prompts to look at, never a diagnosis, a cause or a
 *     fix. Their text lives in `MESSAGES.candleFixChecks` (wording rule) and
 *     is looked up by id here. Ids are `<issue>.<slug>`, lower-case slug with
 *     hyphens, and never change once released.
 *   - Figures reuse `@/lib/burnmatrix` (`candleTotals`) and integer arithmetic
 *     (`divHalfUp` from `@/lib/gramguard`). Nothing computes a score, a
 *     ranking, a better/worse or a pass/fail.
 */
import type { InvestigationComparisonData } from "@/lib/db/contract";
import type { ChecklistTick, FixIssue, HypothesisStatus, SootLevel } from "@/lib/types";

// ───────────────────────────── Things to check ─────────────────────────────

/** One built-in thing to check. */
export type ChecklistItem = {
  /** `<issue>.<slug>`, e.g. "tunneling.first-burn-length". Stable. */
  id: string;
  issue: FixIssue;
  /** Current text, from MESSAGES.candleFixChecks. */
  text: string;
};

/** One row the editor or the investigation page shows. */
export type ChecklistRow = {
  item: ChecklistItem;
  /** The stored tick for this item, or null when it was never ticked or noted. */
  tick: ChecklistTick | null;
  /** The tick's label snapshot when there is a tick, else the item's current text. */
  label: string;
};

export type ChecklistView = {
  /** One group per chosen issue, in FIX_ISSUES order, each item in list order. */
  groups: { issue: FixIssue; rows: ChecklistRow[] }[];
  /**
   * Stored ticks that no group shows: their issue is no longer chosen, or
   * their id is not in the current lists (an older or newer app wrote it).
   * In stored order. Shown under "From issues no longer listed"; never dropped.
   */
  noLongerListed: ChecklistTick[];
};

// ───────────────────────────── Before and after ─────────────────────────────

/** Burn figures of one batch's burn tests, all candles together. Nulls are "Not recorded". */
export type BatchBurnSummary = {
  sessionCount: number;
  candleCount: number;
  burnCount: number;
  /** Sum of every burn's minutes. */
  totalMinutes: number;
  /** Sum of the minutes of weighed burns only. */
  weighedMinutes: number;
  /** Sum of weighed burns' losses; null when no burn is weighed. */
  totalLossMg: number | null;
  /** totalLossMg × 60 / weighedMinutes, rounded half up (divHalfUp); null when no burn is weighed. */
  averageMgPerHour: number | null;
  /** Largest of the candles' `lastMeltPoolDiameterMm`; null when none recorded. */
  largestMeltPoolDiameterMm: number | null;
  /** Largest flame height recorded; null when none. */
  maxFlameHeightMm: number | null;
  /** Distinct soot levels seen, in the order none, light, moderate, heavy. */
  sootLevels: SootLevel[];
};

/** Issues the maker recorded on a batch in one investigation. */
export type ObservedIssues = {
  investigationId: string;
  observedOn: string;
  issues: FixIssue[];
  otherIssue: string | null;
};

/** One column of the before-and-after view: one batch. */
export type BeforeAfterColumn = {
  /** "original", or the experiment's id. Unique. */
  key: string;
  role: "original" | "followUp";
  batchId: string;
  /** The batch's label, or null (the screen shows "Batch " + first 8 id characters). */
  batchLabel: string | null;
  formulaId: string;
  formulaName: string;
  versionId: string;
  versionNumber: number;
  producedOn: string;
  /** Follow-ups: the hypothesis the experiment follows (from the compared investigation), or null when it is gone. */
  hypothesis: { id: string; text: string; status: HypothesisStatus } | null;
  /** Follow-ups: the experiment's "what changed" text, or null. */
  change: string | null;
  /** Follow-ups: the experiment's notes, or null. */
  notes: string | null;
  /** Issues recorded on this batch (all its investigations), oldest observation first. */
  observed: ObservedIssues[];
  burn: BatchBurnSummary;
  /** The burn tests summarised, in the order the data gives them. */
  burnSessionIds: string[];
};

export type BeforeAfterModel = {
  investigationId: string;
  /** The original first, then one column per experiment, oldest first. */
  columns: BeforeAfterColumn[];
};

// ───────────────────────────── Timeline ─────────────────────────────

export type TimelineEventKind =
  | "batchMade"
  | "issueObserved"
  | "hypothesisAdded"
  | "followUpMade"
  | "burnTest";

export type TimelineEvent = {
  /** Unique: `${kind}:${id}` (for "burnTest" the session id, "hypothesisAdded" the hypothesis id, …). */
  key: string;
  kind: TimelineEventKind;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** The batch the event belongs to (original or follow-up). */
  batchId: string;
  /** Kind-specific id: the batch, investigation, hypothesis or burn test. */
  refId: string;
  /** Short maker text for the event, or null: the batch label, the investigation title, the hypothesis text, the session label. */
  text: string | null;
};

export type CandleFixModule = {
  /** The built-in list for one issue, in its fixed order (4–7 items each). */
  checklistFor(issue: FixIssue): ChecklistItem[];
  /** Every built-in item, keyed by id. */
  checklistItemById(id: string): ChecklistItem | undefined;
  /** What the editor and page show for the chosen issues and the stored ticks. */
  checklistView(issues: readonly FixIssue[], ticks: readonly ChecklistTick[]): ChecklistView;
  /** The burn figures of a batch's burn tests (an empty list gives zero counts and nulls). */
  batchBurnSummary(sessions: InvestigationComparisonData["original"]["burnSessions"]): BatchBurnSummary;
  /** The before-and-after model. Never mutates its input. */
  buildBeforeAfter(data: InvestigationComparisonData): BeforeAfterModel;
  /**
   * The dated events of an investigation and its experiments: the original
   * batch made, every investigation on the original and follow-up batches
   * observed, the compared investigation's hypotheses added (date from
   * `createdAt` through `localDate`), each follow-up batch made, and every
   * burn test in the data. Sorted by date, then by kind in the order of
   * TimelineEventKind, then by key. A follow-up batch shared by two
   * experiments appears once.
   */
  buildTimeline(
    data: InvestigationComparisonData,
    localDate: (isoTimestamp: string) => string,
  ): TimelineEvent[];
};
