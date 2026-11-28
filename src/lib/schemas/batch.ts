import { z } from "zod";
import { MAX_BATCH_LABEL_LENGTH, MAX_CANDLES } from "@/lib/types";
import { BatchLotSchema, batchLotSlot } from "./lots";
import { MeasurementEntrySchema } from "./measurement";
import { IdSchema, IsoDateSchema, TimestampSchema, hasUniqueKeys, intRange } from "./primitives";

/** 1 to MAX_BATCH_LABEL_LENGTH characters after trimming. Stored trimmed. */
export const BatchLabelSchema = z.string().refine(
  (value) => value.trim().length >= 1 && value.trim().length <= MAX_BATCH_LABEL_LENGTH,
  { error: `Batch label must be 1 to ${MAX_BATCH_LABEL_LENGTH} characters after trimming.` },
);

const BATCH_FIELDS = {
  id: IdSchema,
  formulaId: IdSchema,
  versionId: IdSchema,
  label: BatchLabelSchema.optional(),
  producedOn: IsoDateSchema,
  entries: z.array(MeasurementEntrySchema).refine(
    (entries) => hasUniqueKeys(entries.map((entry) => entry.componentId)),
    { error: "Each component can be measured once per batch." },
  ),
  notes: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};

/**
 * A batch as v0.2 wrote it (backup formats 2 to 4): no lot links. Older files
 * are checked against this shape, so a format 4 file whose batch carries lots
 * is refused as damaged (docs/v0.3-lots.md).
 */
export const BatchSchemaV2 = z.strictObject(BATCH_FIELDS);

const BATCH_LOTS = {
  /** Absent when no lot is recorded; never an empty array. At most one per component. */
  lots: z
    .array(BatchLotSchema)
    .min(1)
    .refine((lots) => hasUniqueKeys(lots.map(batchLotSlot)), {
      error: "Each component can have one lot per batch.",
    })
    .optional(),
};

/**
 * A batch as backup formats 5 and 6 hold it: lot links, no candle counts. Those
 * files are checked against this shape (docs/v0.3-cost.md).
 */
export const BatchSchemaV5 = z.strictObject({ ...BATCH_FIELDS, ...BATCH_LOTS });

/** Store `batches` (v0.2 BatchTrace; lot links added in v0.3; candle counts in v0.3 TrueCandle Cost). */
export const BatchSchema = z
  .strictObject({
    ...BATCH_FIELDS,
    ...BATCH_LOTS,
    candlesMade: intRange(1, MAX_CANDLES).optional(),
    sellable: intRange(0, MAX_CANDLES).optional(),
  })
  .refine((batch) => batch.sellable === undefined || batch.candlesMade !== undefined, {
    error: "Sellable candles need the number of candles made.",
    path: ["sellable"],
  })
  .refine((batch) => batch.sellable === undefined || batch.sellable <= (batch.candlesMade ?? 0), {
    error: "Sellable candles cannot be more than candles made.",
    path: ["sellable"],
  });
