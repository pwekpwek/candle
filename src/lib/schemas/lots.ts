import { z } from "zod";
import {
  MAX_LOT_CODE_LENGTH,
  MAX_LOT_PIECES,
  MAX_MONEY_CENTAVOS,
  MAX_SUPPLIER_NAME_LENGTH,
  MAX_TRACE_NOTES_LENGTH,
} from "@/lib/types";
import { LIMITS } from "@/lib/gramguard/contract";
import {
  IdSchema,
  IsoDateSchema,
  NonEmptyStringSchema,
  NullableTimestampSchema,
  TimestampSchema,
  intRange,
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

const LOT_FIELDS = {
  id: IdSchema,
  materialId: IdSchema,
  supplierId: IdSchema.nullable(),
  code: trimmedText(MAX_LOT_CODE_LENGTH, "Lot code"),
  receivedOn: IsoDateSchema.optional(),
  notes: TraceNotesSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  archivedAt: NullableTimestampSchema,
};

/**
 * A lot's purchase (v0.3 TrueCandle Cost). The quantity is milligrams or pieces
 * by the material's type; this schema allows the wider of the two ranges and
 * the data layer checks the one that applies.
 */
export const LotPurchaseSchema = z.strictObject({
  paidCentavos: intRange(0, MAX_MONEY_CENTAVOS),
  quantity: intRange(1, Math.max(LIMITS.maxWeightMg, MAX_LOT_PIECES)),
});

/** A lot as backup formats 5 and 6 hold it: no purchase. */
export const MaterialLotSchemaV5 = z.strictObject(LOT_FIELDS);

/** Store `materialLots` (v0.3; purchase added in v0.3 TrueCandle Cost). */
export const MaterialLotSchema = z.strictObject({
  ...LOT_FIELDS,
  purchase: LotPurchaseSchema.optional(),
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
