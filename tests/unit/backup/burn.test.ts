import "fake-indexeddb/auto";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyRestore,
  canonicalJson,
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  readDeviceData,
  sha256Hex,
} from "@/lib/backup";
import type { CheckFailure } from "@/lib/backup";
import { base64ToBytes, bytesToBase64 } from "@/lib/backup/photos";
import { BackupEnvelopeSchema, isUint8Array } from "@/lib/schemas";
import type { BackupEnvelope, BurnPhotoBackup } from "@/lib/types";
import { counterOf, id } from "../db/harness";
import { blankDevice, exportChecked, makeSource, newDevice, planFor } from "./apply-harness";

/**
 * Backup format 4 (v0.2 BurnMatrix): burn sessions and photos are exported,
 * checked, planned and restored like the other stores; photo bytes travel as
 * base64 and are verified against their own SHA-256. See
 * docs/v0.2-burnmatrix.md, "Backup format 4".
 */

const NOW = "2026-11-19T09:00:00.000Z";

/** A generated "JPEG" (FF D8 FF marker plus patterned bytes). Not a real photo. */
function fakeJpeg(size: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * 7 + seed * 13) % 256;
  return bytes;
}

/** A source device with a batch, a cure plan, a linked burn session holding two photos, and a second session. */
async function sourceWithBurns() {
  const src = await makeSource();
  const { layer } = src.device;
  const { batch } = await layer.batches.create({
    batchId: id(),
    versionId: src.first.version.id,
    producedOn: "2026-11-10",
    entries: [],
  });
  const plan = await layer.curePlans.save(batch.id, [
    { kind: "cureEnd", offsetDays: 14 },
    { kind: "burnTest", offsetDays: 3, label: "First burn" },
  ]);
  const { session } = await layer.burnSessions.create({
    sessionId: id(),
    batchId: batch.id,
    testedOn: "2026-11-13",
    label: "Wick trial",
    milestoneId: plan.milestones[1]!.id,
    candles: [
      {
        label: "A",
        wick: { materialId: src.device.lib.wickId },
        burns: [{ durationMin: 240, weightBeforeMg: 250_000, weightAfterMg: 238_000, soot: "light" }],
        hotThrow: "Fills the room",
      },
      { label: "B", wick: { text: "CD-12" }, burns: [] },
    ],
    conclusion: "My own words.",
  });
  const photos = [];
  for (let i = 0; i < 2; i++) {
    photos.push(
      (await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(3000 + i, i), width: 1600, height: 1200 }))
        .photo,
    );
  }
  const { session: second } = await layer.burnSessions.create({
    sessionId: id(),
    batchId: batch.id,
    testedOn: "2026-11-15",
    milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] }],
  });
  return { ...src, batch, session, second, photos };
}

type Target = { db: Parameters<typeof readDeviceData>[0] };

async function check(text: string, target: Target) {
  return checkBackupText(text, Buffer.byteLength(text, "utf8"), deviceIdsOf(await readDeviceData(target.db)));
}

async function failureOf(text: string, target: Target): Promise<CheckFailure> {
  const result = await check(text, target);
  if (result.ok) throw new Error("expected a failure");
  return result.failure;
}

/** Re-serialises an edited envelope with counts and checksum over the stores it holds. */
async function rebuild(env: BackupEnvelope): Promise<string> {
  const data = env.data as unknown as Record<string, unknown[]>;
  const counts: Record<string, number> = {};
  for (const [store, rows] of Object.entries(data)) counts[store] = rows.length;
  env.counts = counts as BackupEnvelope["counts"];
  env.checksum = { algorithm: "SHA-256", value: await sha256Hex(canonicalJson(data)) };
  return JSON.stringify(env);
}

describe("photo base64", () => {
  it("round-trips bytes of every length and refuses non-canonical text", () => {
    for (const size of [1, 2, 3, 4, 5, 100_001]) {
      const bytes = fakeJpeg(Math.max(size, 4), size).subarray(0, size);
      const text = bytesToBase64(bytes);
      expect(text).toBe(Buffer.from(bytes).toString("base64"));
      expect(Array.from(base64ToBytes(text)!)).toEqual(Array.from(bytes));
    }
    expect(base64ToBytes("abc")).toBeNull();
    expect(base64ToBytes("ab=c")).toBeNull();
    expect(base64ToBytes("QR==")).toBeNull(); // stray bits after the padding position
    expect(base64ToBytes("QQ==")).toEqual(new Uint8Array([0x41]));
  });
});

describe("backup format 4 export", () => {
  it("exports sessions and photos (bytes as base64 with their SHA-256), format 5, schema 5, a checksum over all eleven stores, and its size", async () => {
    const { device, session, second, photos } = await sourceWithBurns();
    const exported = await exportBackup(device.db, { now: () => NOW });
    const { envelope, json } = exported;
    expect(envelope.formatVersion).toBe(5);
    expect(envelope.schemaVersion).toBe(5);
    expect(envelope.counts).toMatchObject({ burnSessions: 2, burnPhotos: 2 });
    expect(envelope.data.burnSessions.map((s) => s.id)).toEqual([session.id, second.id].sort());
    const filePhoto = envelope.data.burnPhotos.find((p) => p.id === photos[0]!.id)!;
    expect(filePhoto).not.toHaveProperty("bytes");
    expect(filePhoto.dataBase64).toBe(Buffer.from(photos[0]!.bytes).toString("base64"));
    expect(filePhoto.sha256).toBe(createHash("sha256").update(photos[0]!.bytes).digest("hex"));
    expect(envelope.checksum.value).toBe(await sha256Hex(canonicalJson(envelope.data)));
    expect(BackupEnvelopeSchema.safeParse(JSON.parse(json)).success).toBe(true);
    expect(exported.sizeBytes).toBe(Buffer.byteLength(json, "utf8"));
  });
});

describe("format 4 restore", () => {
  it("round-trips into a fresh device: sessions equal, photo bytes identical, the milestone link and done date kept", async () => {
    const src = await sourceWithBurns();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    const plan = await planFor(target.db, envelope);
    expect(plan.added).toMatchObject({ burnSessions: 2, burnPhotos: 2 });
    const result = await applyRestore(target.db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await readDeviceData(target.db)).toEqual(await readDeviceData(src.device.db));
    const photos = await target.layer.burnPhotos.listBySession(src.session.id);
    expect(photos.map((p) => Array.from(p.bytes))).toEqual(src.photos.map((p) => Array.from(p.bytes)));
    expect(isUint8Array(photos[0]!.bytes)).toBe(true);
    const detail = (await target.layer.burnSessions.get(src.session.id))!;
    expect(detail.milestone?.doneOn).toBe("2026-11-13");
    expect(detail.photoCount).toBe(2);
  });

  it("restoring the same file again changes nothing", async () => {
    const src = await sourceWithBurns();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    await applyRestore(target.db, await planFor(target.db, envelope), { now: () => NOW });
    const again = await planFor(target.db, (await exportChecked(src.device.db, target.db)).envelope);
    expect(again.tally.burnSessions).toEqual({ new: 0, identical: 2, conflict: 0 });
    expect(again.tally.burnPhotos).toEqual({ new: 0, identical: 2, conflict: 0 });
    expect(again.puts.burnSessions).toEqual([]);
    expect(again.puts.burnPhotos).toEqual([]);
  });

  it("a session edited on both devices is a conflict that follows keep or replace", async () => {
    const src = await sourceWithBurns();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    await applyRestore(target.db, await planFor(target.db, envelope), { now: () => NOW });
    const edit = { testedOn: "2026-11-15", milestoneId: null, candles: [{ label: "A", wick: { text: "CD-10" }, burns: [] }] };
    await target.layer.burnSessions.update(src.second.id, { ...edit, conclusion: "Device copy" });
    const file = (await exportChecked(src.device.db, target.db)).envelope;

    const keep = await planFor(target.db, file, "merge", "keepDevice");
    expect(keep.tally.burnSessions.conflict).toBe(1);
    expect(keep.kept.burnSessions).toBe(1);
    expect(keep.puts.burnSessions).toEqual([]);

    const replace = await planFor(target.db, file, "merge", "useBackup");
    expect(replace.replaced.burnSessions).toBe(1);
    await applyRestore(target.db, replace, { now: () => NOW });
    expect((await target.layer.burnSessions.get(src.second.id))!.session.conclusion).toBeUndefined();
  });

  it("replace everything clears all nine stores; the safety backup holds sessions and photos", async () => {
    const src = await sourceWithBurns();
    const target = await sourceWithBurns();
    const safety = await exportBackup(target.device.db, { now: () => NOW });
    expect(safety.envelope.data.burnPhotos).toHaveLength(2);
    const { envelope } = await exportChecked(src.device.db, target.device.db);
    const plan = await planFor(target.device.db, envelope, "replace");
    const result = await applyRestore(target.device.db, plan, { safetyBackup: safety, now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await readDeviceData(target.device.db)).toEqual(await readDeviceData(src.device.db));
    expect(await target.device.db.burnPhotos.count()).toBe(2);
  });

  it("a failure after burnPhotos is written rolls everything back; the same plan then applies", async () => {
    const src = await sourceWithBurns();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    const plan = await planFor(target.db, envelope);
    const before = await counterOf(target.layer);
    const failed = await applyRestore(target.db, plan, {
      afterStoreWritten: (store) => {
        if (store === "burnPhotos") throw new Error("injected");
      },
    });
    expect(failed).toMatchObject({ ok: false, reason: "storage" });
    expect(await target.db.burnSessions.count()).toBe(0);
    expect(await target.db.burnPhotos.count()).toBe(0);
    expect(await target.db.formulas.count()).toBe(0);
    expect(await counterOf(target.layer)).toBe(before);
    expect((await applyRestore(target.db, plan, { now: () => NOW })).ok).toBe(true);
  });

  it("a photo added on the device after the preview makes the plan stale and nothing is written", async () => {
    const src = await sourceWithBurns();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    await applyRestore(target.db, await planFor(target.db, envelope), { now: () => NOW });
    // Plan the same file with a photo deleted on the device, then add it back with different bytes.
    await target.layer.burnPhotos.delete(src.photos[0]!.id);
    const plan = await planFor(target.db, envelope);
    expect(plan.added.burnPhotos).toBe(1);
    await target.layer.burnPhotos.add({ photoId: src.photos[0]!.id, sessionId: src.session.id, bytes: fakeJpeg(50, 9), width: 10, height: 10 });
    const result = await applyRestore(target.db, plan, { now: () => NOW });
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect((await target.layer.burnPhotos.listBySession(src.session.id)).find((p) => p.id === src.photos[0]!.id)!.byteLength).toBe(50);
  });
});

describe("format 4 checks", () => {
  async function v4With(edit: (env: BackupEnvelope) => void) {
    const src = await sourceWithBurns();
    const { envelope } = await exportBackup(src.device.db, { now: () => NOW });
    edit(envelope);
    return { ...src, text: await rebuild(envelope) };
  }
  const nowhere = "99999999-0000-4000-8000-000000000001";
  const firstPhoto = (env: BackupEnvelope): BurnPhotoBackup => env.data.burnPhotos[0]!;

  it("refuses a photo whose bytes do not match its checksum, size or type, or whose base64 is broken, naming it", async () => {
    const cases: [string, (p: BurnPhotoBackup) => void][] = [
      ["photo data does not match its checksum", (p) => {
        const bytes = base64ToBytes(p.dataBase64)!;
        bytes[10] = (bytes[10]! + 1) % 256;
        p.dataBase64 = bytesToBase64(bytes);
      }],
      ["photo data does not match its size", (p) => {
        p.byteLength += 1;
      }],
      ["photo data is not a JPEG", (p) => {
        const bytes = base64ToBytes(p.dataBase64)!;
        bytes[0] = 0x89;
        p.dataBase64 = bytesToBase64(bytes);
      }],
      ["photo data is not valid base64", (p) => {
        p.dataBase64 = `${p.dataBase64.slice(0, -4)}QR==`;
      }],
    ];
    for (const [problem, edit] of cases) {
      const { text } = await v4With((env) => edit(firstPhoto(env)));
      const target = await newDevice();
      const failure = await failureOf(text, target);
      expect(failure).toMatchObject({ code: "invalid", count: 1, firstProblem: problem });
      expect((failure as { firstLabel: string }).firstLabel).toMatch(/^photo [0-9a-f]{8}…$/);
    }
  });

  it("an edited photo without a new envelope checksum is a checksum failure", async () => {
    const src = await sourceWithBurns();
    const { envelope } = await exportBackup(src.device.db, { now: () => NOW });
    const text = await rebuild(envelope);
    const parsed = JSON.parse(text) as BackupEnvelope;
    parsed.data.burnPhotos[0]!.caption = "Edited";
    expect(await failureOf(JSON.stringify(parsed), await newDevice())).toEqual({ code: "checksum" });
  });

  it("refuses a burn session whose batch is nowhere, and a photo whose session is nowhere", async () => {
    const { text } = await v4With((env) => {
      env.data.burnSessions[0]!.batchId = nowhere;
      env.data.burnPhotos[0]!.sessionId = nowhere;
    });
    expect(await failureOf(text, await newDevice())).toEqual({
      code: "orphans",
      versions: 0,
      measurements: 0,
      batches: 0,
      curePlans: 0,
      productionPlans: 0,
      burnSessions: 1,
      burnPhotos: 1,
      materialLots: 0,
      batchLots: 0,
    });
  });

  it("accepts a photo whose session is only on the device", async () => {
    const src = await sourceWithBurns();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    await applyRestore(target.db, await planFor(target.db, envelope), { now: () => NOW });
    const file = await exportBackup(src.device.db, { now: () => NOW });
    file.envelope.data.burnSessions = [];
    const result = await check(await rebuild(file.envelope), target);
    expect(result.ok).toBe(true);
  });

  it("does not refuse a session whose milestone link no longer resolves (soft link)", async () => {
    const { text } = await v4With((env) => {
      env.data.curePlans = [];
    });
    const target = await newDevice();
    expect((await check(text, target)).ok).toBe(true);
  });

  it("refuses a format 3 file that holds burnSessions, and a format 4 file without them, as damaged", async () => {
    const src = await sourceWithBurns();
    const { envelope } = await exportBackup(src.device.db, { now: () => NOW });
    const v3With = structuredClone(envelope);
    v3With.formatVersion = 3;
    expect(await failureOf(await rebuild(v3With), await newDevice())).toMatchObject({ code: "invalid" });
    const v4Without = structuredClone(envelope);
    delete (v4Without.data as unknown as Record<string, unknown>).burnPhotos;
    expect(await failureOf(await rebuild(v4Without), await newDevice())).toMatchObject({ code: "invalid" });
  });

  it("a session whose weight after is above weight before is invalid", async () => {
    const { text } = await v4With((env) => {
      const weighed = env.data.burnSessions.find((s) => s.label === "Wick trial")!.candles[0]!.burns[0]!;
      weighed.weightAfterMg = weighed.weightBeforeMg! + 1;
    });
    expect(await failureOf(text, await newDevice())).toMatchObject({ code: "invalid", count: 1 });
  });
});

describe("the real CurePilot export (good-v3.json, format 3)", () => {
  const file = JSON.parse(
    readFileSync(join(process.cwd(), "tests", "fixtures", "backups", "good-v3.json"), "utf8"),
  ) as BackupEnvelope;

  it("checks against its own checksum and adds empty burn stores in memory", async () => {
    const target = await newDevice();
    const text = JSON.stringify(file);
    const result = await check(text, target);
    if (!result.ok) throw new Error(result.failure.code);
    expect(result.envelope.formatVersion).toBe(3);
    expect(result.envelope.checksum).toEqual(file.checksum);
    expect(result.envelope.counts).toEqual({ ...file.counts, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0 });
    expect(result.envelope.data.burnSessions).toEqual([]);
    expect(result.envelope.data.burnPhotos).toEqual([]);
  });

  it("restores into a fresh device; its planned burn test then takes a linked session", async () => {
    const fresh = blankDevice((await newDevice()).lib);
    const text = JSON.stringify(file);
    const result = await check(text, fresh);
    if (!result.ok) throw new Error(result.failure.code);
    const applied = await applyRestore(fresh.db, await planFor(fresh.db, result.envelope), { now: () => NOW });
    expect(applied.ok).toBe(true);
    const device = await readDeviceData(fresh.db);
    expect(device.batches).toEqual(file.data.batches);
    expect(device.curePlans).toEqual(file.data.curePlans);
    expect(device.productionPlans).toEqual(file.data.productionPlans);
    const plan = file.data.curePlans[0]!;
    const burnTest = plan.milestones.find((m) => m.kind === "burnTest")!;
    const { session } = await fresh.layer.burnSessions.create({
      sessionId: id(),
      batchId: plan.id,
      testedOn: "2026-11-19",
      milestoneId: burnTest.id,
      candles: [{ label: "Candle 1", wick: { text: "CD-10" }, burns: [{ durationMin: 120 }] }],
    });
    expect((await fresh.layer.burnSessions.get(session.id))!.milestone!.doneOn).toBe("2026-11-19");
  });
});
