/**
 * GramGuard calculation engine — contract (T02).
 *
 * Source of truth: docs/specs/2 Calculation Rules.md. The implementation lives
 * in this folder and is re-exported from `@/lib/gramguard` (index.ts). It must
 * export one function per signature below, under the names given in
 * `GramGuardEngine`, and end index.ts with:
 *
 *     const _check: GramGuardEngine = { parseFixed, … };  // compile-time check
 *
 * Hard rules for the implementation (TRD-02, TRD-03, CALC-06, CALC-07):
 *   - Pure. No React, Dexie, DOM, Date.now() or Math.random().
 *   - Integer arithmetic only. Use BigInt for every intermediate product or
 *     quotient; convert to `number` only at the boundary. Never use
 *     parseFloat, Number("1.5"), toFixed, Math.round or `/` on weights,
 *     percentages or parts.
 *   - Public values are safe integers: milligrams, hundredths of a percent,
 *     hundredths of a part.
 *   - Round half up for positive values. Signed differences round half away
 *     from zero (CALC-08).
 *   - Results are computed from exact inputs and rounded once (CALC-06).
 */
import type {
  Basis,
  FormulaVersion,
  MaterialType,
  PrecisionMg,
  ScaleMethod,
  Sizing,
  SizingMode,
} from "@/lib/types";

// ───────────────────────────── Limits ─────────────────────────────

export const LIMITS = {
  /** V-03, V-06, V-16: 1 000 000 g. */
  maxWeightMg: 1_000_000_000,
  /** V-07: 50%. */
  maxFragranceBp: 5000,
  /** V-08: warn above 12% of wax weight. */
  warnFragranceWaxBp: 1200,
  /** V-12: 9999.99 parts. */
  maxPartsX100: 999_999,
  /** V-05 */
  maxVessels: 9999,
  /** CALC-16 */
  maxWaxes: 5,
  /** CALC-15 */
  maxOils: 10,
  /** V-02 */
  maxNameLength: 80,
  /** V-17: 0.01 to 1000, as hundredths. */
  minMultiplierX100: 1,
  maxMultiplierX100: 100_000,
  /** CALC-13: warn when rounding moves the fragrance total by more than 2%. */
  roundingWarnPercent: 2,
  /** CALC-21: flag beyond the larger of one precision step or 2% of plan. */
  offTargetPercent: 2,
} as const;

export const PRECISIONS: readonly PrecisionMg[] = [1000, 100, 10];
export const DEFAULT_PRECISION_MG: PrecisionMg = 100; // D-2
export const DEFAULT_BASIS: Basis = "wax"; // D-1

// ─────────────────────── Parsing and formatting ───────────────────────

/**
 * V-01. Accepts optional surrounding whitespace, then digits with at most one
 * period: "462", "462.5", ".5", "5.". Rejects "", ".", commas, signs, inner
 * spaces, letters and exponents.
 */
export type ParseFixedResult =
  | {
      ok: true;
      /** The number × 10^scale, exact. */
      value: number;
      /** Decimal places typed, after dropping trailing zeros ("5.50" → 1). */
      decimals: number;
    }
  | {
      ok: false;
      /**
       * empty            — blank after trimming
       * format           — breaks V-01
       * tooManyDecimals  — more significant decimals than `scale`
       * tooLarge         — above Number.MAX_SAFE_INTEGER after scaling
       */
      reason: "empty" | "format" | "tooManyDecimals" | "tooLarge";
    };

/** scale 3 → milligrams from grams, 2 → Bp from %, 2 → partsX100, 0 → whole. */
export type ParseFixed = (text: string, scale: number) => ParseFixedResult;

/** 0, 1 or 2 decimals for 1 g, 0.1 g, 0.01 g. */
export type PrecisionDecimals = (precisionMg: PrecisionMg) => 0 | 1 | 2;

/** "1 g" | "0.1 g" | "0.01 g". */
export type PrecisionLabel = (precisionMg: PrecisionMg) => string;

/** CALC-11. 463000 mg at 0.1 g → "463.0". No unit, no thousands separator. */
export type FormatWeight = (mg: number, precisionMg: PrecisionMg) => string;

/** FormatWeight plus the unit: "463.0 g". */
export type FormatGrams = (mg: number, precisionMg: PrecisionMg) => string;

/**
 * CALC-18. A measured weight: at least the formula precision's decimals, and
 * up to 2 when finer was typed. 1003200 at 0.1 g → "1003.2"; 26150 → "26.15".
 * No unit.
 */
export type FormatMeasured = (mg: number, precisionMg: PrecisionMg) => string;

/**
 * Signed difference with unit, same decimals rule as FormatMeasured.
 * +3200 → "+3.2 g", -600 → "-0.6 g", 0 → "0.0 g". ASCII hyphen-minus.
 */
export type FormatSignedGrams = (mg: number, precisionMg: PrecisionMg) => string;

/** Fewest decimals that show the value exactly: 180000 → "180", 462500 → "462.5". */
export type FormatMinimalGrams = (mg: number) => string;

/** A computed percentage, always 2 decimals: 741 → "7.41". No "%" sign. */
export type FormatPercent2 = (hundredths: number) => string;

/** As FormatPercent2 with a sign: 32 → "+0.32", -225 → "-2.25", 0 → "0.00". */
export type FormatSignedPercent2 = (hundredths: number) => string;

/** A percentage the maker typed, fewest decimals: 800 → "8", 825 → "8.25". */
export type FormatRequestedPercent = (bp: number) => string;

/** Parts or a multiplier, fewest decimals: 300 → "3", 3333 → "33.33". */
export type FormatHundredths = (x100: number) => string;

/** Scale factor for display, 2 decimals half up: 16667 → "1.67". */
export type FormatFactor = (factorX10000: number) => string;

// ───────────────────────────── Planning ─────────────────────────────

export type PlanComponentInput = {
  componentId: string;
  /** Ignored when the blend has a single component (treated as 100). */
  partsX100: number;
};

/** Already-validated numbers. Text validation is `evaluateFormula`. */
export type PlanInput = {
  sizing: Sizing;
  fragranceBp: number;
  basis: Basis;
  precisionMg: PrecisionMg;
  /** 1–5, in display order. */
  waxes: PlanComponentInput[];
  /** 0–10, in display order. Ignored when fragranceBp is 0 (CALC-17). */
  oils: PlanComponentInput[];
};

export type PlannedComponent = {
  componentId: string;
  targetMg: number;
  /** Share of its blend from parts, hundredths of a percent, half up (CALC-15). */
  shareX100: number;
};

export type Plan = {
  precisionMg: PrecisionMg;
  basis: Basis;
  fragranceBp: number;
  /** T. Always waxTotalMg + fragranceTotalMg (CALC-09). */
  totalMg: number;
  waxTotalMg: number;
  fragranceTotalMg: number;
  /** Sum to waxTotalMg exactly (CALC-10). */
  waxes: PlannedComponent[];
  /** Sum to fragranceTotalMg exactly. Empty when unscented. */
  oils: PlannedComponent[];
  /** The requested percentage on the other basis, hundredths, half up (CALC-04). */
  equivalentX100: number;
  /** Planned fragrance ÷ planned wax × 100, hundredths, half up. */
  effectiveOfWaxX100: number;
  /** Planned fragrance ÷ planned total × 100, hundredths, half up. */
  effectiveOfTotalX100: number;
  /** CALC-12: the effective figure on the formula's own basis ≠ fragranceBp. */
  effectiveDiffers: boolean;
  /**
   * CALC-13: rounding moved the fragrance total by more than 2.0% of its
   * exact value. Compared exactly, with integers. False when unscented.
   * (Fragrance total only, as worked example WE-7 shows. See the spec note
   * added to CALC-13 on 2026-11-15.)
   */
  roundingWarning: boolean;
  /** CALC-17: fragrance is 0% and oils were supplied, so they were ignored. */
  oilsIgnored: boolean;
};

export type PlanResult =
  | { ok: true; plan: Plan }
  | {
      ok: false;
      /**
       * no-wax          — V-14, planned wax is not above 0 g
       * zero-component  — V-15 / CALC-14, a component with parts > 0 rounds to 0 g
       */
      reason: "no-wax" | "zero-component";
      /** For zero-component: every component that rounds to 0 g, in order. */
      componentIds: string[];
    };

/** Sections 3 to 5 of the calculation rules. The only planning path (TRD-03). */
export type ComputePlan = (input: PlanInput) => PlanResult;

/** T in milligrams for total and vessels modes; null for wax mode. */
export type SizingTotalMg = (sizing: Sizing) => number | null;

/**
 * CALC-04. Convert a percentage to the other basis, hundredths, half up.
 * 800 from "wax" → 741. 800 from "total" → 870.
 */
export type ConvertBasis = (bp: number, from: Basis) => number;

// ───────────────────────────── Issues ─────────────────────────────

export type RuleId =
  | "V-01" | "V-02" | "V-03" | "V-04" | "V-05" | "V-06" | "V-07" | "V-08"
  | "V-09" | "V-10" | "V-11" | "V-12" | "V-13" | "V-14" | "V-15" | "V-16"
  | "V-17";

/**
 * One validation finding. `field` says where it belongs:
 *   "name" | "amount" | "vesselCount" | "fillWeight" | "fragrancePct"
 *   "waxes" | "oils"                       the blend as a whole
 *   "waxes.<rowId>.material" | "waxes.<rowId>.parts"   (same for oils)
 *   "result"                               V-14, V-15, CALC-13
 *   "measured.<componentId>"               V-16 on the formula page
 *   "scale.count" | "scale.fill" | "scale.amount" | "scale.multiplier"
 *
 * `messageForIssue` in `@/lib/messages` turns an Issue into its exact text.
 */
export type Issue =
  | { rule: "V-01"; field: string; severity: "error" }
  | { rule: "V-02"; field: string; severity: "error" }
  | { rule: "V-03"; field: string; severity: "error" }
  | {
      rule: "V-04";
      field: string;
      severity: "error";
      precisionMg: PrecisionMg;
      /** Nearest allowed values below and above, formatted: "500.5", "500.6". */
      lower: string;
      upper: string;
      /**
       * The coarsest finer precision that fits the decimals typed, or null
       * when none does (already 0.01 g, or 3+ decimals typed).
       */
      finerPrecisionMg: PrecisionMg | null;
    }
  | { rule: "V-05"; field: string; severity: "error" }
  /** V-06 reuses the V-03 and V-04 wording; `as` says which. */
  | { rule: "V-06"; field: string; severity: "error"; as: "V-03" }
  | {
      rule: "V-06";
      field: string;
      severity: "error";
      as: "V-04";
      precisionMg: PrecisionMg;
      lower: string;
      upper: string;
      finerPrecisionMg: PrecisionMg | null;
    }
  | { rule: "V-07"; field: string; severity: "error" }
  | { rule: "V-08"; field: string; severity: "warning" }
  | {
      rule: "V-09";
      field: string;
      severity: "warning";
      /** The supplier maximum as recorded, hundredths of a percent. */
      maxBp: number;
      waxName: string;
    }
  | { rule: "V-10"; field: string; severity: "error" }
  | { rule: "V-11"; field: string; severity: "error" }
  | { rule: "V-12"; field: string; severity: "error" }
  | { rule: "V-13"; field: string; severity: "error"; materialName: string }
  | { rule: "V-14"; field: string; severity: "error" }
  | { rule: "V-15"; field: string; severity: "error"; materialName: string }
  | { rule: "V-16"; field: string; severity: "error" }
  | { rule: "V-17"; field: string; severity: "error" }
  | {
      rule: "CALC-13";
      field: string;
      severity: "warning";
      precisionMg: PrecisionMg;
      requestedBp: number;
      basis: Basis;
      /** Effective percentage on `basis`, hundredths. */
      effectiveX100: number;
    }
  | { rule: "CALC-17"; field: string; severity: "note" };

// ─────────────────────── Editor validation ───────────────────────

export type BlendRowFields = {
  /** Stable while the editor is open. Used in Issue.field and as the plan's componentId. */
  rowId: string;
  materialId: string | null;
  /** Raw text. Ignored while the blend has one row. */
  parts: string;
};

/** Everything the formula editor holds, as raw text exactly as typed. */
export type EditorFields = {
  name: string;
  sizingMode: SizingMode;
  /** Total-mixture or wax-weight amount in grams, for modes "total" and "wax". */
  amount: string;
  vesselCount: string;
  fillWeight: string;
  fragrancePct: string;
  basis: Basis;
  precisionMg: PrecisionMg;
  waxes: BlendRowFields[];
  oils: BlendRowFields[];
  wickId: string | null;
  vesselId: string | null;
  notes: string;
  /** "What changed?" Only used when revising. */
  changeNote: string;
};

/** The little the engine needs to know about a library material. */
export type MaterialInfo = {
  id: string;
  type: MaterialType;
  name: string;
  maxFragranceBp?: number;
  maxFragranceBasis?: Basis;
};
export type MaterialLookup = (materialId: string) => MaterialInfo | undefined;

export type ValidatedRow = { rowId: string; materialId: string; partsX100: number };

/** Editor input that passed every rule and can be saved. */
export type ValidatedFormulaInput = {
  /** Trimmed. */
  name: string;
  sizing: Sizing;
  fragranceBp: number;
  basis: Basis;
  precisionMg: PrecisionMg;
  waxes: ValidatedRow[];
  /** Empty when fragranceBp is 0. */
  oils: ValidatedRow[];
  wickId: string | null;
  vesselId: string | null;
  /** Trimmed; "" when blank. */
  notes: string;
  changeNote: string;
};

export type Evaluation = {
  /** Errors, in field order: name, batch size, fragrance, waxes, oils, result. */
  issues: Issue[];
  /** V-08, V-09, CALC-13 and the CALC-17 note. Never block saving. */
  warnings: Issue[];
  /**
   * Planned weights. Present whenever batch size, fragrance percentage, waxes
   * and oils are all valid and the plan succeeds — the name is not needed.
   * Component ids are the row ids. Null otherwise: the results panel then
   * shows no numbers (PRD-12).
   */
  plan: Plan | null;
  /** Present only when `issues` is empty. */
  input: ValidatedFormulaInput | null;
};

/**
 * Runs V-02 to V-15 over the editor fields, then `computePlan`.
 * Rules, in the detail the spec leaves open:
 *   - Empty name → V-02. Empty amount, or 0 → V-03. Empty vessel count → V-05.
 *     Empty fill weight → V-06 as V-03. Empty fragrance → V-07.
 *   - Any number field that breaks V-01 reports V-01 (not its range rule).
 *   - In vessels mode the derived total (count × fill) above 1 000 000 g
 *     reports V-06 as V-03 on "fillWeight".
 *   - A wax row with no material → V-10 on "waxes.<rowId>.material". No wax
 *     rows at all → V-10 on "waxes".
 *   - When fragrance is above 0: no oil rows → V-11 on "oils"; an oil row with
 *     no material → V-11 on "oils.<rowId>.material".
 *   - When fragrance is 0, oil rows are not validated; if any exist, add the
 *     CALC-17 note to `warnings` and leave `input.oils` empty.
 *   - Parts are validated (V-12, or V-01 for bad format) only when that blend
 *     has two or more rows. A single row counts as 100.
 *   - V-13 goes on the second and later rows that repeat a material.
 *   - V-08 compares on the wax-weight basis exactly (convert a total-mixture
 *     percentage without rounding). V-09 compares on each wax's recorded basis
 *     (default "wax"), exactly, one warning per wax that is exceeded.
 *   - V-14 and V-15 come from `computePlan` and go on "result". V-15 yields one
 *     issue per component that rounds to 0 g, named from the lookup.
 */
export type EvaluateFormula = (fields: EditorFields, lookup: MaterialLookup) => Evaluation;

/** A blank editor: mode "total", basis "wax", precision 0.1 g, one empty wax row, one empty oil row. */
export type EmptyEditorFields = (newRowId: () => string) => EditorFields;

/** Editor fields that reproduce a saved version, for Revise (PRD-15). changeNote is "". */
export type FieldsFromVersion = (version: FormulaVersion, newRowId: () => string) => EditorFields;

/** The plan input for a saved version's own inputs, keyed by its componentIds. */
export type PlanInputFromVersion = (version: FormulaVersion) => PlanInput;

// ───────────────────── Planned versus measured ─────────────────────

/**
 * V-16 (and V-01). Empty text means "not measured" and is valid.
 * Up to 2 decimals whatever the formula precision (CALC-18).
 */
export type ParseMeasured = (
  text: string,
  field: string,
) => { ok: true; actualMg: number | null } | { ok: false; issue: Issue };

export type ComparisonRow = {
  targetMg: number;
  /** Null until measured. */
  actualMg: number | null;
  /** actual − target (CALC-19). */
  diffMg: number | null;
  /** diff ÷ target × 100, hundredths, half away from zero. Null if target is 0. */
  diffX100: number | null;
};

export type ComponentComparison = ComparisonRow & {
  componentId: string;
  kind: "wax" | "oil";
  /**
   * CALC-21. |diff| exceeds the larger of one precision step or 2% of target.
   * Compared exactly: |diff| > precisionMg and |diff| × 100 > 2 × target.
   */
  flagged: boolean;
  /** "over" or "under" when flagged, otherwise null. */
  direction: "over" | "under" | null;
};

export type ActualBlend = {
  waxMg: number;
  fragranceMg: number;
  totalMg: number;
  /** Null when actual wax is 0. Hundredths, half up. */
  ofWaxX100: number | null;
  /** Null when actual total is 0. */
  ofTotalX100: number | null;
  /** Measured oil ÷ actual fragrance. Empty when actual fragrance is 0. */
  oilShares: { componentId: string; shareX100: number }[];
};

export type MeasuredComparison = {
  /** Waxes then oils, in version order. */
  components: ComponentComparison[];
  /** Present once every oil has a measured weight (and there is at least one oil). */
  fragrance: ComparisonRow | null;
  /** Present once every wax and every oil has a measured weight. */
  total: ComparisonRow | null;
  /** CALC-20. Present only when every wax and oil is measured. */
  actualBlend: ActualBlend | null;
};

export type CompareInput = {
  precisionMg: PrecisionMg;
  totalMg: number;
  waxTotalMg: number;
  fragranceTotalMg: number;
  waxes: { componentId: string; targetMg: number }[];
  oils: { componentId: string; targetMg: number }[];
};

/** CALC-18 to CALC-22. Never changes the plan. Entries for unknown ids are ignored. */
export type CompareMeasured = (
  plan: CompareInput,
  entries: readonly { componentId: string; actualMg: number }[],
) => MeasuredComparison;

/** CompareInput read from a saved version's stored targets (never recalculated). */
export type CompareInputFromVersion = (version: FormulaVersion) => CompareInput;

// ───────────────────────────── Scaling ─────────────────────────────

/** Raw text from the scale dialog. Which variants apply depends on the sizing mode (CALC-24). */
export type ScaleFields =
  | { method: "vesselCount"; count: string; /** "" keeps the current fill. */ fill: string }
  | { method: "amount"; amount: string }
  | { method: "multiplier"; multiplier: string };

export type ScaleEvaluation = {
  /** V-05, V-06, V-03, V-04, V-17, V-01 on "scale.*" fields. */
  issues: Issue[];
  /** The new sizing, same mode as the source. Null while invalid. */
  sizing: Sizing | null;
  scale: { method: ScaleMethod; factorX10000: number } | null;
};

/**
 * CALC-23 to CALC-25. Only the batch size changes.
 *   - "vesselCount" is valid only for vessels mode; "amount" and "multiplier"
 *     only for total and wax modes. A mismatch is a programming error: throw.
 *   - Multiplier: new amount = old × multiplier, rounded half up to the
 *     precision (WE-9d: 333.3 g × 1.5 → 500.0 g). A result of 0 g or above
 *     1 000 000 g reports V-17.
 *   - factorX10000 = new amount ÷ old amount × 10000, half up (vessels mode
 *     compares the totals).
 * The caller then runs `computePlan` on the new sizing (CALC-26).
 */
export type EvaluateScale = (
  sizing: Sizing,
  precisionMg: PrecisionMg,
  fields: ScaleFields,
) => ScaleEvaluation;

// ───────────────────────────── The module ─────────────────────────────

/** Every export `@/lib/gramguard` must provide. */
export type GramGuardEngine = {
  parseFixed: ParseFixed;
  precisionDecimals: PrecisionDecimals;
  precisionLabel: PrecisionLabel;
  formatWeight: FormatWeight;
  formatGrams: FormatGrams;
  formatMeasured: FormatMeasured;
  formatSignedGrams: FormatSignedGrams;
  formatMinimalGrams: FormatMinimalGrams;
  formatPercent2: FormatPercent2;
  formatSignedPercent2: FormatSignedPercent2;
  formatRequestedPercent: FormatRequestedPercent;
  formatHundredths: FormatHundredths;
  formatFactor: FormatFactor;
  computePlan: ComputePlan;
  sizingTotalMg: SizingTotalMg;
  convertBasis: ConvertBasis;
  evaluateFormula: EvaluateFormula;
  emptyEditorFields: EmptyEditorFields;
  fieldsFromVersion: FieldsFromVersion;
  planInputFromVersion: PlanInputFromVersion;
  parseMeasured: ParseMeasured;
  compareMeasured: CompareMeasured;
  compareInputFromVersion: CompareInputFromVersion;
  evaluateScale: EvaluateScale;
};
