import { z } from "zod";
import { LIMITS } from "@/lib/gramguard/contract";
import { MaterialSnapshotSchema } from "./material";
import {
  BasisSchema,
  IdSchema,
  NonEmptyStringSchema,
  PrecisionMgSchema,
  ScaleMethodSchema,
  TimestampSchema,
  VersionOriginSchema,
  hasUniqueKeys,
  intRange,
  weightMg,
} from "./primitives";

/** Sizing, a discriminated union on `mode` (Data Model). */
export const SizingSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("total"), amountMg: weightMg(1) }),
  z.strictObject({ mode: z.literal("wax"), amountMg: weightMg(1) }),
  z
    .strictObject({
      mode: z.literal("vessels"),
      count: intRange(1, LIMITS.maxVessels),
      fillMg: weightMg(1),
    })
    .refine((sizing) => sizing.count * sizing.fillMg <= LIMITS.maxWeightMg, {
      error: `Vessel count times fill weight must be at most ${LIMITS.maxWeightMg} mg (V-06).`,
    }),
]);

/** One blend row saved with a version. Parts are hundredths of a part (1 to 9999.99). */
export const ComponentSchema = z.strictObject({
  componentId: NonEmptyStringSchema,
  materialId: IdSchema,
  snapshot: MaterialSnapshotSchema,
  partsX100: intRange(1, LIMITS.maxPartsX100),
});

/** VersionInputs.wick and VersionInputs.vessel. */
export const LinkedMaterialSchema = z.strictObject({
  materialId: IdSchema,
  snapshot: MaterialSnapshotSchema,
});

/** The typed inputs of a version (DATA-02, DATA-03). */
export const VersionInputsSchema = z
  .strictObject({
    sizing: SizingSchema,
    fragranceBp: intRange(0, LIMITS.maxFragranceBp),
    basis: BasisSchema,
    precisionMg: PrecisionMgSchema,
    waxes: z.array(ComponentSchema).min(1).max(LIMITS.maxWaxes),
    oils: z.array(ComponentSchema).max(LIMITS.maxOils),
    wick: LinkedMaterialSchema.nullable(),
    vessel: LinkedMaterialSchema.nullable(),
    notes: z.string().optional(),
  })
  .superRefine((inputs, ctx) => {
    if (!hasUniqueKeys([...inputs.waxes, ...inputs.oils].map((row) => row.componentId))) {
      ctx.addIssue({
        code: "custom",
        message: "Component ids must be unique within a version.",
        path: ["oils"],
      });
    }
    if (inputs.fragranceBp === 0 && inputs.oils.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: "An unscented version has no oils (CALC-17).",
        path: ["oils"],
      });
    }
    if (inputs.fragranceBp > 0 && inputs.oils.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "A scented version needs at least one oil (V-11).",
        path: ["oils"],
      });
    }
  });

/**
 * Planned weights as shown when the version was saved. A component's target is
 * never zero, because a zero component blocks saving (V-15). The fragrance
 * total is zero when the formula is unscented.
 */
export const VersionTargetsSchema = z
  .strictObject({
    totalMg: weightMg(1),
    waxTotalMg: weightMg(1),
    fragranceTotalMg: weightMg(0),
    components: z.array(
      z.strictObject({
        componentId: NonEmptyStringSchema,
        targetMg: weightMg(1),
      }),
    ),
  })
  .superRefine((targets, ctx) => {
    if (targets.totalMg !== targets.waxTotalMg + targets.fragranceTotalMg) {
      ctx.addIssue({
        code: "custom",
        message: "Total must equal wax plus fragrance (CALC-09).",
        path: ["totalMg"],
      });
    }
    if (!hasUniqueKeys(targets.components.map((row) => row.componentId))) {
      ctx.addIssue({
        code: "custom",
        message: "Component ids must be unique within a version.",
        path: ["components"],
      });
    }
  });

/** VersionScale. factorX10000 is for display only (DATA-10). */
export const VersionScaleSchema = z.strictObject({
  method: ScaleMethodSchema,
  factorX10000: z.int().min(0),
});

/** Store `formulaVersions`. Write-once (DATA-02, DATA-08). */
export const FormulaVersionSchema = z.strictObject({
  id: IdSchema,
  formulaId: IdSchema,
  number: z.int().min(1),
  originalNumber: z.int().min(1).optional(),
  origin: VersionOriginSchema,
  parentVersionId: IdSchema.nullable(),
  scale: VersionScaleSchema.nullable(),
  changeNote: z.string().optional(),
  createdAt: TimestampSchema,
  inputs: VersionInputsSchema,
  targets: VersionTargetsSchema,
  calcVersion: z.int().min(1),
});
