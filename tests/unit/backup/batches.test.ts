import "fake-indexeddb/auto";
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
import { BackupEnvelopeSchema } from "@/lib/schemas";
import type { Batch, BackupEnvelope } from "@/lib/types";
import { id, setup } from "../db/harness";
import { addFormula, addRevision, exportChecked, makeSource, newDevice, planFor } from "./apply-harness";
import type { Device } from "./apply-harness";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "backups");
const V1_TEXT = readFileSync(join(FIXTURES, "good.json"), "utf8");
const V1 = JSON.parse(V1_TEXT) as BackupEnvelope;

const NOW = "2026-11-18T09:00:00.000Z";

/** Two batches from one version of "Alpha", one from "Beta". */
async function sourceWithBatches() {
  const src = await makeSource();
  const { layer } = src.device;
  const wax = src.first.version.inputs.waxes[0]!.componentId;
  const oil = src.first.version.inputs.oils[0]!.componentId;
  const a = await layer.batches.create({
    batchId: id(),
    versionId: src.first.version.id,
    producedOn: "2026-11-16",
    label: "LV-01",
    entries: [{ componentId: wax, actualMg: 1003200 }],
  });
  const b = await layer.batches.create({
    batchId: id(),
    versionId: src.first.version.id,
    producedOn: "2026-11-17",
    entries: [
      { componentId: wax, actualMg: 998700 },
      { componentId: oil, actualMg: 40100 },
    ],
    notes: "second pour",
  });
  const c = await layer.batches.create({
    batchId: id(),
    versionId: src.other.version.id,
    producedOn: "2026-11-18",
    entries: [],
  });
  return { ...src, batches: [a.batch, b.batch, c.batch] };
}

async function check(text: string, target: Device | ReturnType<typeof setup>) {
  return checkBackupText(text, Buffer.byteLength(text, "utf8"), deviceIdsOf(await readDeviceData(target.db)));
}

async function failureOf(text: string, target: ReturnType<typeof setup>): Promise<CheckFailure> {
  const result = await check(text, target);
  if (result.ok) throw new Error("expected a failure");
  return result.failure;
}

/** Re-serialises an edited envelope with correct counts and checksum for its format. */
async function rebuild(env: BackupEnvelope & { data: Record<string, unknown[]> }): Promise<string> {
  const counts: Record<string, number> = {};
  for (const [store, rows] of Object.entries(env.data)) counts[store] = rows.length;
  env.counts = counts as BackupEnvelope["counts"];
  env.checksum = { algorithm: "SHA-256", value: await sha256Hex(canonicalJson(env.data)) };
  return JSON.stringify(env);
}

describe("backup export includes batches (format 3 since CurePilot)", () => {
  it("exports batches with the current format and schema, counts and a checksum over every store", async () => {
    const { device, batches } = await sourceWithBatches();
    const { envelope, json } = await exportBackup(device.db, { now: () => NOW });
    expect(envelope.formatVersion).toBe(6);
    expect(envelope.schemaVersion).toBe(6);
    expect(envelope.appVersion).toBe("0.3.0");
    expect(envelope.counts).toEqual({ materials: 6, formulas: 2, formulaVersions: 3, measurements: 2, batches: 3, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 });
    expect(envelope.data.batches.map((b) => b.id)).toEqual(batches.map((b) => b.id).sort());
    expect(envelope.checksum.value).toBe(await sha256Hex(canonicalJson(envelope.data)));
    expect(BackupEnvelopeSchema.safeParse(JSON.parse(json)).success).toBe(true);
  });
});

describe("backup format 2 round trip", () => {
  it("restores batch ids, source links, production dates, labels, notes and measurements into a fresh profile", async () => {
    const { device, batches, first } = await sourceWithBatches();
    const fresh = setup();
    const { envelope } = await exportChecked(device.db, fresh.db);
    const plan = await planFor(fresh.db, envelope);
    expect(plan.added.batches).toBe(3);
    const result = await applyRestore(fresh.db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.batches).toBe(3);
    expect(await readDeviceData(fresh.db)).toEqual(await readDeviceData(device.db));

    for (const original of batches) {
      const item = await fresh.layer.batches.get(original.id);
      expect(item?.batch).toEqual(original);
      expect(item?.version.id).toBe(original.versionId);
      expect(item?.formula.id).toBe(original.formulaId);
    }
    const [a, b] = batches as [Batch, Batch];
    const reopenedA = await fresh.layer.batches.get(a.id);
    const reopenedB = await fresh.layer.batches.get(b.id);
    expect(reopenedA?.version.id).toBe(first.version.id);
    expect(reopenedB?.version.id).toBe(first.version.id);
    expect(reopenedA?.batch.producedOn).not.toBe(reopenedB?.batch.producedOn);

    // Restoring the same file again changes nothing (DATA-19).
    const again = await planFor(fresh.db, envelope);
    expect(again.added.batches).toBe(0);
    expect(again.tally.batches.identical).toBe(3);
    expect(again.puts.batches).toEqual([]);
  });

  it("a batch made from an older version still points at it after the source gains versions", async () => {
    const { device, batches, first, second } = await sourceWithBatches();
    // Alpha now has versions 1 and 2; the batches were made from version 1.
    expect(second.version.number).toBe(2);
    await addRevision(device, first.formula.id, second.version, 600);
    const fresh = setup();
    const { envelope } = await exportChecked(device.db, fresh.db);
    await applyRestore(fresh.db, await planFor(fresh.db, envelope));
    const item = await fresh.layer.batches.get(batches[0]!.id);
    expect(item?.version.number).toBe(1);
    expect(item?.formula.latestVersionNumber).toBe(3);
  });

  it("merge conflicts on a batch follow the maker's choice", async () => {
    const { device, batches } = await sourceWithBatches();
    const fresh = setup();
    const { envelope } = await exportChecked(device.db, fresh.db);
    await applyRestore(fresh.db, await planFor(fresh.db, envelope));
    const target = batches[0]!;
    await fresh.layer.batches.update(target.id, { producedOn: "2026-11-01", label: "Changed here", entries: [] });

    const keep = await planFor(fresh.db, envelope, "merge", "keepDevice");
    expect(keep.tally.batches.conflict).toBe(1);
    expect(keep.kept.batches).toBe(1);
    expect(keep.puts.batches).toEqual([]);

    const use = await planFor(fresh.db, envelope, "merge", "useBackup");
    expect(use.replaced.batches).toBe(1);
    const result = await applyRestore(fresh.db, use);
    expect(result.ok).toBe(true);
    expect((await fresh.layer.batches.get(target.id))?.batch).toEqual(target);
  });

  it("replace everything clears batches and writes the backup's", async () => {
    const { device, batches } = await sourceWithBatches();
    const target = await newDevice();
    const local = await addFormula(target, "Local only");
    const localBatch = await target.layer.batches.create({ batchId: id(), versionId: local.version.id, producedOn: "2026-11-10", entries: [] });
    const { envelope } = await exportChecked(device.db, target.db);
    const safetyBackup = await exportBackup(target.db, { now: () => NOW });
    expect(safetyBackup.envelope.data.batches.map((b) => b.id)).toEqual([localBatch.batch.id]);
    const plan = await planFor(target.db, envelope, "replace");
    const result = await applyRestore(target.db, plan, { safetyBackup });
    expect(result.ok).toBe(true);
    expect((await readDeviceData(target.db)).batches.map((b) => b.id).sort()).toEqual(batches.map((b) => b.id).sort());
    expect(await target.layer.batches.get(localBatch.batch.id)).toBeUndefined();
  });
});

describe("interrupted or failed restore with batches (DATA-24, DATA-25)", () => {
  it("a failure after the batches store is written rolls everything back; the same plan applies afterwards", async () => {
    const { device } = await sourceWithBatches();
    const fresh = setup();
    const { envelope } = await exportChecked(device.db, fresh.db);
    const plan = await planFor(fresh.db, envelope);
    const before = await readDeviceData(fresh.db);
    const result = await applyRestore(fresh.db, plan, {
      afterStoreWritten: (store) => {
        if (store === "batches") throw new Error("power cut");
      },
    });
    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(await readDeviceData(fresh.db)).toEqual(before);
    expect((await fresh.layer.meta.get()).lastRestoreAt).toBeNull();

    const again = await applyRestore(fresh.db, plan);
    expect(again.ok).toBe(true);
    expect((await readDeviceData(fresh.db)).batches).toHaveLength(3);
  });

  it("a stale plan (a batch edited after the preview) is refused and nothing is written", async () => {
    const { device, batches } = await sourceWithBatches();
    const fresh = setup();
    const { envelope } = await exportChecked(device.db, fresh.db);
    await applyRestore(fresh.db, await planFor(fresh.db, envelope));
    const plan = await planFor(fresh.db, envelope, "merge", "useBackup");
    await fresh.layer.batches.update(batches[1]!.id, { producedOn: "2026-11-02", entries: [] });
    const before = await readDeviceData(fresh.db);
    const result = await applyRestore(fresh.db, plan);
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect(await readDeviceData(fresh.db)).toEqual(before);
  });
});

describe("v0.1 backup (format 1) import", () => {
  it("is accepted, migrated with no batches, and keeps the file's own checksum", async () => {
    const fresh = setup();
    const result = await check(V1_TEXT, fresh);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.formatVersion).toBe(1);
    expect(result.envelope.checksum).toEqual(V1.checksum);
    expect(result.envelope.data.batches).toEqual([]);
    expect(result.envelope.counts.batches).toBe(0);
  });

  it("restores formulas, versions, materials and measurements into a v0.2 device that already has batches", async () => {
    const { device } = await sourceWithBatches();
    const before = await readDeviceData(device.db);
    const result = await check(V1_TEXT, device);
    if (!result.ok) throw new Error(result.failure.code);
    const plan = await planFor(device.db, result.envelope);
    expect(plan.added).toEqual({
      materials: V1.data.materials.length,
      formulas: V1.data.formulas.length,
      formulaVersions: V1.data.formulaVersions.length,
      measurements: V1.data.measurements.length,
      batches: 0,
      curePlans: 0,
      productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0,
    });
    const applied = await applyRestore(device.db, plan);
    expect(applied.ok).toBe(true);
    const after = await readDeviceData(device.db);
    expect(after.batches).toEqual(before.batches);
    for (const formula of V1.data.formulas) {
      expect(after.formulas.find((f) => f.id === formula.id)?.name).toBe(formula.name);
    }
    for (const version of V1.data.formulaVersions) {
      expect(after.formulaVersions.find((v) => v.id === version.id)).toEqual(version);
    }
    for (const material of V1.data.materials) {
      expect(after.materials.find((m) => m.id === material.id)).toEqual(material);
    }
    // A batch can be made from a restored v0.1 version.
    const v = V1.data.formulaVersions[0]!;
    const { batch } = await device.layer.batches.create({ batchId: id(), versionId: v.id, producedOn: "2026-11-18", entries: [] });
    expect((await device.layer.batches.get(batch.id))?.version.id).toBe(v.id);
  });

  it("replace everything with a v0.1 backup empties the batches store", async () => {
    const { device } = await sourceWithBatches();
    const result = await check(V1_TEXT, device);
    if (!result.ok) throw new Error(result.failure.code);
    const safetyBackup = await exportBackup(device.db, { now: () => NOW });
    const plan = await planFor(device.db, result.envelope, "replace");
    const applied = await applyRestore(device.db, plan, { safetyBackup });
    expect(applied.ok).toBe(true);
    if (applied.ok) expect(applied.counts.batches).toBe(0);
  });

  it("a format 1 file that holds a batches array is refused as damaged", async () => {
    const env = structuredClone(V1) as BackupEnvelope & { data: Record<string, unknown[]> };
    env.data.batches = [];
    const text = await rebuild(env);
    expect((await failureOf(text, setup())).code).toBe("invalid");
  });

  it("a format 2 file without batches is refused as damaged", async () => {
    const env = structuredClone(V1) as BackupEnvelope & { data: Record<string, unknown[]> };
    env.formatVersion = 2;
    const text = await rebuild(env);
    expect((await failureOf(text, setup())).code).toBe("invalid");
  });

  it("a format 1 file whose checksum does not match is refused", async () => {
    const env = structuredClone(V1);
    env.data.formulas[0]!.name = "Edited";
    expect((await failureOf(JSON.stringify(env), setup())).code).toBe("checksum");
  });
});

describe("batch links on restore (orphan check)", () => {
  async function v2With(edit: (env: BackupEnvelope) => void): Promise<string> {
    const { device } = await sourceWithBatches();
    const { envelope } = await exportBackup(device.db, { now: () => NOW });
    edit(envelope);
    return rebuild(envelope as BackupEnvelope & { data: Record<string, unknown[]> });
  }

  it("refuses a batch whose version is neither in the file nor on the device", async () => {
    const text = await v2With((env) => {
      env.data.batches[0]!.versionId = "99999999-0000-4000-8000-000000000001";
    });
    expect(await failureOf(text, setup())).toEqual({ code: "orphans", versions: 0, measurements: 0, batches: 1, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, materialLots: 0, batchLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 });
  });

  it("refuses a batch whose version in the file belongs to another formula", async () => {
    const text = await v2With((env) => {
      env.data.batches[0]!.formulaId = "99999999-0000-4000-8000-000000000002";
    });
    expect(await failureOf(text, setup())).toMatchObject({ code: "orphans", batches: 1, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, materialLots: 0, batchLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 });
  });

  it("accepts a batch whose version is already on this device", async () => {
    const { device, first } = await sourceWithBatches();
    const { envelope } = await exportBackup(device.db, { now: () => NOW });
    // Keep only the batches: their versions are on `device` itself.
    envelope.data = { materials: [], formulas: [], formulaVersions: [], measurements: [], batches: envelope.data.batches, curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [], investigations: [], investigationPhotos: [], correctiveExperiments: [] };
    const text = await rebuild(envelope as BackupEnvelope & { data: Record<string, unknown[]> });
    const result = await check(text, device);
    expect(result.ok).toBe(true);
    expect(first.version.id).toBeTruthy();
  });

  it("refuses a batch record with a bad production date as invalid", async () => {
    const text = await v2With((env) => {
      env.data.batches[0]!.producedOn = "2026-13-01";
    });
    const failure = await failureOf(text, setup());
    expect(failure).toMatchObject({ code: "invalid", count: 1 });
    if (failure.code === "invalid") expect(failure.firstLabel).toMatch(/^batch /);
  });
});
