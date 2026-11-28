import { z } from "zod";
import { LIMITS } from "@/lib/gramguard/contract";
import { MAX_MONEY_CENTAVOS } from "@/lib/types";
import {
  BasisSchema,
  IdSchema,
  MaterialTypeSchema,
  NameSchema,
  NullableTimestampSchema,
  TimestampSchema,
  intRange,
  weightMg,
} from "./primitives";

/** Material.wax (Data Model). Supplier maximum, 0% to LIMITS.maxFragranceBp. */
export const WaxDetailsSchema = z.strictObject({
  maxFragranceBp: intRange(0, LIMITS.maxFragranceBp).optional(),
  maxFragranceBasis: BasisSchema.optional(),
});

/** Material.wick. */
export const WickDetailsSchema = z.strictObject({
  size: z.string().optional(),
});

/** Material.vessel. Capacity is a positive number of millilitres; fill is whole milligrams. */
export const VesselDetailsSchema = z.strictObject({
  capacityMl: z.number().positive().optional(),
  defaultFillMg: weightMg(1).optional(),
});

/** MaterialSnapshot: copy of a material's details taken when a version is saved (DATA-03). */
export const MaterialSnapshotSchema = z.strictObject({
  type: MaterialTypeSchema,
  name: NameSchema,
  supplier: z.string().optional(),
  wax: WaxDetailsSchema.optional(),
  wick: WickDetailsSchema.optional(),
  vessel: VesselDetailsSchema.optional(),
});

const MATERIAL_FIELDS = {
  id: IdSchema,
  type: MaterialTypeSchema,
  name: NameSchema,
  supplier: z.string().optional(),
  notes: z.string().optional(),
  wax: WaxDetailsSchema.optional(),
  wick: WickDetailsSchema.optional(),
  vessel: VesselDetailsSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: NullableTimestampSchema,
};

/** Whole centavos, 0 to MAX_MONEY_CENTAVOS (v0.3 TrueCandle Cost). */
export const CentavosSchema = intRange(0, MAX_MONEY_CENTAVOS);

/**
 * A material as backup formats 1 to 6 hold it: no price. Older files are
 * checked against this shape, so a format 6 file whose material carries a
 * price is refused as damaged (docs/v0.3-cost.md).
 */
export const MaterialSchemaV1 = z.strictObject(MATERIAL_FIELDS);

/** Store `materials`. v0.3 TrueCandle Cost adds the optional default price (per kg or per piece by type). */
export const MaterialSchema = z.strictObject({
  ...MATERIAL_FIELDS,
  defaultPriceCentavos: CentavosSchema.optional(),
});
