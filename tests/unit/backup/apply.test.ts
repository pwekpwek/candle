import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { applyRestore, canonicalJson, deviceIdsOf, exportBackup, readDeviceData } from "@/lib/backup";
import type { RestorePlan } from "@/lib/backup";
import { counterOf, makeMeasurement, setup } from "../db/harness";
import {
  addFormula,
  addRevision,
  blankDevice,
  exportChecked,
  makeSource,
  newDevice,
  planFor,
} from "./apply-harness";

const NOW1 = "2026-11-17T10:00:00.000Z";
const NOW2 = "2026-11-17T11:00:00.000Z";

const STORES = ["materials", "formulas", "formulaVersions", "measurements"] as const;

describe("readDeviceData and deviceIdsOf", () => {
  it("returns every store sorted by id, and ids for the orphan check", async () => {
    const { db } = setup();
    const ids = ["m-c", "m-a", "m-b"];
    for (const key of ids) {
      await db.materials.put({
        id: key,
        type: "wax",
        name: key,
        createdAt: "2026-11-10T06:00:00.000Z",
        updatedAt: "2026-11-10T06:00:00.000Z",
        archivedAt: null,
      });
    }
    const m1 = makeMeasurement("f-z", "v-z");
    const m2 = makeMeasurement("f-a", "v-a");
    m1.id = "z-1";
    m2.id = "a-1";
    await db.measurements.bulkPut([m1, m2]);
    const device = await readDeviceData(db);
    expect(device.materials.map((m) => m.id)).toEqual(["m-a", "m-b", "m-c"]);
    expect(device.measurements.map((m) => m.id)).toEqual(["a-1", "z-1"]);
    expect(device.formulas).toEqual([]);
    expect(device.formulaVersions).toEqual([]);

    const source = await makeSource();
    const real = await readDeviceData(source.device.db);
    const known = deviceIdsOf(real);
    expect([...known.formulaIds].sort()).toEqual(real.formulas.map((f) => f.id));
    expect([...known.versionIds].sort()).toEqual(real.formulaVersions.map((v) => v.id));
  });
});

describe("TEST-19: restore into an empty database", () => {
  it("copies every store, sets lastRestoreAt and adds one to the counter", async () => {
    const { device: source } = await makeSource();
    const target = setup();
    const { envelope } = await exportChecked(source.db, target.db);
    const plan = await planFor(target.db, envelope);
    expect(await counterOf(target.layer)).toBe(0);

    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts).toEqual(plan.expectedCounts);
    expect(result.counts).toEqual({ materials: 6, formulas: 2, formulaVersions: 3, measurements: 2, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 });

    expect(await readDeviceData(target.db)).toEqual(await readDeviceData(source.db));
    const meta = await target.layer.meta.get();
    expect(meta.lastRestoreAt).toBe(NOW1);
    expect(meta.changesSinceBackup).toBe(1);
  });
});

describe("TEST-20: restoring the same file twice", () => {
  it("changes nothing the second time, and does not move the counter", async () => {
    const { device: source } = await makeSource();
    const target = setup();
    const { envelope } = await exportChecked(source.db, target.db);
    const first = await applyRestore(target.db, await planFor(target.db, envelope), { now: () => NOW1 });
    expect(first.ok).toBe(true);
    const afterFirst = await readDeviceData(target.db);

    const { envelope: again } = await exportChecked(source.db, target.db);
    const plan = await planFor(target.db, again);
    for (const store of STORES) expect(plan.puts[store]).toEqual([]);
    expect(plan.skippedIdentical).toBe(13);
    const second = await applyRestore(target.db, plan, { now: () => NOW2 });
    expect(second.ok).toBe(true);
    expect(await readDeviceData(target.db)).toEqual(afterFirst);
    const meta = await target.layer.meta.get();
    expect(meta.changesSinceBackup).toBe(1);
    expect(meta.lastRestoreAt).toBe(NOW2);
  });
});

describe("TEST-21: merge into existing data", () => {
  async function scenario() {
    const src = await makeSource();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    expect((await applyRestore(target.db, await planFor(target.db, envelope))).ok).toBe(true);

    // Conflicts: a material, a formula name, a measurement.
    const materialId = src.device.lib.waxId;
    await target.db.materials.update(materialId, { name: "Device wax name" });
    await target.layer.formulas.updateDetails(src.first.formula.id, { name: "Device alpha", notes: "dev" });
    await target.db.measurements.update(src.m1.id, { updatedAt: "2026-11-16T00:00:00.000Z" });
    // New on the backup side: the device lacks a material and a measurement.
    await target.db.materials.delete(src.device.lib.vesselId);
    await target.db.measurements.delete(src.m2.id);
    return { src, target, envelope, materialId };
  }

  it("keepDevice: adds the new records and leaves conflicting device copies unchanged", async () => {
    const { src, target, envelope, materialId } = await scenario();
    const before = await readDeviceData(target.db);
    const plan = await planFor(target.db, envelope, "merge", "keepDevice");
    expect(plan.added.materials).toBe(1);
    expect(plan.added.measurements).toBe(1);
    expect(plan.kept).toMatchObject({ materials: 1, formulas: 1, measurements: 1 });
    expect(plan.skippedIdentical).toBeGreaterThan(0);

    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result.ok).toBe(true);
    const after = await readDeviceData(target.db);
    const pick = <T extends { id: string }>(rows: T[], key: string) => rows.find((r) => r.id === key);
    expect(pick(after.materials, materialId)).toEqual(pick(before.materials, materialId));
    expect(pick(after.formulas, src.first.formula.id)).toEqual(pick(before.formulas, src.first.formula.id));
    expect(pick(after.measurements, src.m1.id)).toEqual(pick(before.measurements, src.m1.id));
    expect(pick(after.materials, src.device.lib.vesselId)).toEqual(
      pick(envelope.data.materials, src.device.lib.vesselId),
    );
    expect(pick(after.measurements, src.m2.id)).toEqual(pick(envelope.data.measurements, src.m2.id));
    expect(after.materials).toHaveLength(6);
    expect(after.measurements).toHaveLength(2);
  });

  it("useBackup: writes the backup's copies; a formula takes name, notes, archivedAt, updatedAt", async () => {
    const { src, target, envelope, materialId } = await scenario();
    const before = await readDeviceData(target.db);
    const plan = await planFor(target.db, envelope, "merge", "useBackup");
    expect(plan.replaced).toMatchObject({ materials: 1, formulas: 1, measurements: 1 });

    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result.ok).toBe(true);
    const after = await readDeviceData(target.db);
    const pick = <T extends { id: string }>(rows: T[], key: string) => rows.find((r) => r.id === key);
    expect(pick(after.materials, materialId)).toEqual(pick(envelope.data.materials, materialId));
    expect(pick(after.measurements, src.m1.id)).toEqual(pick(envelope.data.measurements, src.m1.id));

    const device = pick(before.formulas, src.first.formula.id)!;
    const backup = pick(envelope.data.formulas, src.first.formula.id)!;
    const written = pick(after.formulas, src.first.formula.id)!;
    expect(written.name).toBe(backup.name);
    expect(written.notes).toBe(backup.notes);
    expect(written.archivedAt).toBe(backup.archivedAt);
    expect(written.updatedAt).toBe(backup.updatedAt);
    expect(written.createdAt).toBe(device.createdAt);
    expect(written.latestVersionNumber).toBe(device.latestVersionNumber);
  });
});

describe("TEST-22: version number clash", () => {
  it("renumbers the incoming version and keeps every parent link resolving", async () => {
    const a = await makeSource();
    const b = blankDevice(a.device.lib);
    const first = await exportChecked(a.device.db, b.db);
    expect((await applyRestore(b.db, await planFor(b.db, first.envelope))).ok).toBe(true);

    // Both devices now hold "Beta" with version 1. Each adds its own, different version 2.
    const baseA = a.other.version;
    const baseB = (await b.layer.versions.get(baseA.id))!;
    const onA = await addRevision(a.device, a.other.formula.id, baseA, 650);
    const onB = await addRevision(b, a.other.formula.id, baseB, 900);
    expect(onA.version.number).toBe(2);
    expect(onB.version.number).toBe(2);

    const { envelope } = await exportChecked(a.device.db, b.db);
    const plan = await planFor(b.db, envelope);
    expect(plan.added.formulaVersions).toBe(1);
    expect(plan.renumbered).toEqual([
      {
        versionId: onA.version.id,
        formulaId: a.other.formula.id,
        formulaName: "Beta",
        from: 2,
        to: 3,
      },
    ]);

    const result = await applyRestore(b.db, plan, { now: () => NOW1 });
    expect(result.ok).toBe(true);
    const device = await readDeviceData(b.db);
    const moved = device.formulaVersions.find((v) => v.id === onA.version.id)!;
    expect(moved.number).toBe(3);
    expect(moved.originalNumber).toBe(2);
    expect(device.formulaVersions.find((v) => v.id === onB.version.id)!.number).toBe(2);
    expect(device.formulas.find((f) => f.id === a.other.formula.id)!.latestVersionNumber).toBe(3);
    const versionIds = new Set(device.formulaVersions.map((v) => v.id));
    for (const version of device.formulaVersions) {
      if (version.parentVersionId !== null) expect(versionIds.has(version.parentVersionId)).toBe(true);
    }
    expect(moved.parentVersionId).toBe(baseA.id);
  });
});

describe("TEST-26: a version conflict keeps the device copy", () => {
  for (const policy of ["keepDevice", "useBackup"] as const) {
    it(`leaves the device version untouched under ${policy}`, async () => {
      const src = await makeSource();
      const target = blankDevice(src.device.lib);
      const { envelope } = await exportChecked(src.device.db, target.db);
      expect((await applyRestore(target.db, await planFor(target.db, envelope))).ok).toBe(true);
      await target.db.formulaVersions.update(src.first.version.id, { changeNote: "edited on device" });
      const before = (await target.db.formulaVersions.get(src.first.version.id))!;

      const plan = await planFor(target.db, envelope, "merge", policy);
      expect(plan.versionConflictsKept).toBe(1);
      const result = await applyRestore(target.db, plan, { now: () => NOW1 });
      expect(result.ok).toBe(true);
      const after = (await target.db.formulaVersions.get(src.first.version.id))!;
      expect(canonicalJson(after)).toBe(canonicalJson(before));
    });
  }
});

describe("stale plans", () => {
  async function planned(policy: "keepDevice" | "useBackup" = "keepDevice") {
    const src = await makeSource();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    expect((await applyRestore(target.db, await planFor(target.db, envelope))).ok).toBe(true);
    // Give the plan something to do: the device loses one measurement.
    await target.db.measurements.delete(src.m2.id);
    const plan = await planFor(target.db, envelope, "merge", policy);
    return { src, target, envelope, plan };
  }

  it("refuses when a record the plan skipped as identical is deleted", async () => {
    const { src, target, plan } = await planned();
    await target.db.measurements.delete(src.m1.id);
    const data = await readDeviceData(target.db);
    const meta = await target.layer.meta.get();
    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect(await readDeviceData(target.db)).toEqual(data);
    expect(await target.layer.meta.get()).toEqual(meta);
  });

  it("refuses when the device gets a new version after the plan was made", async () => {
    const { src, target, envelope } = await planned();
    // Make the file's version 2 of Alpha "new" for this device, then plan.
    await target.db.formulaVersions.delete(src.second.version.id);
    const plan = await planFor(target.db, envelope);
    expect(plan.added.formulaVersions).toBe(1);
    await addRevision(target, src.first.formula.id, src.first.version, 900);
    const data = await readDeviceData(target.db);
    const meta = await target.layer.meta.get();
    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect(await readDeviceData(target.db)).toEqual(data);
    expect(await target.layer.meta.get()).toEqual(meta);
  });

  it("refuses under useBackup when an identical material is edited", async () => {
    const { src, target, plan } = await planned("useBackup");
    await target.db.materials.update(src.device.lib.oilIds[0], { name: "Changed" });
    const data = await readDeviceData(target.db);
    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect(await readDeviceData(target.db)).toEqual(data);
  });

  it("still applies when the change does not alter what the plan does", async () => {
    const { src, target, plan } = await planned("keepDevice");
    // An identical material becomes a conflict that keepDevice leaves alone.
    await target.db.materials.update(src.device.lib.oilIds[0], { name: "Changed" });
    const result = await applyRestore(target.db, plan, { now: () => NOW1 });
    expect(result.ok).toBe(true);
    expect((await target.db.materials.get(src.device.lib.oilIds[0]))!.name).toBe("Changed");
    expect(await target.db.measurements.get(src.m2.id)).toBeDefined();
  });

  it("refuses a replace when the device changed after the safety backup", async () => {
    const src = await makeSource();
    const target = await newDevice();
    await addFormula(target, "Local only");
    const { envelope } = await exportChecked(src.device.db, target.db);
    const safetyBackup = await exportBackup(target.db, { now: () => NOW1 });
    const plan = await planFor(target.db, envelope, "replace");
    await addFormula(target, "Added after the backup");
    const data = await readDeviceData(target.db);
    const meta = await target.layer.meta.get();
    const result = await applyRestore(target.db, plan, { safetyBackup, now: () => NOW2 });
    expect(result).toMatchObject({ ok: false, reason: "stale" });
    expect(await readDeviceData(target.db)).toEqual(data);
    expect(await target.layer.meta.get()).toEqual(meta);
  });
});

describe("busy", () => {
  it("lets one of two simultaneous restores run and refuses the other", async () => {
    const src = await makeSource();
    const target = setup();
    const { envelope } = await exportChecked(src.device.db, target.db);
    const plan = await planFor(target.db, envelope);
    const results = await Promise.all([
      applyRestore(target.db, plan, { now: () => NOW1 }),
      applyRestore(target.db, plan, { now: () => NOW1 }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const busy = results.filter((r) => !r.ok);
    expect(busy).toHaveLength(1);
    expect(busy[0]).toMatchObject({ ok: false, reason: "busy" });
    expect(await readDeviceData(target.db)).toEqual(await readDeviceData(src.device.db));
    expect(await counterOf(target.layer)).toBe(1);

    // The slot is released afterwards.
    const later = await applyRestore(target.db, await planFor(target.db, envelope), { now: () => NOW2 });
    expect(later.ok).toBe(true);
  });
});

describe("mismatch", () => {
  it("never reports ok when the counts after commit differ from the plan", async () => {
    const src = await makeSource();
    const target = await newDevice();
    await addFormula(target, "Local only");
    const { envelope } = await exportChecked(src.device.db, target.db);
    const safetyBackup = await exportBackup(target.db, { now: () => NOW1 });
    const plan: RestorePlan = await planFor(target.db, envelope, "replace");
    const wrong: RestorePlan = { ...plan, expectedCounts: { ...plan.expectedCounts, formulas: 99 } };
    const result = await applyRestore(target.db, wrong, { safetyBackup, now: () => NOW2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("mismatch");
    expect(result.detail).toContain("formulas");
    expect(result.detail).toContain("99");
  });
});
