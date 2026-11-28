import { z } from "zod";
import {
  MAX_CANDLES,
  MAX_COST_ITEM_NAME_LENGTH,
  MAX_COST_NOTES_LENGTH,
  MAX_COST_SHEET_TITLE_LENGTH,
  MAX_ITEM_QUANTITY,
  MAX_LABOUR_HOURS_X100,
  MAX_LOT_CODE_LENGTH,
  MAX_LOT_PIECES,
  MAX_MARGIN_BP,
  MAX_MONEY_CENTAVOS,
  MAX_OVERHEAD_BP,
  MAX_PIECES_PER_CANDLE,
  MAX_SHEET_ITEMS,
} from "@/lib/types";
import { LIMITS } from "@/lib/gramguard/contract";
import { CentavosSchema } from "./material";
import {
  IdSchema,
  MaterialTypeSchema,
  NameSchema,
  NullableTimestampSchema,
  TimestampSchema,
  hasUniqueKeys,
  intRange,
  weightMg,
} from "./primitives";

/**
 * v0.3 TrueCandle Cost schemas (docs/v0.3-cost.md). Money is whole centavos.
 * Strings are stored trimmed by the repositories; these schemas check the
 * trimmed length.
 */

function trimmedLength(max: number, what: string) {
  return z.string().refine(
    (value) => value.trim().length >= 1 && value.trim().length <= max,
    { error: `${what} must be 1 to ${max} characters after trimming.` },
  );
}

const CostNotesSchema = z.string().max(MAX_COST_NOTES_LENGTH);
const CostItemNameSchema = trimmedLength(MAX_COST_ITEM_NAME_LENGTH, "Item name");

/** Store `costItems`. */
export const CostItemSchema = z.strictObject({
  id: IdSchema,
  name: CostItemNameSchema,
  unitCentavos: CentavosSchema,
  notes: CostNotesSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: NullableTimestampSchema,
});

/** A lot's price snapshot: quantity in mg (weights) or pieces; the line's unit decides which range applies. */
export const CostPriceSchema = z.discriminatedUnion("source", [
  z.strictObject({
    source: z.literal("lot"),
    lotId: IdSchema,
    lotCode: trimmedLength(MAX_LOT_CODE_LENGTH, "Lot code"),
    paidCentavos: CentavosSchema,
    quantity: intRange(1, Math.max(LIMITS.maxWeightMg, MAX_LOT_PIECES)),
  }),
  z.strictObject({ source: z.literal("material"), unitCentavos: CentavosSchema }),
  z.strictObject({ source: z.literal("sheet"), unitCentavos: CentavosSchema }),
  z.strictObject({ source: z.literal("none") }),
]);

export const CostQuantitySchema = z.discriminatedUnion("unit", [
  z.strictObject({ unit: z.literal("mg"), mg: weightMg(0), from: z.enum(["planned", "measured"]) }),
  z.strictObject({ unit: z.literal("piece"), perCandle: intRange(0, MAX_PIECES_PER_CANDLE) }),
]);

const WEIGHT_TYPES = new Set(["wax", "fragranceOil"]);

/** The key a material line has: "row:<componentId>", "wick" or "vessel" (as `batchLotSlot`). */
export const CostLineKeySchema = z.string().regex(/^(row:.+|wick|vessel)$/, {
  error: "A cost line key is row:<componentId>, wick or vessel.",
});

export const CostMaterialLineSchema = z
  .strictObject({
    key: CostLineKeySchema,
    materialId: IdSchema,
    materialType: MaterialTypeSchema,
    name: NameSchema,
    quantity: CostQuantitySchema,
    price: CostPriceSchema,
  })
  .refine((line) => (line.quantity.unit === "mg") === WEIGHT_TYPES.has(line.materialType), {
    error: "Wax and oil lines are weighed; wick and vessel lines are counted in pieces.",
  })
  .refine((line) => (line.key.startsWith("row:") ? WEIGHT_TYPES.has(line.materialType) : line.key === materialSlot(line.materialType)), {
    error: "A row line is a wax or oil; the wick and vessel lines are their own key.",
  })
  .refine(
    (line) =>
      line.price.source !== "lot" ||
      line.price.quantity <= (line.quantity.unit === "mg" ? LIMITS.maxWeightMg : MAX_LOT_PIECES),
    { error: "Lot quantity is out of range." },
  );

function materialSlot(type: string): string {
  return type === "wick" ? "wick" : type === "vessel" ? "vessel" : "";
}

export const CostItemLineSchema = z.strictObject({
  id: IdSchema,
  itemId: IdSchema.nullable(),
  name: CostItemNameSchema,
  unitCentavos: CentavosSchema,
  per: z.enum(["sellable", "batch"]),
  quantity: intRange(1, MAX_ITEM_QUANTITY),
});

export const CostOverheadSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("fixed"), centavos: CentavosSchema }),
  z.strictObject({ mode: z.literal("percent"), bp: intRange(0, MAX_OVERHEAD_BP) }),
]);

export const CostScenarioSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("price"), priceCentavos: intRange(1, MAX_MONEY_CENTAVOS) }),
  z.strictObject({ mode: z.literal("margin"), marginBp: intRange(0, MAX_MARGIN_BP) }),
]);

/** Store `costSheets`. */
export const CostSheetSchema = z
  .strictObject({
    id: IdSchema,
    title: trimmedLength(MAX_COST_SHEET_TITLE_LENGTH, "Title").optional(),
    basis: z.enum(["version", "batch"]),
    formulaId: IdSchema,
    versionId: IdSchema,
    batchId: IdSchema.nullable(),
    candlesMade: intRange(1, MAX_CANDLES),
    sellable: intRange(0, MAX_CANDLES),
    materials: z
      .array(CostMaterialLineSchema)
      .max(17)
      .refine((lines) => hasUniqueKeys(lines.map((line) => line.key)), {
        error: "Each component has one line per sheet.",
      }),
    items: z
      .array(CostItemLineSchema)
      .max(MAX_SHEET_ITEMS)
      .refine((lines) => hasUniqueKeys(lines.map((line) => line.id)), {
        error: "Each item line has its own id.",
      }),
    labourHoursX100: intRange(0, MAX_LABOUR_HOURS_X100),
    labourRateCentavos: CentavosSchema,
    overhead: CostOverheadSchema,
    testingCentavos: CentavosSchema,
    pricesIncludeVat: z.boolean(),
    wholesale: CostScenarioSchema.nullable(),
    retail: CostScenarioSchema.nullable(),
    copiedFromId: IdSchema.nullable(),
    notes: CostNotesSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .refine((sheet) => (sheet.basis === "batch") === (sheet.batchId !== null), {
    error: "A batch sheet names its batch; a version sheet does not.",
    path: ["batchId"],
  })
  .refine((sheet) => sheet.sellable <= sheet.candlesMade, {
    error: "Sellable candles cannot be more than candles made.",
    path: ["sellable"],
  });
