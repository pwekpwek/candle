import { z } from "zod";
import { MAX_BATCH_LABEL_LENGTH } from "@/lib/types";
import { MeasurementEntrySchema } from "./measurement";
import { IdSchema, IsoDateSchema, TimestampSchema, hasUniqueKeys } from "./primitives";

/** 1 to MAX_BATCH_LABEL_LENGTH characters after trimming. Stored trimmed. */
export const BatchLabelSchema = z.string().refine(
  (value) => value.trim().length >= 1 && value.trim().length <= MAX_BATCH_LABEL_LENGTH,
  { error: `Batch label must be 1 to ${MAX_BATCH_LABEL_LENGTH} characters after trimming.` },
);

/** Store `batches` (v0.2, BatchTrace). */
export const BatchSchema = z.strictObject({
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
});
