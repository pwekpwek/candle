import { z } from "zod";
import { LIMITS } from "@/lib/gramguard/contract";
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

/** Store `materials`. */
export const MaterialSchema = z.strictObject({
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
});
