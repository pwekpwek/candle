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
import type { BackupEnvelope } from "@/lib/types";
import { id, setup } from "../db/harness";
import { blankDevice, exportChecked, makeSource, planFor } from "./apply-harness";

/**
 * Backup format 3 (v0.2 CurePilot): cure plans and planned production entries
 * are exported, checked, planned and restored like the other stores. See
 * docs/v0.2-curepilot.md, "Backup format 3".
 */

const NOW = "2026-11-19T09:00:00.000Z";

/**
 * A source device with batches, a cure plan with one milestone done, an open
 * production entry, and one entry that made a batch.
 */
async function sourceWithSchedule() {
  const src = await makeSource();
  const { layer } = src.device;
  const { batch: a } = await layer.batches.create({
    batchId: id(),
    versionId: src.first.version.id,
    producedOn: "2026-11-10",
    entries: [],
  });
  const cure = await layer.curePlans.save(a.id, [
    { kind: "cureEnd", offsetDays: 14 },
    { kind: "burnTest", offsetDays: 3, label: "First burn" },
  ]);
  const curePlan = await layer.curePlans.setMilestoneDone(a.id, cure.milestones[1]!.id, "2026-11-13");
  const { plan: open } = await layer.productionPlans.create({
    planId: id(),
    versionId: src.other.version.id,
    plannedOn: "2026-12-02",
    label: "Dec run",
  });
  const { plan: madeEntry } = await layer.productionPlans.create({
    planId: id(),
    versionId: src.first.version.id,
    plannedOn: "2026-11-18",
  });
  const { batch: b } = await layer.batches.create({
    batchId: id(),
    versionId: src.first.version.id,
    producedOn: "2026-11-18",
    entries: [],
    productionPlanId: madeEntry.id,
  });
  const made = (await layer.productionPlans.get(madeEntry.id))!.plan;
  return { ...src, batches: [a, b], curePlan, open, made };
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

/** The same data as a BatchTrace (format 2) file: no curePlans or productionPlans. */
async function asFormat2(env: BackupEnvelope): Promise<string> {
  const copy = structuredClone(env);
  const data = copy.data as unknown as Record<string, unknown>;
  delete data.curePlans;
  delete data.productionPlans;
  copy.formatVersion = 2;
  copy.schemaVersion = 2;
  return rebuild(copy);
}

describe("backup format 3 export", () => {
  it("exports cure plans and production entries with format 3, schema 3, counts and a checksum over every store", async () => {
    const { device, curePlan, open, made } = await sourceWithSchedule();
    const { envelope, json } = await exportBackup(device.db, { now: () => NOW });
    expect(envelope.formatVersion).toBe(3);
    expect(envelope.schemaVersion).toBe(3);
    expect(envelope.counts).toMatchObject({ batches: 2, curePlans: 1, productionPlans: 2 });
    expect(envelope.data.curePlans).toEqual([curePlan]);
    expect(envelope.data.productionPlans.map((p) => p.id)).toEqual([open.id, made.id].sort());
    expect(envelope.checksum.value).toBe(await sha256Hex(canonicalJson(envelope.data)));
    expect(Object.keys(envelope.data)).toEqual([
      "materials",
      "formulas",
      "formulaVersions",
      "measurements",
      "batches",
      "curePlans",
      "productionPlans",
    ]);
    expect(BackupEnvelopeSchema.safeParse(JSON.parse(json)).success).toBe(true);
  });
});

describe("backup format 3 round trip", () => {
  it("restores cure plans (with done dates) and entries (with their batch link) into a fresh profile; a second restore changes nothing", async () => {
    const { device, batches, made } = await sourceWithSchedule();
    const fresh = blankDevice(device.lib);
    const { envelope } = await exportChecked(device.db, fresh.db);
    const plan = await planFor(fresh.db, envelope);
    expect(plan.added).toMatchObject({ batches: 2, curePlans: 1, productionPlans: 2 });
    const result = await applyRestore(fresh.db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await readDeviceData(fresh.db)).toEqual(await readDeviceData(device.db));

    const restoredPlan = await fresh.layer.curePlans.get(batches[0]!.id);
    expect(restoredPlan?.milestones[1]!.doneOn).toBe("2026-11-13");
    const entry = await fresh.layer.productionPlans.get(made.id);
    expect(entry?.batch?.id).toBe(batches[1]!.id);

    const again = await planFor(fresh.db, (await exportChecked(device.db, fresh.db)).envelope);
    expect(again.puts.curePlans).toEqual([]);
    expect(again.puts.productionPlans).toEqual([]);
    expect(again.tally.curePlans).toEqual({ new: 0, identical: 1, conflict: 0 });
    expect(again.tally.productionPlans).toEqual({ new: 0, identical: 2, conflict: 0 });
  });

  it("conflicts follow the maker's keep-or-replace choice", async () => {
    const { device, batches, curePlan, open } = await sourceWithSchedule();
    const target = blankDevice(device.lib);
    const first = await exportChecked(device.db, target.db);
    expect((await applyRestore(target.db, await planFor(target.db, first.envelope))).ok).toBe(true);

    // The target changes both records after the restore.
    await target.layer.curePlans.setMilestoneDone(batches[0]!.id, curePlan.milestones[0]!.id, "2026-11-24");
    await target.layer.productionPlans.update(open.id, { plannedOn: "2026-12-20" });
    const { envelope } = await exportChecked(device.db, target.db);

    const keep = await planFor(target.db, envelope, "merge", "keepDevice");
    expect(keep.kept).toMatchObject({ curePlans: 1, productionPlans: 1 });
    expect(keep.puts.curePlans).toEqual([]);
    expect(keep.puts.productionPlans).toEqual([]);

    const use = await planFor(target.db, envelope, "merge", "useBackup");
    expect(use.replaced).toMatchObject({ curePlans: 1, productionPlans: 1 });
    expect((await applyRestore(target.db, use)).ok).toBe(true);
    expect((await target.layer.curePlans.get(batches[0]!.id))?.milestones[0]!.doneOn).toBeNull();
    expect((await target.layer.productionPlans.get(open.id))?.plan.plannedOn).toBe("2026-12-02");
  });

  it("two devices that each planned the same batch meet as one conflict, not two plans", async () => {
    const { device, batches } = await sourceWithSchedule();
    const target = blankDevice(device.lib);
    const { envelope } = await exportChecked(device.db, target.db);
    expect((await applyRestore(target.db, await planFor(target.db, envelope))).ok).toBe(true);
    await target.layer.curePlans.save(batches[0]!.id, [{ kind: "cureEnd", offsetDays: 28 }]);
    const p = await planFor(target.db, (await exportChecked(device.db, target.db)).envelope, "merge", "useBackup");
    expect(p.tally.curePlans).toEqual({ new: 0, identical: 0, conflict: 1 });
    expect((await applyRestore(target.db, p)).ok).toBe(true);
    expect(await target.db.curePlans.count()).toBe(1);
  });

  it("Replace everything clears cure plans and entries, and the safety backup holds them", async () => {
    const { device } = await sourceWithSchedule();
    const target = blankDevice(device.lib);
    const { envelope: full } = await exportChecked(device.db, target.db);
    expect((await applyRestore(target.db, await planFor(target.db, full))).ok).toBe(true);

    // A file with no schedule at all (from a fresh source device).
    const empty = await makeSource();
    const { envelope } = await exportChecked(empty.device.db, target.db);
    const plan = await planFor(target.db, envelope, "replace");
    const safety = await exportBackup(target.db, { now: () => NOW });
    expect(safety.envelope.counts).toMatchObject({ curePlans: 1, productionPlans: 2 });
    const result = await applyRestore(target.db, plan, { safetyBackup: safety });
    expect(result.ok).toBe(true);
    expect(await target.db.curePlans.count()).toBe(0);
    expect(await target.db.productionPlans.count()).toBe(0);
  });
});

describe("older backup formats", () => {
  it("restores the real BatchTrace export (good-v2.json) into a fresh device, and a cure plan can then be added", async () => {
    const text = readFileSync(join(process.cwd(), "tests", "fixtures", "backups", "good-v2.json"), "utf8");
    const file = JSON.parse(text) as BackupEnvelope;
    expect(file.formatVersion).toBe(2);
    const fresh = setup();
    const result = await check(text, fresh);
    if (!result.ok) throw new Error(result.failure.code);
    expect(result.envelope.checksum).toEqual(file.checksum);
    expect(result.envelope.counts).toEqual({ ...file.counts, curePlans: 0, productionPlans: 0 });
    const applied = await applyRestore(fresh.db, await planFor(fresh.db, result.envelope));
    expect(applied.ok).toBe(true);
    const batches = await fresh.db.batches.toArray();
    expect(batches.map((b) => b.id).sort()).toEqual(file.data.batches.map((b) => b.id).sort());
    const labelled = batches.find((b) => b.label === "BT-01")!;
    expect(labelled.entries).toEqual(file.data.batches.find((b) => b.label === "BT-01")!.entries);
    const plan = await fresh.layer.curePlans.save(labelled.id, [{ kind: "cureEnd", offsetDays: 14 }]);
    expect(plan.id).toBe(labelled.id);
    expect((await fresh.layer.schedule.read()).cure).toHaveLength(1);
  });

  it("reads a format 2 (BatchTrace) file: checksum over five stores, cure plans and entries added empty in memory", async () => {
    const { device } = await sourceWithSchedule();
    const { envelope } = await exportBackup(device.db, { now: () => NOW });
    const text = await asFormat2(envelope);
    const fresh = blankDevice(device.lib);
    const result = await check(text, fresh);
    if (!result.ok) throw new Error(result.failure.code);
    expect(result.envelope.formatVersion).toBe(2);
    expect(result.envelope.data.curePlans).toEqual([]);
    expect(result.envelope.data.productionPlans).toEqual([]);
    expect(result.envelope.counts).toMatchObject({ batches: 2, curePlans: 0, productionPlans: 0 });
    const applied = await applyRestore(fresh.db, await planFor(fresh.db, result.envelope));
    expect(applied.ok).toBe(true);
    expect(await fresh.db.batches.count()).toBe(2);
  });

  it("refuses a format 2 file that holds curePlans, and a format 3 file without them, as damaged", async () => {
    const { device } = await sourceWithSchedule();
    const { envelope } = await exportBackup(device.db, { now: () => NOW });
    const v2WithPlans = structuredClone(envelope);
    v2WithPlans.formatVersion = 2;
    expect(await failureOf(await rebuild(v2WithPlans), setup())).toMatchObject({ code: "invalid" });

    const v3Without = structuredClone(envelope);
    delete (v3Without.data as unknown as Record<string, unknown>).curePlans;
    expect(await failureOf(await rebuild(v3Without), setup())).toMatchObject({ code: "invalid" });
  });

  it("refuses a format 4 file as newer", async () => {
    const { device } = await sourceWithSchedule();
    const { envelope } = await exportBackup(device.db, { now: () => NOW });
    envelope.formatVersion = 4;
    expect(await failureOf(await rebuild(envelope), setup())).toEqual({ code: "newer" });
  });
});

describe("cure plan and entry links on restore (orphan check)", () => {
  async function v3With(edit: (env: BackupEnvelope) => void) {
    const src = await sourceWithSchedule();
    const { envelope } = await exportBackup(src.device.db, { now: () => NOW });
    edit(envelope);
    return { ...src, text: await rebuild(envelope) };
  }
  const nowhere = "99999999-0000-4000-8000-000000000001";

  it("refuses a cure plan whose batch is neither in the file nor on the device", async () => {
    const { text } = await v3With((env) => {
      env.data.curePlans[0]!.id = nowhere;
    });
    expect(await failureOf(text, setup())).toEqual({
      code: "orphans",
      versions: 0,
      measurements: 0,
      batches: 0,
      curePlans: 1,
      productionPlans: 0,
    });
  });

  it("accepts a cure plan whose batch is only on the device", async () => {
    const { device, text } = await v3With((env) => {
      env.data.batches = env.data.batches.filter((b) => b.id !== env.data.curePlans[0]!.id);
      env.data.productionPlans = env.data.productionPlans.filter((p) => p.batchId === null);
    });
    expect((await check(text, device)).ok).toBe(true);
  });

  it("refuses an entry whose version is nowhere, or in the file under another formula", async () => {
    const a = await v3With((env) => {
      const entry = env.data.productionPlans.find((p) => p.batchId === null)!;
      entry.versionId = nowhere;
    });
    expect(await failureOf(a.text, setup())).toMatchObject({ code: "orphans", productionPlans: 1 });
    const b = await v3With((env) => {
      const entry = env.data.productionPlans.find((p) => p.batchId === null)!;
      entry.formulaId = nowhere;
    });
    expect(await failureOf(b.text, setup())).toMatchObject({ code: "orphans", productionPlans: 1 });
  });

  it("refuses an entry whose batch is nowhere, or a batch in the file of another version", async () => {
    const a = await v3With((env) => {
      env.data.productionPlans.find((p) => p.batchId !== null)!.batchId = nowhere;
    });
    expect(await failureOf(a.text, setup())).toMatchObject({ code: "orphans", productionPlans: 1 });
    const b = await v3With((env) => {
      const open = env.data.productionPlans.find((p) => p.batchId === null)!;
      const made = env.data.productionPlans.find((p) => p.batchId !== null)!;
      // The open entry is for "Beta"; the batch is from "Alpha".
      open.batchId = made.batchId;
    });
    expect(await failureOf(b.text, setup())).toMatchObject({ code: "orphans", productionPlans: 1 });
  });

  it("refuses a cure plan with two cure ends as invalid", async () => {
    const { text } = await v3With((env) => {
      env.data.curePlans[0]!.milestones[1]!.kind = "cureEnd";
    });
    const failure = await failureOf(text, setup());
    expect(failure).toMatchObject({ code: "invalid", count: 1 });
    if (failure.code === "invalid") expect(failure.firstLabel).toMatch(/^cure plan /);
  });
});

describe("interrupted and stale restores", () => {
  it("a failure after the productionPlans store is written rolls everything back; the same plan then applies", async () => {
    const { device } = await sourceWithSchedule();
    const fresh = blankDevice(device.lib);
    const before = await readDeviceData(fresh.db);
    const { envelope } = await exportChecked(device.db, fresh.db);
    const plan = await planFor(fresh.db, envelope);
    const failed = await applyRestore(fresh.db, plan, {
      afterStoreWritten: (store) => {
        if (store === "productionPlans") throw new Error("tab closed");
      },
    });
    expect(failed).toMatchObject({ ok: false, reason: "storage" });
    expect(await readDeviceData(fresh.db)).toEqual(before);
    expect((await applyRestore(fresh.db, plan)).ok).toBe(true);
    expect(await fresh.db.curePlans.count()).toBe(1);
  });

  it("is stale when the device made its own plan for the batch after the preview", async () => {
    const { device, batches } = await sourceWithSchedule();
    const target = blankDevice(device.lib);
    // First restore only the batches (no schedule), so the target has batch A.
    const { envelope } = await exportChecked(device.db, target.db);
    const noSchedule = structuredClone(envelope);
    noSchedule.data.curePlans = [];
    noSchedule.data.productionPlans = [];
    expect((await applyRestore(target.db, await planFor(target.db, noSchedule))).ok).toBe(true);

    const plan = await planFor(target.db, envelope);
    expect(plan.added.curePlans).toBe(1);
    await target.layer.curePlans.save(batches[0]!.id, [{ kind: "cureEnd", offsetDays: 7 }]);
    const result = await applyRestore(target.db, plan);
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect((await target.layer.curePlans.get(batches[0]!.id))?.milestones[0]!.offsetDays).toBe(7);
  });
});
