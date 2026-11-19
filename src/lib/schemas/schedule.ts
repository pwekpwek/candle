import { z } from "zod";
import {
  MAX_MILESTONE_LABEL_LENGTH,
  MAX_MILESTONES,
  MAX_OFFSET_DAYS,
  MAX_PRODUCTION_LABEL_LENGTH,
} from "@/lib/types";
import { IdSchema, IsoDateSchema, TimestampSchema, hasUniqueKeys, intRange } from "./primitives";

function trimmedLength(max: number, what: string) {
  return z.string().refine(
    (value) => value.trim().length >= 1 && value.trim().length <= max,
    { error: `${what} must be 1 to ${max} characters after trimming.` },
  );
}

export const CureMilestoneKindSchema = z.enum(["cureEnd", "burnTest", "check"]);

/** One milestone of a cure plan (v0.2, CurePilot). */
export const CureMilestoneSchema = z.strictObject({
  id: IdSchema,
  kind: CureMilestoneKindSchema,
  label: trimmedLength(MAX_MILESTONE_LABEL_LENGTH, "Milestone label").optional(),
  offsetDays: intRange(0, MAX_OFFSET_DAYS),
  doneOn: IsoDateSchema.nullable(),
});

/** Store `curePlans`. `id` is the batch's id. */
export const CurePlanSchema = z.strictObject({
  id: IdSchema,
  milestones: z
    .array(CureMilestoneSchema)
    .min(1)
    .max(MAX_MILESTONES)
    .refine((milestones) => hasUniqueKeys(milestones.map((m) => m.id)), {
      error: "Milestone ids must be unique within a plan.",
    })
    .refine((milestones) => milestones.filter((m) => m.kind === "cureEnd").length <= 1, {
      error: "A cure plan has at most one cure end.",
    }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

/** Store `productionPlans`. */
export const ProductionPlanSchema = z.strictObject({
  id: IdSchema,
  formulaId: IdSchema,
  versionId: IdSchema,
  plannedOn: IsoDateSchema,
  label: trimmedLength(MAX_PRODUCTION_LABEL_LENGTH, "Label").optional(),
  notes: z.string().optional(),
  batchId: IdSchema.nullable(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
