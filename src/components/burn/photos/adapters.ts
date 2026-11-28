import { getDataLayer } from "@/lib/db";
import { MESSAGES } from "@/lib/messages";
import { MAX_INVESTIGATION_PHOTOS, MAX_SESSION_PHOTOS } from "@/lib/types";
import type { BurnPhoto } from "@/lib/types";

/** What the gallery needs from a stored photo (burn photos and investigation photos both fit). */
export type PhotoLike = Pick<BurnPhoto, "id" | "bytes" | "mimeType" | "width" | "height" | "caption">;

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : T[K] };

/** The gallery's texts. `MESSAGES.burnPhotos` and `MESSAGES.candleFixPhotos` have this shape. */
export type PhotoTexts = Widen<typeof MESSAGES.burnPhotos>;

/** Where a gallery reads and writes its photos, how many it holds and what it says. */
export type PhotoAdapter = {
  /** Most photos the owner can hold. */
  max: number;
  texts: PhotoTexts;
  /** Id of the section heading, so two galleries never share one. */
  headingId: string;
  list(ownerId: string): Promise<PhotoLike[]>;
  /** Adds one prepared photo (the adapter picks the photo id). Throws a DataError like the repos. */
  add(request: { ownerId: string; bytes: Uint8Array; width: number; height: number }): Promise<void>;
  remove(photoId: string): Promise<void>;
};

/** Burn test photos: the original behaviour and text. */
export const burnPhotoAdapter: PhotoAdapter = {
  max: MAX_SESSION_PHOTOS,
  texts: MESSAGES.burnPhotos,
  headingId: "burn-photos-heading",
  list: (ownerId) => getDataLayer().burnPhotos.listBySession(ownerId),
  async add({ ownerId, bytes, width, height }) {
    await getDataLayer().burnPhotos.add({
      photoId: crypto.randomUUID(),
      sessionId: ownerId,
      bytes,
      width,
      height,
    });
  },
  remove: (photoId) => getDataLayer().burnPhotos.delete(photoId),
};

/** Investigation photos (v0.3 CandleFix). */
export const investigationPhotoAdapter: PhotoAdapter = {
  max: MAX_INVESTIGATION_PHOTOS,
  texts: MESSAGES.candleFixPhotos,
  headingId: "investigation-photos-heading",
  list: (ownerId) => getDataLayer().investigationPhotos.listByInvestigation(ownerId),
  async add({ ownerId, bytes, width, height }) {
    await getDataLayer().investigationPhotos.add({
      photoId: crypto.randomUUID(),
      investigationId: ownerId,
      bytes,
      width,
      height,
    });
  },
  remove: (photoId) => getDataLayer().investigationPhotos.delete(photoId),
};
