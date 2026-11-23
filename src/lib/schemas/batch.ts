import { z } from "zod";
import { MAX_BATCH_LABEL_LENGTH } from "@/lib/types";
import { BatchLotSchema, batchLotSlot } from "./lots";
import { MeasurementEntrySchema } from "./measurement";
import { IdSchema, IsoDateSchema, TimestampSchema, hasUniqueKeys } from "./primitives";

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

/** Store `batches` (v0.2 BatchTrace; lot links added in v0.3). */
export const BatchSchema = z.strictObject({
  ...BATCH_FIELDS,
  /** Absent when no lot is recorded; never an empty array. At most one per component. */
  lots: z
    .array(BatchLotSchema)
    .min(1)
    .refine((lots) => hasUniqueKeys(lots.map(batchLotSlot)), {
      error: "Each component can have one lot per batch.",
    })
    .optional(),
});
