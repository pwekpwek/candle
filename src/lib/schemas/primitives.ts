import { z } from "zod";
import { LIMITS } from "@/lib/gramguard/contract";

/** A UUID made on the device with crypto.randomUUID() (DATA-01). */
export const IdSchema = z.uuid();

/** ISO 8601 timestamp in UTC, e.g. "2026-11-14T06:05:12.000Z" (DATA-06). */
export const TimestampSchema = z.iso.datetime();

/** `archivedAt`: a timestamp, or null while not archived. */
export const NullableTimestampSchema = TimestampSchema.nullable();

/** Calendar date, YYYY-MM-DD (Measurement.measuredOn). */
export const IsoDateSchema = z.iso.date();

/** 1 to LIMITS.maxNameLength characters after trimming (V-02). Stored as typed. */
export const NameSchema = z.string().refine(
  (value) => value.trim().length >= 1 && value.trim().length <= LIMITS.maxNameLength,
  { error: `Name must be 1 to ${LIMITS.maxNameLength} characters after trimming.` },
);

/** A non-empty identifier that is not a UUID (blend row ids, component ids). */
export const NonEmptyStringSchema = z.string().min(1);

/** Whole number from min to max, inclusive. */
export function intRange(min: number, max: number) {
  return z.int().min(min).max(max);
}

/** Whole milligrams from min up to LIMITS.maxWeightMg (DATA-05). */
export function weightMg(min: 0 | 1) {
  return intRange(min, LIMITS.maxWeightMg);
}

/** True when no two items share a key. */
export function hasUniqueKeys(keys: readonly string[]): boolean {
  return new Set(keys).size === keys.length;
}

export const BasisSchema = z.enum(["wax", "total"]);

/** 1 g, 0.1 g or 0.01 g (DATA-05). */
export const PrecisionMgSchema = z.union([z.literal(1000), z.literal(100), z.literal(10)]);

export const MaterialTypeSchema = z.enum(["wax", "fragranceOil", "wick", "vessel"]);

export const VersionOriginSchema = z.enum(["initial", "revision", "scaled"]);

export const ScaleMethodSchema = z.enum(["vesselCount", "amount", "multiplier"]);
