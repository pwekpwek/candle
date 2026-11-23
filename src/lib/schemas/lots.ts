import { z } from "zod";
import { MAX_LOT_CODE_LENGTH, MAX_SUPPLIER_NAME_LENGTH, MAX_TRACE_NOTES_LENGTH } from "@/lib/types";
import {
  IdSchema,
  IsoDateSchema,
  NonEmptyStringSchema,
  NullableTimestampSchema,
  TimestampSchema,
} from "./primitives";

function trimmedText(max: number, what: string) {
  return z.string().refine(
    (value) => value.trim().length >= 1 && value.trim().length <= max,
    { error: `${what} must be 1 to ${max} characters after trimming.` },
  );
}

/** Optional notes on a supplier or lot (v0.3). */
const TraceNotesSchema = z.string().max(MAX_TRACE_NOTES_LENGTH);

/** Store `suppliers` (v0.3). */
export const SupplierSchema = z.strictObject({
  id: IdSchema,
  name: trimmedText(MAX_SUPPLIER_NAME_LENGTH, "Supplier name"),
  notes: TraceNotesSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: NullableTimestampSchema,
});

/** Store `materialLots` (v0.3). */
export const MaterialLotSchema = z.strictObject({
  id: IdSchema,
  materialId: IdSchema,
  supplierId: IdSchema.nullable(),
  code: trimmedText(MAX_LOT_CODE_LENGTH, "Lot code"),
  receivedOn: IsoDateSchema.optional(),
  notes: TraceNotesSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: NullableTimestampSchema,
});

export const BatchLotPartSchema = z.enum(["row", "wick", "vessel"]);

/** One lot recorded on a batch (v0.3): a link plus a snapshot of the code and supplier. */
export const BatchLotSchema = z
  .strictObject({
    part: BatchLotPartSchema,
    componentId: NonEmptyStringSchema.optional(),
    lotId: IdSchema,
    lotCode: trimmedText(MAX_LOT_CODE_LENGTH, "Lot code"),
    supplierId: IdSchema.nullable(),
    supplierName: trimmedText(MAX_SUPPLIER_NAME_LENGTH, "Supplier name").optional(),
  })
  .refine((link) => (link.part === "row") === (link.componentId !== undefined), {
    error: "A lot on a wax or oil row names its component; a wick or vessel lot does not.",
  })
  .refine((link) => link.supplierId !== null || link.supplierName === undefined, {
    error: "A lot without a supplier has no supplier name.",
  });

/** The key that makes a batch's lot links unique: the row's component id, or the part. */
export function batchLotSlot(link: { part: string; componentId?: string }): string {
  return link.part === "row" ? `row:${link.componentId ?? ""}` : link.part;
}
