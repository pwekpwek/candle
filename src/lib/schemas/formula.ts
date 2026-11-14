import { z } from "zod";
import { IdSchema, NameSchema, NullableTimestampSchema, TimestampSchema } from "./primitives";

/** Store `formulas`. The stable container; a formula always has at least version 1 (DATA-07). */
export const FormulaSchema = z.strictObject({
  id: IdSchema,
  name: NameSchema,
  notes: z.string().optional(),
  latestVersionNumber: z.int().min(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: NullableTimestampSchema,
});
