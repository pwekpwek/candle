/**
 * Photo preparation — contract (v0.2 BurnMatrix, lead).
 * Design: docs/v0.2-burnmatrix.md ("Photos").
 *
 * `@/lib/photos` must export `preparePhoto`, `PHOTO_INPUT_MAX_BYTES`, and the
 * types in this file. Browser-only (canvas, createImageBitmap); never called
 * during prerendering.
 *
 * Rules:
 *   - Every photo is decoded and re-encoded as JPEG, longest side at most
 *     MAX_PHOTO_DIMENSION (1600 px) and never enlarged, keeping its aspect
 *     ratio and its orientation as the camera recorded it (EXIF orientation
 *     applied, `imageOrientation: "from-image"`).
 *   - Re-encoding drops all metadata (EXIF, GPS location). That is intended.
 *   - Quality starts at 0.85 and steps down (0.75, 0.65, 0.55) until the
 *     bytes are at most MAX_PHOTO_BYTES; if 0.55 is still too big the
 *     longest side is reduced to 1200 px and the quality steps tried again.
 *     Still too big: refused as "too-big".
 *   - The result's bytes start with the JPEG marker FF D8 FF.
 */

/** Files above this size are refused before decoding (40 MiB). */
export const PHOTO_INPUT_MAX_BYTES = 40 * 1024 * 1024;

export type PreparedPhoto = {
  /** JPEG bytes, at most MAX_PHOTO_BYTES. */
  bytes: Uint8Array;
  width: number;
  height: number;
};

/**
 * not-image   the file's type is not image/*, or it could not be decoded
 * too-large   the input file is over PHOTO_INPUT_MAX_BYTES
 * too-big     the shrunk JPEG is still over MAX_PHOTO_BYTES
 * unsupported the browser cannot encode JPEG from a canvas
 */
export type PreparePhotoFailure = "not-image" | "too-large" | "too-big" | "unsupported";

export type PreparePhotoResult =
  | { ok: true; photo: PreparedPhoto }
  | { ok: false; reason: PreparePhotoFailure };

export type PreparePhoto = (file: Blob) => Promise<PreparePhotoResult>;
