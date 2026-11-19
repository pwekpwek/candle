/**
 * BurnMatrix calculations — contract (v0.2 BurnMatrix, lead). Pure functions
 * only: nothing here reads the clock, IndexedDB or the DOM.
 * Design: docs/v0.2-burnmatrix.md ("Calculations", "Comparison", "CSV").
 *
 * `@/lib/burnmatrix` must export every function in `BurnMatrixModule` below,
 * by these names, plus the types in this file.
 *
 * Rules:
 *   - Integer arithmetic only. Weights are whole milligrams, durations whole
 *     minutes, sizes whole millimetres. A rate is mg per hour, rounded half up
 *     with `divHalfUp` from `@/lib/gramguard` (BigInt), never with floats.
 *   - A burn's weight loss exists only when both weights are recorded.
 *     Rates use only the burns that have a weight loss, and only their
 *     minutes. Nothing is guessed or carried over between burns.
 *   - Numbers shown to the maker are formatted with `@/lib/gramguard`
 *     (`formatGrams(mg, 10)` → "12.34 g") or the helpers below. Unit symbols
 *     (g, g/h, mm, min, h) are not wording; labels and headings are, and live
 *     in `MESSAGES` (`MESSAGES.burnCsv` for the CSV header).
 *   - Observations, not verdicts: nothing computes a score, a pass or a fail.
 */
import type { BurnSessionListItem } from "@/lib/db/contract";
import type { BurnCandle, BurnRecord, SootLevel } from "@/lib/types";

/** Figures for one burn. */
export type BurnFigures = {
  /** weightBeforeMg − weightAfterMg when both are recorded, else null. */
  weightLossMg: number | null;
  /** weightLossMg × 60 / durationMin, rounded half up; null without a weight loss. */
  mgPerHour: number | null;
};

/** Totals for one candle across its burns. */
export type CandleTotals = {
  burnCount: number;
  /** Sum of every burn's duration. */
  totalMinutes: number;
  /** Burns with both weights recorded. */
  weighedBurnCount: number;
  /** Sum of the durations of weighed burns only. */
  weighedMinutes: number;
  /** Sum of weighed burns' losses; null when no burn is weighed. */
  totalLossMg: number | null;
  /** totalLossMg × 60 / weighedMinutes, rounded half up; null when no burn is weighed. */
  averageMgPerHour: number | null;
  /** The last burn's melt pool diameter that was recorded (latest burn first), or null. */
  lastMeltPoolDiameterMm: number | null;
  /** Largest melt pool depth recorded, or null. */
  maxMeltPoolDepthMm: number | null;
  /** Largest flame height recorded, or null. */
  maxFlameHeightMm: number | null;
  /** Distinct soot levels recorded, in the order none, light, moderate, heavy. */
  sootLevels: SootLevel[];
};

/** One column of a comparison: one candle of one session. */
export type ComparisonColumn = {
  /** `${sessionId}:${candleId}`, unique in the model. */
  key: string;
  sessionId: string;
  candleId: string;
  candleLabel: string;
  wickName: string;
  totals: CandleTotals;
  coldThrow: string | null;
  hotThrow: string | null;
};

/** Columns of one session, in the session's candle order. */
export type ComparisonGroup = {
  sessionId: string;
  batchId: string;
  /** Session label, or null (the screen then shows the date). */
  sessionLabel: string | null;
  testedOn: string;
  /** Batch label, or null (the screen then shows "Batch " + first 8 id characters). */
  batchLabel: string | null;
  formulaName: string;
  versionNumber: number;
  /** The maker's own conclusion, or null. */
  conclusion: string | null;
  columns: ComparisonColumn[];
};

/**
 * Every row a comparison shows, in this order. The screen chooses each row's
 * label from MESSAGES; `cells` holds one formatted text per column (in the
 * flattened column order of `groups`), "" for nothing recorded.
 */
export type ComparisonMetric =
  | "wick"
  | "burnCount"
  | "totalTime"
  | "totalLoss"
  | "averageRate"
  | "lastMeltPoolDiameter"
  | "maxMeltPoolDepth"
  | "maxFlameHeight"
  | "soot"
  | "coldThrow"
  | "hotThrow";

export type ComparisonRow = {
  metric: ComparisonMetric;
  cells: string[];
};

export type ComparisonModel = {
  groups: ComparisonGroup[];
  /** Every column, flattened in group order. */
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
};

export type BurnMatrixModule = {
  burnFigures(burn: BurnRecord): BurnFigures;
  candleTotals(candle: BurnCandle): CandleTotals;
  /**
   * The comparison of the given sessions, in the given order (one session:
   * its candles side by side). Soot cells use `sootText` with the level
   * names passed in, since level names are wording.
   */
  buildComparison(
    sessions: readonly BurnSessionListItem[],
    sootText: (levels: readonly SootLevel[]) => string,
  ): ComparisonModel;
  /**
   * "4 h 30 min", "45 min", "0 min". Minutes are whole numbers ≥ 0.
   */
  formatDuration(minutes: number): string;
  /** mg per hour as grams per hour with 2 decimals: "3.25 g/h". */
  formatRate(mgPerHour: number): string;
  /** Whole millimetres: "62 mm". */
  formatMm(mm: number): string;
  /**
   * The measurements of the given sessions as CSV text (RFC 4180: comma
   * separator, CRLF line ends, fields quoted when they hold a comma, quote,
   * CR or LF, quotes doubled), starting with a UTF-8 byte order mark
   * ("﻿") so spreadsheet apps read accents. One header row (labels from
   * MESSAGES.burnCsv), then one row per burn, plus one row for each candle
   * that has no burns (burn columns empty). A text cell that starts with
   * =, +, -, @, tab or CR is prefixed with an apostrophe (spreadsheet
   * formula injection). Weights in grams with 2 decimals and no unit
   * ("123.40"); the column header names the unit.
   */
  buildBurnCsv(sessions: readonly BurnSessionListItem[]): string;
  /** `candlelab-burn-tests-YYYYMMDD.csv` from a local date "YYYY-MM-DD". */
  csvFileName(today: string): string;
};
