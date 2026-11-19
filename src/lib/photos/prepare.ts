import { MAX_PHOTO_BYTES, MAX_PHOTO_DIMENSION } from "@/lib/types";
import { PHOTO_INPUT_MAX_BYTES } from "./contract";
import type { PreparePhotoResult } from "./contract";

/** JPEG quality steps, tried in order at each size. */
export const QUALITY_LADDER = [0.85, 0.75, 0.65, 0.55] as const;

/** The smaller longest side tried when 0.55 at full size is still too big. */
export const REDUCED_DIMENSION = 1200;

/**
 * Size to draw at: longest side at most `maxSide`, aspect ratio kept, never
 * enlarged. Each side is at least 1 px.
 */
export function fitDimensions(
  width: number,
  height: number,
  maxSide: number = MAX_PHOTO_DIMENSION,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!(longest > maxSide)) return { width, height };
  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Each attempt in order: [longest side, quality]. */
export function encodeAttempts(): { maxSide: number; quality: number }[] {
  const attempts: { maxSide: number; quality: number }[] = [];
  for (const maxSide of [MAX_PHOTO_DIMENSION, REDUCED_DIMENSION]) {
    for (const quality of QUALITY_LADDER) attempts.push({ maxSide, quality });
  }
  return attempts;
}

/** True when the bytes start with the JPEG marker FF D8 FF. */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

type DrawTarget = {
  encode(quality: number): Promise<Blob | null>;
};

function makeTarget(bitmap: ImageBitmap, width: number, height: number): DrawTarget | null {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    return {
      encode: (quality) => canvas.convertToBlob({ type: "image/jpeg", quality }),
    };
  }
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  return {
    encode: (quality) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)),
  };
}

/** See contract.ts. Browser only. */
export async function preparePhoto(file: Blob): Promise<PreparePhotoResult> {
  if (!file.type.startsWith("image/")) return { ok: false, reason: "not-image" };
  if (file.size > PHOTO_INPUT_MAX_BYTES) return { ok: false, reason: "too-large" };

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { ok: false, reason: "not-image" };
  }

  try {
    let sawJpeg = false;
    let lastSide = 0;
    let target: DrawTarget | null = null;
    let size = { width: bitmap.width, height: bitmap.height };

    for (const { maxSide, quality } of encodeAttempts()) {
      if (maxSide !== lastSide) {
        lastSide = maxSide;
        size = fitDimensions(bitmap.width, bitmap.height, maxSide);
        target = makeTarget(bitmap, size.width, size.height);
        if (!target) return { ok: false, reason: "unsupported" };
      }
      let blob: Blob | null;
      try {
        blob = await target!.encode(quality);
      } catch {
        return { ok: false, reason: "unsupported" };
      }
      if (!blob || blob.type !== "image/jpeg") return { ok: false, reason: "unsupported" };
      sawJpeg = true;
      if (blob.size <= MAX_PHOTO_BYTES) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (!isJpeg(bytes)) return { ok: false, reason: "unsupported" };
        return { ok: true, photo: { bytes, width: size.width, height: size.height } };
      }
    }
    return sawJpeg ? { ok: false, reason: "too-big" } : { ok: false, reason: "unsupported" };
  } finally {
    bitmap.close?.();
  }
}
