import { z } from "zod";
import {
  IdSchema,
  IsoDateSchema,
  NonEmptyStringSchema,
  TimestampSchema,
  hasUniqueKeys,
  weightMg,
} from "./primitives";

/** One measured weight. 0 g or more (V-16). */
export const MeasurementEntrySchema = z.strictObject({
  componentId: NonEmptyStringSchema,
  actualMg: weightMg(0),
});

/** Store `measurements`. Separate from the version it points at (DATA-04). */
export const MeasurementSchema = z.strictObject({
  id: IdSchema,
  formulaId: IdSchema,
  versionId: IdSchema,
  measuredOn: IsoDateSchema.optional(),
  entries: z.array(MeasurementEntrySchema).refine(
    (entries) => hasUniqueKeys(entries.map((entry) => entry.componentId)),
    { error: "Each component can be measured once per measurement." },
  ),
  notes: z.string().optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
