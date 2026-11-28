/**
 * TrueCandle Cost calculator. Exact fractions throughout; nothing is rounded
 * here. Design: docs/v0.3-cost.md "The calculation".
 */
import { VAT_BP } from "@/lib/types";
import type { CostMaterialLine, CostScenario } from "@/lib/types";
import type {
  CostResult,
  CostSheetFigures,
  Fraction,
  ItemLineCost,
  MaterialLineCost,
  PerSellableBreakdown,
  ScenarioResult,
} from "./contract";
import { ONE, ZERO, add, div, fraction, isZero, mul, sub, sum } from "./rational";

const MG_PER_KG = 1_000_000;

function materialLineCost(line: CostMaterialLine, candlesMade: number): MaterialLineCost {
  const price = line.price;
  const q = line.quantity;
  const unit = q.unit === "mg" ? ("kg" as const) : ("piece" as const);
  const pieces = q.unit === "piece" ? q.perCandle * candlesMade : null;
  const missing: MaterialLineCost = { line, cost: ZERO, pieces, source: price.source, unitPrice: null, unit };
  if (price.source === "none") return missing;

  // The unit price (centavos per kg or per piece) this line used.
  let unitPrice: Fraction;
  if (price.source === "lot") {
    if (price.quantity <= 0) return missing;
    unitPrice =
      q.unit === "mg"
        ? fraction(BigInt(price.paidCentavos) * BigInt(MG_PER_KG), price.quantity)
        : fraction(price.paidCentavos, price.quantity);
  } else {
    unitPrice = fraction(price.unitCentavos);
  }

  const cost =
    q.unit === "mg"
      ? mul(fraction(q.mg), div(unitPrice, fraction(MG_PER_KG)))
      : mul(fraction(BigInt(q.perCandle) * BigInt(candlesMade)), unitPrice);
  return { line, cost, pieces, source: price.source, unitPrice, unit };
}

/** One scenario, given the exact cost per sellable candle. */
export function calculateScenario(
  scenario: CostScenario,
  perSellable: Fraction | null,
  sellable: number,
  pricesIncludeVat: boolean,
): ScenarioResult {
  if (perSellable === null || sellable <= 0) return { ok: false, scenario, reason: "no-sellable" };
  const v = pricesIncludeVat ? fraction(10_000 + VAT_BP, 10_000) : ONE;
  let price: Fraction;
  let exVatPrice: Fraction;
  if (scenario.mode === "price") {
    if (scenario.priceCentavos < 1) return { ok: false, scenario, reason: "zero-price" };
    price = fraction(scenario.priceCentavos);
    exVatPrice = div(price, v);
  } else {
    if (scenario.marginBp >= 10_000) return { ok: false, scenario, reason: "margin-unreachable" };
    exVatPrice = div(perSellable, fraction(10_000 - scenario.marginBp, 10_000));
    price = mul(exVatPrice, v);
  }
  const profitPerCandle = sub(exVatPrice, perSellable);
  // A zero cost with a margin target gives a zero price; the margin is then the target itself.
  const margin = isZero(exVatPrice)
    ? fraction(scenario.mode === "margin" ? scenario.marginBp : 0, 10_000)
    : div(profitPerCandle, exVatPrice);
  return {
    ok: true,
    scenario,
    price,
    exVatPrice,
    vat: sub(price, exVatPrice),
    profitPerCandle,
    margin,
    batchProfit: mul(profitPerCandle, fraction(sellable)),
  };
}

/** The whole sheet. */
export function calculateCost(figures: CostSheetFigures): CostResult {
  const { candlesMade, sellable } = figures;
  const materialLines = figures.materials.map((l) => materialLineCost(l, candlesMade));
  const materials = sum(materialLines.map((l) => l.cost));
  const missingPrices = materialLines.filter((l) => l.source === "none").length;

  const itemLines: ItemLineCost[] = figures.items.map((line) => ({
    line,
    cost: mul(
      fraction(line.unitCentavos),
      fraction(BigInt(line.quantity) * (line.per === "sellable" ? BigInt(sellable) : BigInt(1))),
    ),
  }));
  const itemsPerBatch = sum(itemLines.filter((l) => l.line.per === "batch").map((l) => l.cost));
  const packaging = sum(itemLines.filter((l) => l.line.per === "sellable").map((l) => l.cost));

  const labour = fraction(BigInt(figures.labourHoursX100) * BigInt(figures.labourRateCentavos), 100);
  const overhead =
    figures.overhead.mode === "fixed"
      ? fraction(figures.overhead.centavos)
      : mul(add(materials, labour), fraction(figures.overhead.bp, 10_000));
  const testing = fraction(figures.testingCentavos);

  const production = add(add(materials, itemsPerBatch), add(labour, overhead));
  const perCandleMade = candlesMade > 0 ? div(production, fraction(candlesMade)) : ZERO;
  const nonSellableCount = candlesMade - sellable;
  const nonSellableCost = mul(perCandleMade, fraction(nonSellableCount));
  const batchTotal = add(add(production, testing), packaging);

  let perSellable: Fraction | null = null;
  let perSellableBreakdown: PerSellableBreakdown | null = null;
  if (sellable > 0) {
    const s = fraction(sellable);
    perSellable = div(batchTotal, s);
    perSellableBreakdown = {
      production: div(production, s),
      nonSellableShare: div(nonSellableCost, s),
      testing: div(testing, s),
      packaging: div(packaging, s),
    };
  }

  const scenarioOf = (sc: CostScenario | null): ScenarioResult | null =>
    sc ? calculateScenario(sc, perSellable, sellable, figures.pricesIncludeVat) : null;

  return {
    materialLines,
    materials,
    missingPrices,
    itemLines,
    itemsPerBatch,
    packaging,
    labour,
    overhead,
    testing,
    production,
    perCandleMade,
    nonSellableCount,
    nonSellableCost,
    batchTotal,
    perSellable,
    perSellableBreakdown,
    complete: missingPrices === 0,
    wholesale: scenarioOf(figures.wholesale),
    retail: scenarioOf(figures.retail),
  };
}
