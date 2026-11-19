import { BurnPhotoSchema, isJpeg, isUint8Array } from "@/lib/schemas";
import { MAX_PHOTO_BYTES, MAX_SESSION_PHOTOS } from "@/lib/types";
import type { BurnPhoto } from "@/lib/types";
import type { BurnPhotosRepo, CandleDatabase } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Lower-case hex SHA-256 of the bytes, via Web Crypto. Never call inside a Dexie transaction. */
export async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Oldest first, then id (stable). */
function photoOrder(a: BurnPhoto, b: BurnPhoto): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

export function createBurnPhotosRepo(db: CandleDatabase, now: () => string): BurnPhotosRepo {
  return {
    listBySession: (sessionId) =>
      guard(async () => (await db.burnPhotos.where("sessionId").equals(sessionId).toArray()).sort(photoOrder)),

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
        // Store a copy that owns exactly its bytes (a view on a larger buffer would store it all).
        const owned = bytes.slice();
        return db.transaction("rw", [db.burnPhotos, db.burnSessions, db.meta], async () => {
          const already = await db.burnPhotos.get(request.photoId);
          if (already) return { photo: already, created: false };
          if (!(await db.burnSessions.get(request.sessionId))) throw notFound("Burn session", request.sessionId);
          const count = await db.burnPhotos.where("sessionId").equals(request.sessionId).count();
          if (count >= MAX_SESSION_PHOTOS) {
            throw new DataError("invalid", `A burn session holds at most ${MAX_SESSION_PHOTOS} photos.`);
          }
          const caption = typeof request.caption === "string" ? request.caption.trim() : "";
          const photo = parseRecord(
            BurnPhotoSchema,
            {
              id: request.photoId,
              sessionId: request.sessionId,
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
          await db.burnPhotos.add(photo);
          await bumpChangeCounter(db);
          return { photo, created: true };
        });
      }),

    delete: (photoId) =>
      guard(() =>
        db.transaction("rw", [db.burnPhotos, db.meta], async () => {
          if (!(await db.burnPhotos.get(photoId))) throw notFound("Photo", photoId);
          await db.burnPhotos.delete(photoId);
          await bumpChangeCounter(db);
        }),
      ),

    usage: () =>
      guard(async () => {
        let count = 0;
        let bytes = 0;
        await db.burnPhotos.each((photo) => {
          count += 1;
          bytes += photo.byteLength;
        });
        return { count, bytes };
      }),
  };
}
