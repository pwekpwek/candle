/**
 * Form model for the cost sheet editor (v0.3 TrueCandle Cost): what the maker
 * types, checked and turned into `CostSheetInput` (what is saved) and
 * `CostSheetFigures` (what the live results are worked out from). All parsing
 * and money handling is in `@/lib/cost`; nothing here does maths on money.
 */
import {
  centavosToInput,
  formatBp,
  formatCentavos,
  formatHours,
  parseHours,
  parseMoney,
  parsePercent,
  parseWholeNumber,
} from "@/lib/cost";
import type { CostSheetFigures, ParseResult } from "@/lib/cost";
import type { CostItemLineInput, CostMaterialLineInput, CostSheetInput } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import {
  MAX_CANDLES,
  MAX_COST_ITEM_NAME_LENGTH,
  MAX_COST_NOTES_LENGTH,
  MAX_COST_SHEET_TITLE_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_MARGIN_BP,
  MAX_MONEY_CENTAVOS,
  MAX_OVERHEAD_BP,
  MAX_PIECES_PER_CANDLE,
} from "@/lib/types";
import type {
  CostItemLine,
  CostItemPer,
  CostMaterialLine,
  CostPrice,
  CostScenario,
  CostSheet,
  MaterialType,
  CostQuantity,
} from "@/lib/types";

const M = MESSAGES.cost;

export type PriceMode = "keep" | "typed" | "none";
export type ScenarioMode = "none" | "price" | "margin";
export type OverheadMode = "fixed" | "percent";

export type LineValues = {
  key: string;
  name: string;
  materialType: MaterialType;
  quantity: CostQuantity;
  /** The price the sheet had when the editor opened. Shown until the maker changes it. */
  original: CostPrice;
  mode: PriceMode;
  priceText: string;
  /** Wick and vessel lines only. */
  perCandleText: string;
};

export type ItemValues = {
  /** Local key for React; a stored line's id for a stored line. */
  rowKey: string;
  /** Present for a stored line, so saving keeps it. */
  id?: string;
  itemId: string | null;
  name: string;
  priceText: string;
  per: CostItemPer;
  quantityText: string;
};

export type ScenarioValues = { mode: ScenarioMode; priceText: string; marginText: string };

export type FormValues = {
  title: string;
  notes: string;
  candlesText: string;
  sellableText: string;
  lines: LineValues[];
  items: ItemValues[];
  hoursText: string;
  rateText: string;
  overheadMode: OverheadMode;
  overheadFixedText: string;
  overheadPercentText: string;
  testingText: string;
  pricesIncludeVat: boolean;
  wholesale: ScenarioValues;
  retail: ScenarioValues;
};

/** Field errors by key: title, notes, candles, sellable, line:<key>:pieces|price, item:<rowKey>:name|price|quantity, hours, rate, overheadFixed, overheadPercent, testing, <scenario>:price|margin. */
export type FormErrors = Record<string, string>;

function scenarioValues(scenario: CostScenario | null): ScenarioValues {
  return {
    mode: scenario === null ? "none" : scenario.mode,
    priceText: scenario?.mode === "price" ? centavosToInput(scenario.priceCentavos) : "",
    marginText: scenario?.mode === "margin" ? formatBp(scenario.marginBp).replace("%", "") : "",
  };
}

export function itemValuesFromLine(line: CostItemLine): ItemValues {
  return {
    rowKey: line.id,
    id: line.id,
    itemId: line.itemId,
    name: line.name,
    priceText: centavosToInput(line.unitCentavos),
    per: line.per,
    quantityText: String(line.quantity),
  };
}

export function valuesFromSheet(sheet: CostSheet): FormValues {
  return {
    title: sheet.title ?? "",
    notes: sheet.notes ?? "",
    candlesText: String(sheet.candlesMade),
    sellableText: String(sheet.sellable),
    lines: sheet.materials.map((line) => ({
      key: line.key,
      name: line.name,
      materialType: line.materialType,
      quantity: line.quantity,
      original: line.price,
      mode: line.price.source === "sheet" ? "typed" : line.price.source === "none" ? "none" : "keep",
      priceText: line.price.source === "sheet" ? centavosToInput(line.price.unitCentavos) : "",
      perCandleText: line.quantity.unit === "piece" ? String(line.quantity.perCandle) : "",
    })),
    items: sheet.items.map(itemValuesFromLine),
    hoursText: formatHours(sheet.labourHoursX100),
    rateText: centavosToInput(sheet.labourRateCentavos),
    overheadMode: sheet.overhead.mode,
    overheadFixedText: sheet.overhead.mode === "fixed" ? centavosToInput(sheet.overhead.centavos) : "",
    overheadPercentText: sheet.overhead.mode === "percent" ? formatBp(sheet.overhead.bp).replace("%", "") : "",
    testingText: centavosToInput(sheet.testingCentavos),
    pricesIncludeVat: sheet.pricesIncludeVat,
    wholesale: scenarioValues(sheet.wholesale),
    retail: scenarioValues(sheet.retail),
  };
}

function moneyError(result: ParseResult<number>, emptyMessage: string = M.errMoney): string | null {
  if (result.ok) return null;
  if (result.reason === "empty") return emptyMessage;
  if (result.reason === "range") return M.errMoneyRange(formatCentavos(MAX_MONEY_CENTAVOS));
  return M.errMoney;
}

export type Built =
  | { ok: true; input: CostSheetInput; figures: CostSheetFigures }
  | { ok: false; errors: FormErrors };

/**
 * Checks every field. Valid: the input to save and the figures to calculate
 * from. Not valid: the errors by field key.
 */
export function buildFromValues(values: FormValues, sheet: CostSheet): Built {
  const errors: FormErrors = {};

  const title = values.title.trim();
  if (title.length > MAX_COST_SHEET_TITLE_LENGTH) errors.title = M.errTitleLong(MAX_COST_SHEET_TITLE_LENGTH);
  const notes = values.notes.trim();
  if (notes.length > MAX_COST_NOTES_LENGTH) errors.notes = M.errNotesLong(MAX_COST_NOTES_LENGTH);

  const candles = parseWholeNumber(values.candlesText, 1, MAX_CANDLES);
  if (!candles.ok) {
    errors.candles =
      candles.reason === "empty"
        ? M.errCandlesRequired
        : candles.reason === "format"
          ? M.errCandlesWhole
          : M.errCandlesRange(MAX_CANDLES);
  }
  const sellable = parseWholeNumber(values.sellableText, 0, MAX_CANDLES);
  if (!sellable.ok) {
    errors.sellable =
      sellable.reason === "empty"
        ? M.errSellableRequired
        : sellable.reason === "format"
          ? M.errSellableWhole
          : M.errCandlesRange(MAX_CANDLES);
  } else if (candles.ok && sellable.value > candles.value) {
    errors.sellable = M.errSellableOver;
  }

  const materialInputs: CostMaterialLineInput[] = [];
  const materialLines: CostMaterialLine[] = [];
  for (const line of values.lines) {
    const stored = sheet.materials.find((l) => l.key === line.key);
    let perCandle: number | undefined;
    let quantity = line.quantity;
    if (line.quantity.unit === "piece") {
      const parsed = parseWholeNumber(line.perCandleText, 0, MAX_PIECES_PER_CANDLE);
      if (parsed.ok) {
        perCandle = parsed.value;
        quantity = { unit: "piece", perCandle: parsed.value };
      } else {
        errors[`line:${line.key}:pieces`] = M.errPiecesPerCandle(MAX_PIECES_PER_CANDLE);
      }
    }
    let price: CostPrice = line.original;
    if (line.mode === "none") price = { source: "none" };
    else if (line.mode === "typed") {
      const parsed = parseMoney(line.priceText);
      const message = moneyError(parsed, M.errPriceRequired);
      if (message || !parsed.ok) errors[`line:${line.key}:price`] = message ?? M.errMoney;
      else price = { source: "sheet", unitCentavos: parsed.value };
    }
    materialInputs.push({ key: line.key, ...(perCandle === undefined ? {} : { perCandle }), price });
    materialLines.push({
      key: line.key,
      materialId: stored?.materialId ?? "",
      materialType: line.materialType,
      name: line.name,
      quantity,
      price,
    });
  }

  const itemInputs: CostItemLineInput[] = [];
  const itemLines: CostItemLine[] = [];
  for (const item of values.items) {
    const name = item.name.trim();
    if (name.length < 1 || name.length > MAX_COST_ITEM_NAME_LENGTH) {
      errors[`item:${item.rowKey}:name`] = M.errItemName(MAX_COST_ITEM_NAME_LENGTH);
    }
    const price = parseMoney(item.priceText);
    const priceMessage = moneyError(price);
    if (priceMessage) errors[`item:${item.rowKey}:price`] = priceMessage;
    const quantity = parseWholeNumber(item.quantityText, 1, MAX_ITEM_QUANTITY);
    if (!quantity.ok) errors[`item:${item.rowKey}:quantity`] = M.errItemQuantity(MAX_ITEM_QUANTITY);
    if (price.ok && quantity.ok) {
      itemInputs.push({
        ...(item.id ? { id: item.id } : {}),
        itemId: item.itemId,
        name,
        unitCentavos: price.value,
        per: item.per,
        quantity: quantity.value,
      });
      itemLines.push({
        id: item.id ?? item.rowKey,
        itemId: item.itemId,
        name,
        unitCentavos: price.value,
        per: item.per,
        quantity: quantity.value,
      });
    }
  }

  const hours = parseHours(values.hoursText);
  if (!hours.ok) errors.hours = hours.reason === "range" ? M.errHoursRange : M.errHours;
  const rate = parseMoney(values.rateText);
  const rateMessage = moneyError(rate);
  if (rateMessage) errors.rate = rateMessage;

  let overhead: CostSheetInput["overhead"] = { mode: "fixed", centavos: 0 };
  if (values.overheadMode === "fixed") {
    const fixed = parseMoney(values.overheadFixedText);
    const message = moneyError(fixed);
    if (message || !fixed.ok) errors.overheadFixed = message ?? M.errMoney;
    else overhead = { mode: "fixed", centavos: fixed.value };
  } else {
    const percent = parsePercent(values.overheadPercentText, MAX_OVERHEAD_BP);
    if (!percent.ok) {
      errors.overheadPercent = percent.reason === "range" ? M.errPercentRange(formatBp(MAX_OVERHEAD_BP)) : M.errPercent;
    } else overhead = { mode: "percent", bp: percent.value };
  }

  const testing = parseMoney(values.testingText);
  const testingMessage = moneyError(testing);
  if (testingMessage) errors.testing = testingMessage;

  const scenario = (name: "wholesale" | "retail"): CostScenario | null => {
    const v = values[name];
    if (v.mode === "none") return null;
    if (v.mode === "price") {
      const parsed = parseMoney(v.priceText);
      const message = moneyError(parsed);
      if (message || !parsed.ok) errors[`${name}:price`] = message ?? M.errMoney;
      else if (parsed.value < 1) errors[`${name}:price`] = M.errPriceMin;
      else return { mode: "price", priceCentavos: parsed.value };
      return null;
    }
    // A very high ceiling here so 100 and over reads as "below 100%" rather than as a typing error.
    const parsed = parsePercent(v.marginText, 1_000_000);
    if (!parsed.ok) errors[`${name}:margin`] = parsed.reason === "range" ? M.errMarginRange : M.errPercent;
    else if (parsed.value > MAX_MARGIN_BP) errors[`${name}:margin`] = M.errMarginRange;
    else return { mode: "margin", marginBp: parsed.value };
    return null;
  };
  const wholesale = scenario("wholesale");
  const retail = scenario("retail");

  if (
    Object.keys(errors).length > 0 ||
    !candles.ok ||
    !sellable.ok ||
    !hours.ok ||
    !rate.ok ||
    !testing.ok
  ) {
    return { ok: false, errors };
  }

  const input: CostSheetInput = {
    ...(title ? { title } : {}),
    candlesMade: candles.value,
    sellable: sellable.value,
    materials: materialInputs,
    items: itemInputs,
    labourHoursX100: hours.value,
    labourRateCentavos: rate.value,
    overhead,
    testingCentavos: testing.value,
    pricesIncludeVat: values.pricesIncludeVat,
    wholesale,
    retail,
    ...(notes ? { notes } : {}),
  };
  const figures: CostSheetFigures = {
    candlesMade: candles.value,
    sellable: sellable.value,
    materials: materialLines,
    items: itemLines,
    labourHoursX100: hours.value,
    labourRateCentavos: rate.value,
    overhead,
    testingCentavos: testing.value,
    pricesIncludeVat: values.pricesIncludeVat,
    wholesale,
    retail,
  };
  return { ok: true, input, figures };
}
