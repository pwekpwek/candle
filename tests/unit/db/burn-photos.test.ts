import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import { toDataError } from "@/lib/db/errors";
import { MAX_PHOTO_BYTES, MAX_SESSION_PHOTOS } from "@/lib/types";
import { counterOf, id, makeLibrary, newFormulaRequest, setup, we5Input } from "./harness";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

/** A small generated "JPEG": the FF D8 FF marker and some bytes. Not a real photo. */
function fakeJpeg(size = 64, seed = 1): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * 31 + seed) % 256;
  return bytes;
}

async function withSession() {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  const { version } = await ctx.layer.versions.save(newFormulaRequest(we5Input(lib)));
  const { batch } = await ctx.layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-10", entries: [] });
  const { session } = await ctx.layer.burnSessions.create({
    sessionId: id(),
    batchId: batch.id,
    testedOn: "2026-11-18",
    milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-10" }, burns: [] }],
  });
  return { ...ctx, session };
}

describe("BurnMatrix: burn photos", () => {
  it("adds a photo with its SHA-256 and size, keeps an owned copy of the bytes, bumps the counter once", async () => {
    const { layer, session } = await withSession();
    const buffer = new Uint8Array(200);
    const view = buffer.subarray(10, 74);
    view.set(fakeJpeg(64));
    const before = await counterOf(layer);
    const { photo, created } = await layer.burnPhotos.add({
      photoId: id(),
      sessionId: session.id,
      bytes: view,
      width: 1600,
      height: 1200,
      caption: "  Hour 2  ",
    });
    expect(created).toBe(true);
    expect(photo.mimeType).toBe("image/jpeg");
    expect(photo.byteLength).toBe(64);
    expect(photo.caption).toBe("Hour 2");
    expect(photo.sha256).toBe(createHash("sha256").update(view).digest("hex"));
    expect(photo.bytes.buffer.byteLength).toBe(64);
    expect(await counterOf(layer)).toBe(before + 1);
    const [stored] = await layer.burnPhotos.listBySession(session.id);
    expect(Array.from(stored!.bytes)).toEqual(Array.from(view));
  });

  it("is idempotent on the photo id", async () => {
    const { layer, session } = await withSession();
    const photoId = id();
    const first = await layer.burnPhotos.add({ photoId, sessionId: session.id, bytes: fakeJpeg(), width: 10, height: 10 });
    const before = await counterOf(layer);
    const again = await layer.burnPhotos.add({ photoId, sessionId: session.id, bytes: fakeJpeg(80, 2), width: 10, height: 10 });
    expect(again.created).toBe(false);
    expect(again.photo.sha256).toBe(first.photo.sha256);
    expect(await counterOf(layer)).toBe(before);
  });

  it("refuses a non-JPEG, empty or oversized photo, a bad size, and a missing session", async () => {
    const { layer, db, session } = await withSession();
    const add = (bytes: Uint8Array, over: { sessionId?: string; width?: number } = {}) =>
      layer.burnPhotos.add({ photoId: id(), sessionId: over.sessionId ?? session.id, bytes, width: over.width ?? 10, height: 10 });
    expect(await code(add(new Uint8Array([0x89, 0x50, 0x4e, 0x47])))).toBe("invalid");
    expect(await code(add(new Uint8Array()))).toBe("invalid");
    expect(await code(add(fakeJpeg(MAX_PHOTO_BYTES + 1)))).toBe("invalid");
    expect(await code(add(fakeJpeg(), { width: 1601 }))).toBe("invalid");
    expect(await code(add(fakeJpeg(), { sessionId: id() }))).toBe("not-found");
    expect(await db.burnPhotos.count()).toBe(0);
    expect((await add(fakeJpeg(MAX_PHOTO_BYTES))).photo.byteLength).toBe(MAX_PHOTO_BYTES);
  });

  it("holds at most 12 photos per session", async () => {
    const { layer, session } = await withSession();
    for (let i = 0; i < MAX_SESSION_PHOTOS; i++) {
      await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(32, i), width: 10, height: 10 });
    }
    expect(await code(layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(), width: 10, height: 10 }))).toBe("invalid");
    expect(await layer.burnPhotos.listBySession(session.id)).toHaveLength(MAX_SESSION_PHOTOS);
  });

  it("lists oldest first, deletes one photo, and reports usage", async () => {
    const { layer, session } = await withSession();
    const a = (await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(40), width: 10, height: 10 })).photo;
    const b = (await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(60), width: 10, height: 10 })).photo;
    expect((await layer.burnPhotos.listBySession(session.id)).map((p) => p.id)).toEqual([a.id, b.id]);
    expect(await layer.burnPhotos.usage()).toEqual({ count: 2, bytes: 100 });
    const before = await counterOf(layer);
    await layer.burnPhotos.delete(a.id);
    expect(await counterOf(layer)).toBe(before + 1);
    expect(await code(layer.burnPhotos.delete(a.id))).toBe("not-found");
    expect(await layer.burnPhotos.usage()).toEqual({ count: 1, bytes: 60 });
  });
});

describe("storage full", () => {
  it("maps a QuotaExceededError, also when Dexie wraps it, to storage-full", () => {
    const raw = new DOMException("The quota has been exceeded.", "QuotaExceededError");
    expect(toDataError(raw).code).toBe("storage-full");
    const wrapped = new Dexie.AbortError("Transaction aborted", raw);
    expect(toDataError(wrapped).code).toBe("storage-full");
    expect(toDataError(new Dexie.QuotaExceededError("full")).code).toBe("storage-full");
    expect(toDataError(new Error("other")).code).toBe("storage");
  });

  it("a photo add the browser refuses for space reports storage-full and writes nothing", async () => {
    const { layer, db, session } = await withSession();
    const original = db.burnPhotos.add.bind(db.burnPhotos);
    db.burnPhotos.add = (() => Promise.reject(new DOMException("full", "QuotaExceededError"))) as unknown as typeof db.burnPhotos.add;
    const before = await counterOf(layer);
    expect(await code(layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(), width: 10, height: 10 }))).toBe("storage-full");
    db.burnPhotos.add = original;
    expect(await db.burnPhotos.count()).toBe(0);
    expect(await counterOf(layer)).toBe(before);
  });
});
