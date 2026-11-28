import { InvestigationPhotoSchema, isJpeg, isUint8Array } from "@/lib/schemas";
import { MAX_INVESTIGATION_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/types";
import type { InvestigationPhoto } from "@/lib/types";
import { sha256OfBytes } from "./burn-photos";
import type { CandleDatabase, InvestigationPhotosRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Oldest first, then id (stable). */
function photoOrder(a: InvestigationPhoto, b: InvestigationPhoto): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/**
 * v0.3 CandleFix: photos of an investigation. The same pipeline and rules as
 * burn photos (docs/v0.2-burnmatrix.md "Photos"): JPEG only, at most 1 MiB,
 * hashed before the transaction, stored as an owned copy, write-once.
 */
export function createInvestigationPhotosRepo(db: CandleDatabase, now: () => string): InvestigationPhotosRepo {
  return {
    listByInvestigation: (investigationId) =>
      guard(async () =>
        (await db.investigationPhotos.where("investigationId").equals(investigationId).toArray()).sort(photoOrder),
      ),

    add: (request) =>
      guard(async () => {
        const bytes = request.bytes;
        if (!isUint8Array(bytes) || bytes.length === 0) {
          throw new DataError("invalid", "The photo has no bytes.");
        }
        if (bytes.length > MAX_PHOTO_BYTES) throw new DataError("invalid", "The photo is too big.");
        if (!isJpeg(bytes)) throw new DataError("invalid", "The photo is not a JPEG.");
        // Web Crypto is not a Dexie promise: hash before the transaction opens.
        const sha256 = await sha256OfBytes(bytes);
        const owned = bytes.slice();
        return db.transaction("rw", [db.investigationPhotos, db.investigations, db.meta], async () => {
          const already = await db.investigationPhotos.get(request.photoId);
          if (already) return { photo: already, created: false };
          if (!(await db.investigations.get(request.investigationId))) {
            throw notFound("Investigation", request.investigationId);
          }
          const count = await db.investigationPhotos.where("investigationId").equals(request.investigationId).count();
          if (count >= MAX_INVESTIGATION_PHOTOS) {
            throw new DataError("invalid", `An investigation holds at most ${MAX_INVESTIGATION_PHOTOS} photos.`);
          }
          const caption = typeof request.caption === "string" ? request.caption.trim() : "";
          const photo = parseRecord(
            InvestigationPhotoSchema,
            {
              id: request.photoId,
              investigationId: request.investigationId,
              mimeType: "image/jpeg",
              width: request.width,
              height: request.height,
              byteLength: owned.length,
              sha256,
              ...(caption !== "" ? { caption } : {}),
              createdAt: now(),
              bytes: owned,
            },
            "photo",
          );
          await db.investigationPhotos.add(photo);
          await bumpChangeCounter(db);
          return { photo, created: true };
        });
      }),

    delete: (photoId) =>
      guard(() =>
        db.transaction("rw", [db.investigationPhotos, db.meta], async () => {
          if (!(await db.investigationPhotos.get(photoId))) throw notFound("Photo", photoId);
          await db.investigationPhotos.delete(photoId);
          await bumpChangeCounter(db);
        }),
      ),

    usage: () =>
      guard(async () => {
        let count = 0;
        let bytes = 0;
        await db.investigationPhotos.each((photo) => {
          count += 1;
          bytes += photo.byteLength;
        });
        return { count, bytes };
      }),
  };
}
