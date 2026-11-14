/**
 * Worked-example fixtures (T06): WE-1 to WE-13 of docs/specs/2 Calculation Rules.md, section 9.
 *
 * Written from the spec. Units follow the engine (contract.ts, CALC-07):
 *   - weights        whole milligrams          (1 g = 1000 mg)
 *   - percentages    whole hundredths of 1%    (8% = 800)
 *   - parts          whole hundredths of a part (3 parts = 300)
 *
 * Figures the spec prints are copied as printed. Figures the spec does not print
 * but that follow by exact arithmetic from its stated rules (CALC-04, CALC-12,
 * CALC-13, CALC-15, CALC-19 to CALC-21) are marked "derived" in comments.
 * Open points are marked "AMBIGUOUS" and are also listed in the T06 report.
 *
 * Component ids are plain and stable: "wax-a", "wax-soy", "wax-coconut",
 * "oil-1", "oil-a", "oil-b", "oil-c", "oil-2" (WE-7 uses oil-a and oil-b).
 */
import type {
  ActualBlend,
  CompareInput,
  ComparisonRow,
  PlanInput,
  RuleId,
} from "@/lib/gramguard/contract";
import type { PrecisionMg, ScaleMethod, Sizing } from "@/lib/types";

// ───────────────────────────── Local types ─────────────────────────────

/** A planned component. shareX100 is present where the blend has 2+ parts. */
export type ExpectedComponent = {
  componentId: string;
  targetMg: number;
  /** Parts ÷ sum of parts, hundredths of a percent, half up (CALC-15). Absent for single-component blends. */
  shareX100?: number;
};

/**
 * The plan figures a worked example asserts. Mirrors `Plan` in contract.ts
 * (minus the echoed inputs, which live on `input`).
 */
export type ExpectedPlan = {
  totalMg: number;
  waxTotalMg: number;
  fragranceTotalMg: number;
  waxes: ExpectedComponent[];
  oils: ExpectedComponent[];
  /** The requested percentage on the other basis (CALC-04), hundredths. */
  equivalentX100: number;
  /** Planned fragrance ÷ planned wax, hundredths, half up. */
  effectiveOfWaxX100: number;
  /** Planned fragrance ÷ planned total, hundredths, half up. */
  effectiveOfTotalX100: number;
  /** CALC-12: effective figure on the formula's own basis differs from the requested one. */
  effectiveDiffers: boolean;
  /** CALC-13 (fragrance total only, per WE-7). */
  roundingWarning: boolean;
  /** CALC-17. No example in section 9 supplies oils at 0%. */
  oilsIgnored: boolean;
};

export type WorkedExample = {
  id: string;
  title: string;
  input: PlanInput;
  expect: ExpectedPlan;
  /** Strings the spec prints for this example, exactly as printed (no unit change). */
  display?: Record<string, string>;
  /** WE-7 only: rounding moved the fragrance total by this many hundredths of a percent (signed). */
  roundingMovedFX100?: number;
  note?: string;
};

/**
 * A scaling case (CALC-23 to CALC-26). Only the batch size changes, so `input`
 * is the source example's input with `sizing` replaced by `newSizing`.
 * The spec gives text (e.g. "10 vessels", "×1.25"); integers here are the same
 * values in engine units. The dialog text fields are not part of the fixture.
 */
export type ScaleExample = {
  id: string;
  title: string;
  /** Source worked example, as printed in the spec. */
  sourceId: string;
  method: ScaleMethod;
  /** vesselCount method. */
  newVesselCount?: number;
  /** vesselCount method, when the fill weight changes. Absent = fill kept. */
  newFillMg?: number;
  /** multiplier method, hundredths (1.25 = 125). */
  multiplierX100?: number;
  input: PlanInput;
  newSizing: Sizing;
  /** New amount ÷ old amount × 10000, half up (vessels mode compares totals). */
  factorX10000: number;
  expect: ExpectedPlan;
  /** Wrong-method values the spec says must not appear (CALC-26). */
  forbidden?: { oilsMg: number[] };
  display?: Record<string, string>;
  note?: string;
};

/** One line of the planned-versus-measured table (WE-8). */
export type ComparisonLine = {
  componentId: string;
  kind: "wax" | "oil";
  targetMg: number;
  /** Null until measured. */
  actualMg: number | null;
  /** actual − target (CALC-19), signed. Null until measured. */
  diffMg: number | null;
  /** diff ÷ target × 100, hundredths, half away from zero. Null until measured. */
  diffX100: number | null;
  /** CALC-21 limit: the larger of one precision step or 2% of target, in mg. */
  limitMg: number;
  /** Null where the spec states no flag (not measured). */
  flagged: boolean | null;
  direction: "over" | "under" | null;
  /** The table text as the spec prints it. The spec uses the typographic minus; here ASCII hyphen-minus (see report). */
  display?: { diff: string; pct: string; flag: string };
};

/** WE-8: planned versus measured. */
export type MeasuredExample = {
  id: string;
  title: string;
  /** The planned targets (from WE-5 for WE-8). */
  compareInput: CompareInput;
  /** The measured weights the maker typed. */
  entries: { componentId: string; actualMg: number }[];
  /** Waxes then oils, in order. */
  components: ComparisonLine[];
  fragrance: ComparisonRow | null;
  total: ComparisonRow | null;
  actualBlend: ActualBlend | null;
  display?: Record<string, string>;
  note?: string;
};

/** One row of the WE-13 invalid and incomplete input table. */
export type InvalidInputExample = {
  id: string;
  description: string;
  precisionMg: PrecisionMg;
  /** Raw text as typed, keyed by the editor field it was typed into (contract Issue.field). */
  raw: Record<string, string>;
  /** The field the issue belongs to (contract Issue.field). */
  field: string;
  /** The rule id the spec says must be reported. */
  rule: RuleId;
  severity: "error" | "warning";
  /** False where the spec says the save goes through (warning only). */
  saveBlocked: boolean;
  /** True where the spec says the results panel shows no numbers. */
  resultsPanelEmpty: boolean;
  note?: string;
};

// ───────────────────────── WE-1 to WE-7, WE-10 to WE-12 ─────────────────────────

/** WE-1. 500 g total, 8% of wax weight. */
export const WE_1: WorkedExample = {
  id: "WE-1",
  title: "Percentage of wax weight, total known",
  input: {
    sizing: { mode: "total", amountMg: 500_000 },
    fragranceBp: 800,
    basis: "wax",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [{ componentId: "oil-1", partsX100: 100 }],
  },
  expect: {
    totalMg: 500_000,
    waxTotalMg: 463_000,
    fragranceTotalMg: 37_000,
    waxes: [{ componentId: "wax-a", targetMg: 463_000 }],
    oils: [{ componentId: "oil-1", targetMg: 37_000 }],
    equivalentX100: 741, // spec: 7.41% of total mixture
    effectiveOfWaxX100: 799, // spec: 7.99% of wax weight
    effectiveOfTotalX100: 740, // derived: 37.0 ÷ 500.0
    effectiveDiffers: true, // 7.99 ≠ 8.00
    roundingWarning: false, // exact F 37.037 → 37.0, −0.1%
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 37.0 g",
    wax: "W = 463.0 g",
    equivalent: "7.41% of total mixture",
    effective: "7.99% of wax weight",
  },
  note: "Exact F = 37.03704 g.",
};

/** WE-2. 500 g total, 8% of total mixture. Same as WE-1 except the basis. */
export const WE_2: WorkedExample = {
  id: "WE-2",
  title: "Percentage of total mixture, total known",
  input: {
    sizing: { mode: "total", amountMg: 500_000 },
    fragranceBp: 800,
    basis: "total",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [{ componentId: "oil-1", partsX100: 100 }],
  },
  expect: {
    totalMg: 500_000,
    waxTotalMg: 460_000,
    fragranceTotalMg: 40_000,
    waxes: [{ componentId: "wax-a", targetMg: 460_000 }],
    oils: [{ componentId: "oil-1", targetMg: 40_000 }],
    equivalentX100: 870, // spec: 8.70% of wax weight
    effectiveOfWaxX100: 870, // derived: 40.0 ÷ 460.0 = 8.6957
    effectiveOfTotalX100: 800, // derived: 40.0 ÷ 500.0
    effectiveDiffers: false, // 8.00 = 8.00 on the formula's own basis
    roundingWarning: false, // exact, no rounding
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 40.0 g",
    wax: "W = 460.0 g",
    equivalent: "8.70% of wax weight",
  },
  note: "Fragrance is 3.0 g more than WE-1 (40.0 − 37.0). The basis is the only input that differs.",
};

/** WE-3. 1000 g wax, 10% of wax weight. */
export const WE_3: WorkedExample = {
  id: "WE-3",
  title: "Percentage of wax weight, wax known",
  input: {
    sizing: { mode: "wax", amountMg: 1_000_000 },
    fragranceBp: 1000,
    basis: "wax",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [{ componentId: "oil-1", partsX100: 100 }],
  },
  expect: {
    totalMg: 1_100_000,
    waxTotalMg: 1_000_000,
    fragranceTotalMg: 100_000,
    waxes: [{ componentId: "wax-a", targetMg: 1_000_000 }],
    oils: [{ componentId: "oil-1", targetMg: 100_000 }],
    equivalentX100: 909, // spec: 9.09% of total mixture
    effectiveOfWaxX100: 1000, // derived: 100.0 ÷ 1000.0
    effectiveOfTotalX100: 909, // derived: 100.0 ÷ 1100.0 = 9.0909
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 100.0 g",
    total: "T = 1100.0 g",
    equivalent: "9.09% of total mixture",
  },
};

/** WE-4. 450 g wax, 10% of total mixture. */
export const WE_4: WorkedExample = {
  id: "WE-4",
  title: "Percentage of total mixture, wax known",
  input: {
    sizing: { mode: "wax", amountMg: 450_000 },
    fragranceBp: 1000,
    basis: "total",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [{ componentId: "oil-1", partsX100: 100 }],
  },
  expect: {
    totalMg: 500_000,
    waxTotalMg: 450_000,
    fragranceTotalMg: 50_000,
    waxes: [{ componentId: "wax-a", targetMg: 450_000 }],
    oils: [{ componentId: "oil-1", targetMg: 50_000 }],
    equivalentX100: 1111, // spec: 11.11% of wax weight
    effectiveOfWaxX100: 1111, // derived: 50.0 ÷ 450.0 = 11.1111
    effectiveOfTotalX100: 1000, // derived: 50.0 ÷ 500.0
    effectiveDiffers: false, // 10.00 = 10.00 on the formula's own basis
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 50.0 g",
    total: "T = 500.0 g",
    equivalent: "11.11% of wax weight",
  },
  note: "Exact F = 450 × 0.10 ÷ 0.90 = 50 g.",
};

/** WE-5. 6 vessels × 180 g = 1080 g total, 8% of wax weight, oils A : B : C = 3 : 2 : 1. */
export const WE_5: WorkedExample = {
  id: "WE-5",
  title: "Multi-oil blend by parts, vessels mode",
  input: {
    sizing: { mode: "vessels", count: 6, fillMg: 180_000 },
    fragranceBp: 800,
    basis: "wax",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [
      { componentId: "oil-a", partsX100: 300 },
      { componentId: "oil-b", partsX100: 200 },
      { componentId: "oil-c", partsX100: 100 },
    ],
  },
  expect: {
    totalMg: 1_080_000,
    waxTotalMg: 1_000_000,
    fragranceTotalMg: 80_000,
    waxes: [{ componentId: "wax-a", targetMg: 1_000_000 }],
    // Quotas 40.0000, 26.6667, 13.3333; floors 40.0, 26.6, 13.3; B takes the spare step.
    oils: [
      { componentId: "oil-a", targetMg: 40_000, shareX100: 5000 }, // 50.00%
      { componentId: "oil-b", targetMg: 26_700, shareX100: 3333 }, // 33.33%
      { componentId: "oil-c", targetMg: 13_300, shareX100: 1667 }, // 16.67%
    ],
    equivalentX100: 741, // derived: 8 ÷ 108 = 7.407
    effectiveOfWaxX100: 800, // derived: 80.0 ÷ 1000.0
    effectiveOfTotalX100: 741, // derived: 80.0 ÷ 1080.0 = 7.4074
    effectiveDiffers: false,
    roundingWarning: false, // exact F is 80 exactly
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 80.0 g",
    wax: "W = 1000.0 g",
    oils: "A = 40.0 g, B = 26.7 g, C = 13.3 g",
    shares: "50.00%, 33.33%, 16.67%",
  },
  note: "Sum of oils 80.0 g (79.9 g after floors, one step to B).",
};

/** WE-6 at 0.1 g. 250 g total, 9% of total mixture, oils 50 : 30 : 20. */
export const WE_6: WorkedExample = {
  id: "WE-6",
  title: "Multi-oil blend with a tie, percentage of total mixture (0.1 g)",
  input: {
    sizing: { mode: "total", amountMg: 250_000 },
    fragranceBp: 900,
    basis: "total",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [
      { componentId: "oil-a", partsX100: 5000 },
      { componentId: "oil-b", partsX100: 3000 },
      { componentId: "oil-c", partsX100: 2000 },
    ],
  },
  expect: {
    totalMg: 250_000,
    waxTotalMg: 227_500,
    fragranceTotalMg: 22_500,
    waxes: [{ componentId: "wax-a", targetMg: 227_500 }],
    // Quotas 11.25, 6.75, 4.50; floors 11.2, 6.7, 4.5; first two tie on remainder, first listed wins.
    oils: [
      { componentId: "oil-a", targetMg: 11_300, shareX100: 5000 },
      { componentId: "oil-b", targetMg: 6_700, shareX100: 3000 },
      { componentId: "oil-c", targetMg: 4_500, shareX100: 2000 },
    ],
    equivalentX100: 989, // spec: 9.89% of wax weight
    effectiveOfWaxX100: 989, // derived: 22.5 ÷ 227.5
    effectiveOfTotalX100: 900, // derived: 22.5 ÷ 250.0
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 22.5 g",
    wax: "W = 227.5 g",
    equivalent: "9.89% of wax weight",
    oils: "11.3 g, 6.7 g, 4.5 g",
  },
  note: "Sum of oils 22.5 g.",
};

/** WE-6 at 0.01 g. Same inputs as WE-6 at 0.1 g; precision is the only change. */
export const WE_6_HUNDREDTH: WorkedExample = {
  id: "WE-6 (0.01 g)",
  title: "Multi-oil blend with a tie at 0.01 g",
  input: { ...WE_6.input, precisionMg: 10 },
  expect: {
    totalMg: 250_000,
    waxTotalMg: 227_500,
    fragranceTotalMg: 22_500,
    waxes: [{ componentId: "wax-a", targetMg: 227_500 }],
    oils: [
      { componentId: "oil-a", targetMg: 11_250, shareX100: 5000 },
      { componentId: "oil-b", targetMg: 6_750, shareX100: 3000 },
      { componentId: "oil-c", targetMg: 4_500, shareX100: 2000 },
    ],
    equivalentX100: 989,
    effectiveOfWaxX100: 989,
    effectiveOfTotalX100: 900,
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    oils: "11.25 g, 6.75 g, 4.50 g",
  },
  note: "Spec: at 0.01 g, oils are exact. F and W follow from the exact values (22.50 g, 227.50 g).",
};

/** WE-7 at 1 g. 50 g total, 6% of wax weight, oils 2 : 1. Exact F = 2.83019 g. */
export const WE_7_1G: WorkedExample = {
  id: "WE-7 (1 g)",
  title: "Rounding on a small blend, 1 g precision",
  input: {
    sizing: { mode: "total", amountMg: 50_000 },
    fragranceBp: 600,
    basis: "wax",
    precisionMg: 1000,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [
      { componentId: "oil-a", partsX100: 200 },
      { componentId: "oil-b", partsX100: 100 },
    ],
  },
  expect: {
    totalMg: 50_000,
    waxTotalMg: 47_000,
    fragranceTotalMg: 3_000,
    waxes: [{ componentId: "wax-a", targetMg: 47_000 }],
    oils: [
      { componentId: "oil-a", targetMg: 2_000, shareX100: 6667 }, // derived: 66.67%
      { componentId: "oil-b", targetMg: 1_000, shareX100: 3333 }, // derived: 33.33%
    ],
    equivalentX100: 566, // derived: 6 ÷ 106 = 5.66
    effectiveOfWaxX100: 638, // spec: 6.38%
    effectiveOfTotalX100: 600, // derived: 3.0 ÷ 50.0
    effectiveDiffers: true, // 6.38 ≠ 6.00
    roundingWarning: true, // spec: Yes (CALC-13), F moved +6.00%
    oilsIgnored: false,
  },
  roundingMovedFX100: 600, // spec: +6.00%
  display: {
    fragrance: "3 g",
    wax: "47 g",
    oils: "2 g, 1 g",
    effectiveOfWax: "6.38%",
    warning:
      "At 1 g precision this small batch can't hit 6%. Planned weights give 6.38% of wax weight. Use 0.1 g or 0.01 g precision, or a larger batch.",
  },
  note: "Exact F = 2.83019 g.",
};

/** WE-7 at 0.1 g. */
export const WE_7_0_1G: WorkedExample = {
  id: "WE-7 (0.1 g)",
  title: "Rounding on a small blend, 0.1 g precision",
  input: { ...WE_7_1G.input, precisionMg: 100 },
  expect: {
    totalMg: 50_000,
    waxTotalMg: 47_200,
    fragranceTotalMg: 2_800,
    waxes: [{ componentId: "wax-a", targetMg: 47_200 }],
    oils: [
      { componentId: "oil-a", targetMg: 1_900, shareX100: 6667 },
      { componentId: "oil-b", targetMg: 900, shareX100: 3333 },
    ],
    equivalentX100: 566,
    effectiveOfWaxX100: 593, // spec: 5.93%
    effectiveOfTotalX100: 560, // derived: 2.8 ÷ 50.0
    effectiveDiffers: true, // 5.93 ≠ 6.00
    roundingWarning: false, // spec: No
    oilsIgnored: false,
  },
  roundingMovedFX100: -107, // spec: −1.07%
  display: {
    fragrance: "2.8 g",
    wax: "47.2 g",
    oils: "1.9 g, 0.9 g",
    effectiveOfWax: "5.93%",
    warning: "No",
  },
  note: "AMBIGUOUS: CALC-13 text says fragrance total or any component. Oil B moves −4.6% here, but the spec says No. Follows the table (fragrance total only).",
};

/** WE-7 at 0.01 g. */
export const WE_7_0_01G: WorkedExample = {
  id: "WE-7 (0.01 g)",
  title: "Rounding on a small blend, 0.01 g precision",
  input: { ...WE_7_1G.input, precisionMg: 10 },
  expect: {
    totalMg: 50_000,
    waxTotalMg: 47_170,
    fragranceTotalMg: 2_830,
    waxes: [{ componentId: "wax-a", targetMg: 47_170 }],
    oils: [
      { componentId: "oil-a", targetMg: 1_890, shareX100: 6667 },
      { componentId: "oil-b", targetMg: 940, shareX100: 3333 },
    ],
    equivalentX100: 566,
    effectiveOfWaxX100: 600, // spec: 6.00%
    effectiveOfTotalX100: 566, // derived: 2.83 ÷ 50.0
    effectiveDiffers: false, // 6.00 = 6.00
    roundingWarning: false, // spec: No
    oilsIgnored: false,
  },
  roundingMovedFX100: -1, // spec: −0.01%
  display: {
    fragrance: "2.83 g",
    wax: "47.17 g",
    oils: "1.89 g, 0.94 g",
    effectiveOfWax: "6.00%",
    warning: "No",
  },
};

/** WE-10. 800 g total, 10% of wax weight, waxes soy : coconut = 70 : 30, one oil. */
export const WE_10: WorkedExample = {
  id: "WE-10",
  title: "Wax blend",
  input: {
    sizing: { mode: "total", amountMg: 800_000 },
    fragranceBp: 1000,
    basis: "wax",
    precisionMg: 100,
    waxes: [
      { componentId: "wax-soy", partsX100: 7000 },
      { componentId: "wax-coconut", partsX100: 3000 },
    ],
    oils: [{ componentId: "oil-1", partsX100: 100 }],
  },
  expect: {
    totalMg: 800_000,
    waxTotalMg: 727_300,
    fragranceTotalMg: 72_700,
    // Quotas 509.11, 218.19; floors 509.1, 218.1; coconut takes the spare step.
    waxes: [
      { componentId: "wax-soy", targetMg: 509_100, shareX100: 7000 }, // derived: 70.00%
      { componentId: "wax-coconut", targetMg: 218_200, shareX100: 3000 }, // derived: 30.00%
    ],
    oils: [{ componentId: "oil-1", targetMg: 72_700 }],
    equivalentX100: 909, // derived: 10 ÷ 110 = 9.0909
    effectiveOfWaxX100: 1000, // derived: 72.7 ÷ 727.3 = 9.9959
    effectiveOfTotalX100: 909, // derived: 72.7 ÷ 800.0 = 9.0875
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 72.7 g",
    wax: "W = 727.3 g",
    waxes: "Soy 509.1 g, coconut 218.2 g",
  },
  note: "Exact F = 72.72727 g.",
};

/** WE-11. 300 g total, 0%. No oil required. */
export const WE_11: WorkedExample = {
  id: "WE-11",
  title: "Unscented",
  input: {
    sizing: { mode: "total", amountMg: 300_000 },
    fragranceBp: 0,
    basis: "wax",
    precisionMg: 100,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [],
  },
  expect: {
    totalMg: 300_000,
    waxTotalMg: 300_000,
    fragranceTotalMg: 0,
    waxes: [{ componentId: "wax-a", targetMg: 300_000 }],
    oils: [],
    equivalentX100: 0, // derived: 0%
    effectiveOfWaxX100: 0,
    effectiveOfTotalX100: 0,
    effectiveDiffers: false, // 0.00 = 0.00
    roundingWarning: false,
    oilsIgnored: false, // no oils were supplied, so none were ignored
  },
  display: {
    fragrance: "F = 0.0 g",
    wax: "W = 300.0 g",
  },
};

/** WE-12. 100 g total, 8.25% of wax weight, oils 60 : 40, precision 0.01 g. */
export const WE_12: WorkedExample = {
  id: "WE-12",
  title: "Two-decimal percentage at 0.01 g",
  input: {
    sizing: { mode: "total", amountMg: 100_000 },
    fragranceBp: 825,
    basis: "wax",
    precisionMg: 10,
    waxes: [{ componentId: "wax-a", partsX100: 100 }],
    oils: [
      { componentId: "oil-a", partsX100: 6000 },
      { componentId: "oil-b", partsX100: 4000 },
    ],
  },
  expect: {
    totalMg: 100_000,
    waxTotalMg: 92_380,
    fragranceTotalMg: 7_620,
    waxes: [{ componentId: "wax-a", targetMg: 92_380 }],
    // Quotas 4.572, 3.048; floors 4.57, 3.04; oil B takes the spare step (larger remainder).
    oils: [
      { componentId: "oil-a", targetMg: 4_570, shareX100: 6000 }, // derived: 60.00%
      { componentId: "oil-b", targetMg: 3_050, shareX100: 4000 }, // derived: 40.00%
    ],
    equivalentX100: 762, // derived: 8.25 ÷ 108.25 = 7.6212
    effectiveOfWaxX100: 825, // derived: 7.62 ÷ 92.38 = 8.2486
    effectiveOfTotalX100: 762, // derived: 7.62 ÷ 100.0
    effectiveDiffers: false, // 8.25 = 8.25 at 2 decimals
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 7.62 g",
    wax: "W = 92.38 g",
    oils: "4.57 g, 3.05 g",
  },
  note: "Exact F = 7.62125 g.",
};

// ───────────────────────────── WE-9 scaling ─────────────────────────────

/**
 * WE-9a. WE-5 scaled from 6 to 10 vessels, fill kept at 180 g.
 * CALC-26 forbids the multiplied-rounded-weights method (66.7, 44.5, 22.2).
 */
export const WE_9A: ScaleExample = {
  id: "WE-9a",
  title: "More vessels (6 to 10)",
  sourceId: "WE-5",
  method: "vesselCount",
  newVesselCount: 10,
  input: { ...WE_5.input, sizing: { mode: "vessels", count: 10, fillMg: 180_000 } },
  newSizing: { mode: "vessels", count: 10, fillMg: 180_000 },
  factorX10000: 16_667, // spec display: 1.67
  expect: {
    totalMg: 1_800_000,
    waxTotalMg: 1_666_700,
    fragranceTotalMg: 133_300,
    waxes: [{ componentId: "wax-a", targetMg: 1_666_700 }],
    oils: [
      { componentId: "oil-a", targetMg: 66_700, shareX100: 5000 },
      { componentId: "oil-b", targetMg: 44_400, shareX100: 3333 },
      { componentId: "oil-c", targetMg: 22_200, shareX100: 1667 },
    ],
    equivalentX100: 741, // derived: 8 ÷ 108
    effectiveOfWaxX100: 800, // derived: 133.3 ÷ 1666.7 = 7.9972
    effectiveOfTotalX100: 741, // derived: 133.3 ÷ 1800.0 = 7.4056
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  forbidden: { oilsMg: [66_700, 44_500, 22_200] },
  display: {
    fragrance: "F = 133.3 g",
    wax: "W = 1666.7 g",
    oils: "66.7 g, 44.4 g, 22.2 g",
  },
  note: "Oils sum to 133.3 g. The wrong method gives 44.5 for oil B and a 133.4 g sum.",
};

/**
 * WE-9b. WE-5 × 0.5 (540 g total).
 * AMBIGUOUS: the spec gives no method. Multiplier is not offered in vessels mode
 * (CALC-24), so this uses 3 vessels at the same 180 g fill. Count 6 with a 90 g
 * fill would give the same totals.
 */
export const WE_9B: ScaleExample = {
  id: "WE-9b",
  title: "Half batch (6 to 3 vessels)",
  sourceId: "WE-5",
  method: "vesselCount",
  newVesselCount: 3,
  input: { ...WE_5.input, sizing: { mode: "vessels", count: 3, fillMg: 180_000 } },
  newSizing: { mode: "vessels", count: 3, fillMg: 180_000 },
  factorX10000: 5_000, // spec: 0.5 (540 ÷ 1080)
  expect: {
    totalMg: 540_000,
    waxTotalMg: 500_000,
    fragranceTotalMg: 40_000,
    waxes: [{ componentId: "wax-a", targetMg: 500_000 }],
    // Quotas 20.0, 13.333, 6.667; floors 20.0, 13.3, 6.6; oil C takes the spare step.
    oils: [
      { componentId: "oil-a", targetMg: 20_000, shareX100: 5000 },
      { componentId: "oil-b", targetMg: 13_300, shareX100: 3333 },
      { componentId: "oil-c", targetMg: 6_700, shareX100: 1667 },
    ],
    equivalentX100: 741, // derived: 8 ÷ 108
    effectiveOfWaxX100: 800, // derived: 40.0 ÷ 500.0
    effectiveOfTotalX100: 741, // derived: 40.0 ÷ 540.0 = 7.4074
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 40.0 g",
    wax: "W = 500.0 g",
    oils: "20.0 g, 13.3 g, 6.7 g",
  },
};

/**
 * WE-9c. WE-1 × 1.25: 500 g → 625 g total, multiplier 1.25.
 * Basis, percentage and parts are copied (CALC-23).
 */
export const WE_9C: ScaleExample = {
  id: "WE-9c",
  title: "Multiplier 1.25",
  sourceId: "WE-1",
  method: "multiplier",
  multiplierX100: 125,
  input: { ...WE_1.input, sizing: { mode: "total", amountMg: 625_000 } },
  newSizing: { mode: "total", amountMg: 625_000 },
  factorX10000: 12_500, // 625 ÷ 500 × 10000
  expect: {
    totalMg: 625_000,
    waxTotalMg: 578_700,
    fragranceTotalMg: 46_300,
    waxes: [{ componentId: "wax-a", targetMg: 578_700 }],
    oils: [{ componentId: "oil-1", targetMg: 46_300 }],
    equivalentX100: 741, // derived: 8 ÷ 108
    effectiveOfWaxX100: 800, // derived: 46.3 ÷ 578.7 = 8.0007
    effectiveOfTotalX100: 741, // derived: 46.3 ÷ 625.0 = 7.408
    effectiveDiffers: false,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    fragrance: "F = 46.3 g",
    wax: "W = 578.7 g",
  },
  note: "Exact F = 46.29630 g.",
};

/**
 * WE-9d. 333.3 g × 1.5 = 499.95 g, rounds half up to 500.0 g, then as WE-1.
 * AMBIGUOUS: the spec gives no sizing mode for 333.3 g. Total mode with the
 * WE-1 inputs is assumed. The factor uses the rounded new amount (500.0 g):
 * 15002. Using the unrounded 499.95 g would give 15000. The spec does not say.
 */
export const WE_9D: ScaleExample = {
  id: "WE-9d",
  title: "Multiplier needing rounding (333.3 × 1.5)",
  sourceId: "WE-1",
  method: "multiplier",
  multiplierX100: 150,
  input: { ...WE_1.input, sizing: { mode: "total", amountMg: 500_000 } },
  newSizing: { mode: "total", amountMg: 500_000 },
  factorX10000: 15_002, // derived: 500.0 ÷ 333.3 × 10000 = 15001.50015, half up
  expect: {
    totalMg: 500_000,
    waxTotalMg: 463_000,
    fragranceTotalMg: 37_000,
    waxes: [{ componentId: "wax-a", targetMg: 463_000 }],
    oils: [{ componentId: "oil-1", targetMg: 37_000 }],
    equivalentX100: 741,
    effectiveOfWaxX100: 799,
    effectiveOfTotalX100: 740,
    effectiveDiffers: true,
    roundingWarning: false,
    oilsIgnored: false,
  },
  display: {
    amount: "500.0 g",
  },
  note: "New amount 499.95 g rounds half up to 500.0 g. Then identical to WE-1.",
};

export const ALL_SCALE_EXAMPLES: readonly ScaleExample[] = [WE_9A, WE_9B, WE_9C, WE_9D];

// ───────────────────────── WE-8 target versus actual ─────────────────────────

/**
 * WE-8. Plan from WE-5. The maker weighs wax 1003.2 g, A 40.4 g, B 26.1 g, C 13.9 g.
 * Limits are CALC-21: larger of one precision step (0.1 g) or 2% of target.
 */
export const WE_8: MeasuredExample = {
  id: "WE-8",
  title: "Target versus actual (all weights entered)",
  compareInput: {
    precisionMg: 100,
    totalMg: 1_080_000,
    waxTotalMg: 1_000_000,
    fragranceTotalMg: 80_000,
    waxes: [{ componentId: "wax-a", targetMg: 1_000_000 }],
    oils: [
      { componentId: "oil-a", targetMg: 40_000 },
      { componentId: "oil-b", targetMg: 26_700 },
      { componentId: "oil-c", targetMg: 13_300 },
    ],
  },
  entries: [
    { componentId: "wax-a", actualMg: 1_003_200 },
    { componentId: "oil-a", actualMg: 40_400 },
    { componentId: "oil-b", actualMg: 26_100 },
    { componentId: "oil-c", actualMg: 13_900 },
  ],
  components: [
    {
      componentId: "wax-a",
      kind: "wax",
      targetMg: 1_000_000,
      actualMg: 1_003_200,
      diffMg: 3_200,
      diffX100: 32,
      limitMg: 20_000,
      flagged: false,
      direction: null,
      display: { diff: "+3.2 g", pct: "+0.32%", flag: "No (20.0 g)" },
    },
    {
      componentId: "oil-a",
      kind: "oil",
      targetMg: 40_000,
      actualMg: 40_400,
      diffMg: 400,
      diffX100: 100,
      limitMg: 800,
      flagged: false,
      direction: null,
      display: { diff: "+0.4 g", pct: "+1.00%", flag: "No (0.8 g)" },
    },
    {
      componentId: "oil-b",
      kind: "oil",
      targetMg: 26_700,
      actualMg: 26_100,
      diffMg: -600,
      diffX100: -225,
      limitMg: 534,
      flagged: true,
      direction: "under",
      display: { diff: "-0.6 g", pct: "-2.25%", flag: "Yes (0.534 g)" },
    },
    {
      componentId: "oil-c",
      kind: "oil",
      targetMg: 13_300,
      actualMg: 13_900,
      diffMg: 600,
      diffX100: 451,
      limitMg: 266,
      flagged: true,
      direction: "over",
      display: { diff: "+0.6 g", pct: "+4.51%", flag: "Yes (0.266 g)" },
    },
  ],
  fragrance: {
    targetMg: 80_000,
    actualMg: 80_400,
    diffMg: 400,
    diffX100: 50,
  },
  total: {
    targetMg: 1_080_000,
    actualMg: 1_083_600,
    diffMg: 3_600,
    diffX100: 33,
  },
  actualBlend: {
    waxMg: 1_003_200,
    fragranceMg: 80_400,
    totalMg: 1_083_600,
    ofWaxX100: 801, // spec: 8.01% of wax weight
    ofTotalX100: 742, // spec: 7.42% of total mixture
    oilShares: [
      { componentId: "oil-a", shareX100: 5025 }, // spec: 50.25%
      { componentId: "oil-b", shareX100: 3246 }, // spec: 32.46%
      { componentId: "oil-c", shareX100: 1729 }, // spec: 17.29%
    ],
  },
  display: {
    fragranceTotal: "+0.4 g (+0.50%)",
    total: "+3.6 g (+0.33%)",
    actualWax: "8.01% of wax weight",
    actualTotal: "7.42% of total mixture",
    shares: "50.25%, 32.46%, 17.29%",
  },
  note: "Planned shares 50.00%, 33.33%, 16.67%. Spec table prints the minus sign as U+2212; here ASCII hyphen-minus.",
};

/**
 * WE-8, partial. Only wax and oil A entered. The two differences show;
 * fragrance total, total and the actual blend do not, and the summary asks for the rest.
 */
export const WE_8_PARTIAL: MeasuredExample = {
  id: "WE-8 (partial)",
  title: "Target versus actual, wax and oil A only",
  compareInput: WE_8.compareInput,
  entries: [
    { componentId: "wax-a", actualMg: 1_003_200 },
    { componentId: "oil-a", actualMg: 40_400 },
  ],
  components: [
    WE_8.components[0],
    WE_8.components[1],
    {
      componentId: "oil-b",
      kind: "oil",
      targetMg: 26_700,
      actualMg: null,
      diffMg: null,
      diffX100: null,
      limitMg: 534,
      flagged: null,
      direction: null,
    },
    {
      componentId: "oil-c",
      kind: "oil",
      targetMg: 13_300,
      actualMg: null,
      diffMg: null,
      diffX100: null,
      limitMg: 266,
      flagged: null,
      direction: null,
    },
  ],
  fragrance: null,
  total: null,
  actualBlend: null,
  display: {
    summary: "Enter all measured weights to see the actual blend.",
  },
};

export const ALL_MEASURED_EXAMPLES: readonly MeasuredExample[] = [WE_8, WE_8_PARTIAL];

// ───────────────────────────── WE-13 invalid input ─────────────────────────────

/**
 * WE-13. Invalid and incomplete input. Each row: the raw text typed, the rule id
 * the spec says must be reported, and whether the save is blocked.
 * Precision is 0.1 g unless the row says otherwise.
 */
export const WE_13: readonly InvalidInputExample[] = [
  {
    id: "WE-13.1",
    description: 'Batch amount "1,000": not read as 1 g or 1000 g',
    precisionMg: 100,
    raw: { amount: "1,000" },
    field: "amount",
    rule: "V-01",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
    note: "Must not parse as 1 g (1000 mg) or 1000 g (1 000 000 mg).",
  },
  {
    id: "WE-13.2",
    description: 'Batch amount "500.55" at 0.1 g: not rounded silently',
    precisionMg: 100,
    raw: { amount: "500.55" },
    field: "amount",
    rule: "V-04",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
  {
    id: "WE-13.3",
    description: 'Batch amount "0"',
    precisionMg: 100,
    raw: { amount: "0" },
    field: "amount",
    rule: "V-03",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
  {
    id: "WE-13.4",
    description: "Batch amount empty",
    precisionMg: 100,
    raw: { amount: "" },
    field: "amount",
    rule: "V-03",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
  {
    id: "WE-13.5",
    description: 'Fragrance "80" (of wax weight)',
    precisionMg: 100,
    raw: { fragrancePct: "80" },
    field: "fragrancePct",
    rule: "V-07",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
  {
    id: "WE-13.6",
    description: 'Fragrance "13" of wax weight: saves with a warning',
    precisionMg: 100,
    raw: { fragrancePct: "13" },
    field: "fragrancePct",
    rule: "V-08",
    severity: "warning",
    saveBlocked: false,
    resultsPanelEmpty: false,
  },
  {
    id: "WE-13.7",
    description: "Fragrance 8%, no oil row",
    precisionMg: 100,
    raw: { fragrancePct: "8", oils: "" },
    field: "oils",
    rule: "V-11",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
  {
    id: "WE-13.8",
    description: "Two oils, one with empty parts",
    precisionMg: 100,
    raw: { "oils.oil-b.parts": "" },
    field: "oils.oil-b.parts",
    rule: "V-12",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
  {
    id: "WE-13.9",
    description: "Same oil added twice (second row)",
    precisionMg: 100,
    raw: { "oils.oil-b.material": "Lavender" },
    field: "oils.oil-b.material",
    rule: "V-13",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
    note: "Material name is an example; the spec's V-13 message uses Lavender.",
  },
  {
    id: "WE-13.10",
    description: "5 g total, 1% of wax weight, 1 g precision: fragrance rounds to 0 g",
    precisionMg: 1000,
    raw: { amount: "5", fragrancePct: "1" },
    field: "result",
    rule: "V-15",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
    note: "CALC-14 is the zero-component rule and is reported as V-15. Exact F = 0.0495 g.",
  },
  {
    id: "WE-13.11",
    description: 'Measured weight "-2"',
    precisionMg: 100,
    raw: { "measured.<componentId>": "-2" },
    field: "measured.<componentId>",
    rule: "V-01",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: false,
    note: "Spec does not name the component; the measured field is a template here.",
  },
  {
    id: "WE-13.12",
    description: 'Vessel count "2.5"',
    precisionMg: 100,
    raw: { vesselCount: "2.5" },
    field: "vesselCount",
    rule: "V-05",
    severity: "error",
    saveBlocked: true,
    resultsPanelEmpty: true,
  },
];

// ───────────────────────────── Indexes ─────────────────────────────

/** Plan-level worked examples (sections 3 to 5 and 7 CALC-26 outputs not included here; see ALL_SCALE_EXAMPLES). */
export const ALL_WORKED_EXAMPLES: readonly WorkedExample[] = [
  WE_1,
  WE_2,
  WE_3,
  WE_4,
  WE_5,
  WE_6,
  WE_6_HUNDREDTH,
  WE_7_1G,
  WE_7_0_1G,
  WE_7_0_01G,
  WE_10,
  WE_11,
  WE_12,
];

export const ALL_INVALID_INPUT_EXAMPLES: readonly InvalidInputExample[] = WE_13;
