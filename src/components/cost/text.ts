/**
 * Wording helpers for the cost screens (v0.3 TrueCandle Cost). Every figure
 * comes from `@/lib/cost`; this file only joins words and formats weights.
 */
import { batchTitle } from "@/components/batches/text";
import { formatCentavos, fraction, formatUnitPrice } from "@/lib/cost";
import type { ScenarioResult } from "@/lib/cost";
import { formatMeasured, formatMinimalGrams } from "@/lib/gramguard";
import { MESSAGES } from "@/lib/messages";
import type { Batch, CostMaterialLine, CostPrice, CostQuantity, CostSheet, Formula, FormulaVersion, PriceUnit } from "@/lib/types";

const M = MESSAGES.cost;

function withCommas(text: string): string {
  const [whole, rest] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return rest === undefined ? grouped : `${grouped}.${rest}`;
}

/** Milligrams as grams with thousands commas: 1630500 → "1,630.50 g". */
export function gramsText(mg: number): string {
  return `${withCommas(formatMeasured(mg, 10))} g`;
}

/** A lot's quantity received: "20 kg", "500 g", "100 pieces". */
export function receivedText(quantity: number, unit: PriceUnit): string {
  if (unit === "piece") return M.receivedPieces(quantity);
  if (quantity % 1_000_000 === 0) return `${(quantity / 1_000_000).toLocaleString("en-US")} kg`;
  return `${withCommas(formatMinimalGrams(quantity))} g`;
}

/** "₱1,850.00 per kg" or "₱38.50 each" for a stored whole-centavo unit price. */
export function unitPriceText(unitCentavos: number, unit: PriceUnit): string {
  return formatUnitPrice(fraction(unitCentavos), unit);
}

/** Where a line's price came from, in words. */
export function priceSourceText(price: CostPrice, unit: PriceUnit): string {
  switch (price.source) {
    case "lot":
      return M.sourceLot(price.lotCode, formatCentavos(price.paidCentavos), receivedText(price.quantity, unit));
    case "material":
      return M.sourceMaterial(unitPriceText(price.unitCentavos, unit));
    case "sheet":
      return M.sourceSheet(unitPriceText(price.unitCentavos, unit));
    case "none":
      return M.sourceNone;
  }
}

/** A material line's quantity: weight (measured or planned) or pieces per candle. */
export function quantityText(quantity: CostQuantity, pieces: number | null): string {
  if (quantity.unit === "mg") {
    const grams = gramsText(quantity.mg);
    return quantity.from === "measured" ? M.quantityMeasured(grams) : M.quantityPlanned(grams);
  }
  return M.quantityPerCandle(quantity.perCandle, pieces ?? 0);
}

export function lineUnit(line: Pick<CostMaterialLine, "quantity">): PriceUnit {
  return line.quantity.unit === "mg" ? "kg" : "piece";
}

/** The sheet's title, or a plain fallback. */
export function sheetTitle(sheet: Pick<CostSheet, "title">): string {
  return sheet.title?.trim() || M.untitled;
}

type BasisParts = {
  sheet: Pick<CostSheet, "basis">;
  formula: Pick<Formula, "name">;
  version: Pick<FormulaVersion, "number">;
  batch: Pick<Batch, "id" | "label"> | null;
};

/** "From batch CL-2611-A" or "From version 2 of <formula>". */
export function basisText({ sheet, formula, version, batch }: BasisParts): string {
  return sheet.basis === "batch" && batch
    ? M.basisBatch(batchTitle(batch))
    : M.basisVersion(version.number, formula.name);
}

export function sheetHref(id: string): string {
  return `/costs/${id}`;
}

/** Why a scenario has no figures, in words. */
export function reasonText(reason: Extract<ScenarioResult, { ok: false }>["reason"]): string {
  switch (reason) {
    case "no-sellable":
      return M.reasonNoSellable;
    case "margin-unreachable":
      return M.reasonMarginUnreachable;
    case "zero-price":
      return M.reasonZeroPrice;
  }
}
