import { z } from "zod";
import { LIMITS } from "@/lib/gramguard/contract";
import {
  MAX_BURN_CANDLES,
  MAX_BURN_MINUTES,
  MAX_BURN_MM,
  MAX_BURN_TEXT_LENGTH,
  MAX_BURNS_PER_CANDLE,
  MAX_CANDLE_LABEL_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_CAPTION_LENGTH,
  MAX_PHOTO_DIMENSION,
  MAX_SESSION_LABEL_LENGTH,
  MAX_WICK_NAME_LENGTH,
} from "@/lib/types";
import { IdSchema, IsoDateSchema, TimestampSchema, hasUniqueKeys, intRange, weightMg } from "./primitives";

function trimmedLength(max: number, what: string) {
  return z.string().refine(
    (value) => value.trim().length >= 1 && value.trim().length <= max,
    { error: `${what} must be 1 to ${max} characters after trimming.` },
  );
}

/** Optional free text: stored trimmed, never blank, at most MAX_BURN_TEXT_LENGTH. */
const BurnTextSchema = trimmedLength(MAX_BURN_TEXT_LENGTH, "Text");

const MmSchema = intRange(0, MAX_BURN_MM);

export const SootLevelSchema = z.enum(["none", "light", "moderate", "heavy"]);

/** One burn of one candle (v0.2, BurnMatrix). */
export const BurnRecordSchema = z
  .strictObject({
    id: IdSchema,
    durationMin: intRange(1, MAX_BURN_MINUTES),
    weightBeforeMg: weightMg(1).optional(),
    weightAfterMg: intRange(0, LIMITS.maxWeightMg).optional(),
    meltPoolDiameterMm: MmSchema.optional(),
    meltPoolDepthMm: MmSchema.optional(),
    flameHeightMm: MmSchema.optional(),
    soot: SootLevelSchema.optional(),
    notes: BurnTextSchema.optional(),
  })
  .refine(
    (burn) =>
      burn.weightBeforeMg === undefined ||
      burn.weightAfterMg === undefined ||
      burn.weightAfterMg <= burn.weightBeforeMg,
    { error: "Weight after must not be more than weight before.", path: ["weightAfterMg"] },
  );

export const BurnWickSchema = z.strictObject({
  materialId: IdSchema.nullable(),
  name: trimmedLength(MAX_WICK_NAME_LENGTH, "Wick name"),
});

export const BurnCandleSchema = z.strictObject({
  id: IdSchema,
  label: trimmedLength(MAX_CANDLE_LABEL_LENGTH, "Candle label"),
  wick: BurnWickSchema,
  burns: z
    .array(BurnRecordSchema)
    .max(MAX_BURNS_PER_CANDLE)
    .refine((burns) => hasUniqueKeys(burns.map((b) => b.id)), {
      error: "Burn ids must be unique within a candle.",
    }),
  coldThrow: BurnTextSchema.optional(),
  hotThrow: BurnTextSchema.optional(),
  notes: BurnTextSchema.optional(),
});

/** Store `burnSessions`. */
export const BurnSessionSchema = z.strictObject({
  id: IdSchema,
  batchId: IdSchema,
  testedOn: IsoDateSchema,
  label: trimmedLength(MAX_SESSION_LABEL_LENGTH, "Session label").optional(),
  milestoneId: IdSchema.nullable(),
  candles: z
    .array(BurnCandleSchema)
    .min(1)
    .max(MAX_BURN_CANDLES)
    .refine((candles) => hasUniqueKeys(candles.map((c) => c.id)), {
      error: "Candle ids must be unique within a session.",
    }),
  conclusion: BurnTextSchema.optional(),
  notes: BurnTextSchema.optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

/**
 * Fields every stored photo kind has, on the device and in a backup file,
 * without its id and owner link (v0.3 CandleFix shares them with investigation photos).
 */
export const PHOTO_BASE_FIELDS = {
  mimeType: z.literal("image/jpeg"),
  width: intRange(1, MAX_PHOTO_DIMENSION),
  height: intRange(1, MAX_PHOTO_DIMENSION),
  byteLength: intRange(1, MAX_PHOTO_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, { error: "sha256 must be 64 lowercase hex characters." }),
  caption: trimmedLength(MAX_PHOTO_CAPTION_LENGTH, "Caption").optional(),
  createdAt: TimestampSchema,
};

/** Fields a burn photo has both on the device and in a backup file. */
// Key order kept as before (id, sessionId, then the rest), so parsed records look the same.
const PHOTO_FIELDS = { id: IdSchema, sessionId: IdSchema, ...PHOTO_BASE_FIELDS };

/** Longest base64 text a photo can have (4 characters per 3 bytes, padded). */
export const MAX_PHOTO_BASE64_LENGTH = Math.ceil(MAX_PHOTO_BYTES / 3) * 4;

/** A photo's bytes in a backup file: standard base64 with padding. */
export const PhotoBase64Schema = z
  .string()
  .min(4)
  .max(MAX_PHOTO_BASE64_LENGTH)
  .regex(/^[A-Za-z0-9+/]*={0,2}$/, { error: "dataBase64 is not base64." });

/**
 * True for a Uint8Array from any realm (IndexedDB structured clone may hand
 * back one from another realm, so `instanceof` is not reliable).
 */
export function isUint8Array(value: unknown): value is Uint8Array {
  return ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === "[object Uint8Array]";
}

/** True for a JPEG: the bytes start with FF D8 FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Store `burnPhotos`: the record with its JPEG bytes. */
export const BurnPhotoSchema = z
  .strictObject({
    ...PHOTO_FIELDS,
    bytes: z.custom<Uint8Array>(isUint8Array, { error: "bytes must be a Uint8Array." }),
  })
  .refine((photo) => photo.bytes.length === photo.byteLength, {
    error: "byteLength does not match the bytes.",
    path: ["byteLength"],
  })
  .refine((photo) => isJpeg(photo.bytes), { error: "The photo is not a JPEG.", path: ["bytes"] });

/**
 * A photo in a backup file: `bytes` replaced by standard base64 with padding.
 * Decoding, length, JPEG marker and SHA-256 are checked by the restore step.
 */
export const BurnPhotoBackupSchema = z.strictObject({
  ...PHOTO_FIELDS,
  dataBase64: PhotoBase64Schema,
});
