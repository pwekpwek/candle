/**
 * TrueCandle Cost pure logic — contract (v0.3 TrueCandle Cost, lead). Pure
 * functions only: nothing here reads the clock, IndexedDB or the DOM.
 * Design: docs/v0.3-cost.md ("The calculation", "Scenarios, margins and VAT",
 * "Worked batch").
 *
 * `@/lib/cost` must export every function in `CostModule` below, by these
 * names, plus the types in this file.
 *
 * Rules:
 *   - Money is whole centavos (PHP only). Nothing is rounded until it is
 *     formatted: every computed amount is an exact `Fraction` (bigint
 *     numerator over a positive bigint denominator, in lowest terms). No
 *     floating point anywhere, including in parsing and formatting.
 *   - Formatting rounds half up, and half away from zero for negatives
 *     (`divHalfAwayFromZero` from `@/lib/gramguard`).
 *   - Every screen gets its figures from here. No screen does its own maths.
 */
import type {
  CostItemLine,
  CostMaterialLine,
  CostPriceSource,
  CostScenario,
  CostSheet,
  PriceUnit,
} from "@/lib/types";

// ───────────────────────────── Exact fractions ─────────────────────────────

/** An exact rational number. `d` > 0 and gcd(|n|, d) = 1 (0 is { n: 0n, d: 1n }). */
export type Fraction = { readonly n: bigint; readonly d: bigint };

// ───────────────────────────── Calculator input ─────────────────────────────

/**
 * What the calculator needs: the stored sheet's cost fields. The editor
 * passes its unsaved values in the same shape, so results update live.
 */
export type CostSheetFigures = Pick<
  CostSheet,
  | "candlesMade"
  | "sellable"
  | "materials"
  | "items"
  | "labourHoursX100"
  | "labourRateCentavos"
  | "overhead"
  | "testingCentavos"
  | "pricesIncludeVat"
  | "wholesale"
  | "retail"
>;

// ───────────────────────────── Calculator output ─────────────────────────────

export type MaterialLineCost = {
  line: CostMaterialLine;
  /** Exact centavos for the batch. 0 when the price is missing. */
  cost: Fraction;
  /** Pieces for the batch (perCandle × candlesMade) for a piece line; null for a weight line. */
  pieces: number | null;
  source: CostPriceSource;
  /**
   * The unit price this line used, exact centavos per `unit` (per kg or per
   * piece): for a lot, paid ÷ quantity scaled to the unit (per kg: paid ×
   * 1 000 000 ÷ quantity mg). Null when the price is missing.
   */
  unitPrice: Fraction | null;
  unit: PriceUnit;
};

export type ItemLineCost = {
  line: CostItemLine;
  /** unitCentavos × quantity × (sellable for "sellable", 1 for "batch"). Exact centavos. */
  cost: Fraction;
};

export type ScenarioName = "wholesale" | "retail";

export type ScenarioResult =
  | {
      ok: true;
      scenario: CostScenario;
      /** The price shown to buyers (includes VAT when the switch is on). */
      price: Fraction;
      /** Price without VAT; equals `price` when the switch is off. */
      exVatPrice: Fraction;
      /** price − exVatPrice; 0 when the switch is off. */
      vat: Fraction;
      /** exVatPrice − cost per sellable candle. May be negative. */
      profitPerCandle: Fraction;
      /** profitPerCandle ÷ exVatPrice, as a fraction of 1 (0.4 = 40%). May be negative. */
      margin: Fraction;
      /** profitPerCandle × sellable. */
      batchProfit: Fraction;
    }
  | {
      ok: false;
      scenario: CostScenario;
      /**
       * no-sellable         sellable is 0, so there is no cost per sellable candle
       * margin-unreachable  target margin ≥ 100% (marginBp ≥ 10 000)
       * zero-price          price below ₱0.01 (priceCentavos < 1)
       */
      reason: "no-sellable" | "margin-unreachable" | "zero-price";
    };

export type PerSellableBreakdown = {
  /** production ÷ sellable (includes the non-sellable share). */
  production: Fraction;
  /** cost of non-sellable candles ÷ sellable. */
  nonSellableShare: Fraction;
  /** testing ÷ sellable. */
  testing: Fraction;
  /** packaging ÷ sellable. */
  packaging: Fraction;
};

export type CostResult = {
  materialLines: MaterialLineCost[];
  materials: Fraction;
  /** Material lines with source "none". The sheet is incomplete when above 0. */
  missingPrices: number;
  itemLines: ItemLineCost[];
  /** Σ item lines per "batch". */
  itemsPerBatch: Fraction;
  /** Σ item lines per "sellable" (already × sellable). */
  packaging: Fraction;
  labour: Fraction;
  overhead: Fraction;
  testing: Fraction;
  /** materials + itemsPerBatch + labour + overhead. */
  production: Fraction;
  /** production ÷ candlesMade. */
  perCandleMade: Fraction;
  /** candlesMade − sellable. */
  nonSellableCount: number;
  /** perCandleMade × nonSellableCount. */
  nonSellableCost: Fraction;
  /** production + testing + packaging. */
  batchTotal: Fraction;
  /** batchTotal ÷ sellable; null when sellable is 0. */
  perSellable: Fraction | null;
  /**
   * Null when sellable is 0. production + testing + packaging = perSellable
   * exactly; nonSellableShare is the part of production that pays for the
   * non-sellable candles (shown as "of which").
   */
  perSellableBreakdown: PerSellableBreakdown | null;
  /** True when no material line is missing its price. */
  complete: boolean;
  /** Null when that scenario is not set on the sheet. */
  wholesale: ScenarioResult | null;
  retail: ScenarioResult | null;
};

// ───────────────────────────── Parsing (screen input) ─────────────────────────────

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: "empty" | "format" | "range" };

// ───────────────────────────── The module ─────────────────────────────

export type CostModule = {
  // Fractions
  /** A whole number (number or bigint) as a fraction. */
  fraction(n: number | bigint, d?: number | bigint): Fraction;
  add(a: Fraction, b: Fraction): Fraction;
  sub(a: Fraction, b: Fraction): Fraction;
  mul(a: Fraction, b: Fraction): Fraction;
  /** Throws RangeError when b is 0. */
  div(a: Fraction, b: Fraction): Fraction;
  /** Exact centavos rounded half away from zero to whole centavos. */
  roundCentavos(value: Fraction): bigint;

  // Calculation
  /** The whole sheet. Never throws for a schema-valid sheet. */
  calculateCost(figures: CostSheetFigures): CostResult;
  /** One scenario, given the exact cost per sellable candle (null when sellable is 0). */
  calculateScenario(
    scenario: CostScenario,
    perSellable: Fraction | null,
    sellable: number,
    pricesIncludeVat: boolean,
  ): ScenarioResult;

  // Formatting (pure; ASCII hyphen-minus for negatives)
  /** Exact centavos as "₱1,234.56" / "-₱12.30" (half away from zero). */
  formatPeso(value: Fraction): string;
  /** Whole centavos as "₱1,850.00". */
  formatCentavos(centavos: number): string;
  /** A fraction of 1 as a percentage with two decimals: 0.519765… → "51.98%", negative "-5.10%". */
  formatMargin(margin: Fraction): string;
  /** Hundredths of 1% as typed: 1250 → "12.5%", 4000 → "40%", 1234 → "12.34%". */
  formatBp(bp: number): string;
  /** Hundredths of an hour: 350 → "3.5", 25 → "0.25", 400 → "4". */
  formatHours(hoursX100: number): string;
  /** A unit price: "₱1,850.00 per kg" or "₱38.50 each". */
  formatUnitPrice(unitPrice: Fraction, unit: PriceUnit): string;
  /**
   * Centavos as the plain text an input shows: 185000 → "1850.00", 0 → "0.00".
   * No ₱ and no commas, so it parses back with `parseMoney`.
   */
  centavosToInput(centavos: number): string;

  // Parsing what the maker types (trimmed; never floating point)
  /**
   * Pesos with at most 2 decimals: "1850", "1,850.5", "₱1,850.00" → centavos.
   * An optional leading "₱" and thousands commas in the right places are
   * accepted. "empty", "format" (letters, 3 decimals, a minus sign, misplaced
   * commas) or "range" (above MAX_MONEY_CENTAVOS).
   */
  parseMoney(text: string): ParseResult<number>;
  /** Hours with at most 2 decimals: "3.5" → 350. "range" above MAX_LABOUR_HOURS_X100. */
  parseHours(text: string): ParseResult<number>;
  /** A percentage with at most 2 decimals: "12.5" or "12.5%" → 1250. "range" above `maxBp`. */
  parsePercent(text: string, maxBp: number): ParseResult<number>;
  /** A whole number from min to max: "12" → 12. "format" for decimals or signs, "range" outside. */
  parseWholeNumber(text: string, min: number, max: number): ParseResult<number>;
};
