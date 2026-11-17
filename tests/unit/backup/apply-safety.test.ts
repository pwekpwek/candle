import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { applyRestore, exportBackup, readDeviceData } from "@/lib/backup";
import type { DataStoreName } from "@/lib/types";
import { counterOf, setup } from "../db/harness";
import type { Device } from "./apply-harness";
import {
  addFormula,
  addMeasurement,
  addRevision,
  blankDevice,
  exportChecked,
  makeSource,
  newDevice,
  planFor,
} from "./apply-harness";

const NOW1 = "2026-11-17T10:00:00.000Z";
const NOW2 = "2026-11-17T11:00:00.000Z";

/** Everything a failed restore must leave exactly as it was. */
async function snapshot(device: Pick<Device, "db" | "layer">) {
  return {
    data: await readDeviceData(device.db),
    meta: await device.layer.meta.get(),
    metaRows: await device.db.meta.toArray(),
    drafts: await device.db.drafts.toArray(),
  };
}

function throwAfter(store: DataStoreName) {
  return (written: DataStoreName) => {
    if (written === store) throw new Error(`interrupted after ${store}`);
  };
}

describe("TEST-24: interrupted import", () => {
  it("merge: a failure after formulas leaves data and meta exactly as before", async () => {
    const src = await makeSource();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    const plan = await planFor(target.db, envelope);
    const before = await snapshot(target);

    const result = await applyRestore(target.db, plan, {
      now: () => NOW1,
      afterStoreWritten: throwAfter("formulas"),
    });
    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(await snapshot(target)).toEqual(before);
    expect((await target.layer.meta.get()).lastRestoreAt).toBeNull();

    // The same plan still applies afterwards.
    const again = await applyRestore(target.db, plan, { now: () => NOW2 });
    expect(again.ok).toBe(true);
    expect(await readDeviceData(target.db)).toEqual(await readDeviceData(src.device.db));
  });

  it("merge: a failure after the very first store also rolls back", async () => {
    const src = await makeSource();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db);
    const plan = await planFor(target.db, envelope);
    const before = await snapshot(target);
    const result = await applyRestore(target.db, plan, { afterStoreWritten: throwAfter("materials") });
    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(await snapshot(target)).toEqual(before);
  });

  it("replace: a failure after formulaVersions restores the cleared device", async () => {
    const src = await makeSource();
    const target = await newDevice();
    const local = await addFormula(target, "Local only");
    await addMeasurement(target, local.formula.id, local.version.id);
    const { envelope } = await exportChecked(src.device.db, target.db);
    const safetyBackup = await exportBackup(target.db, { now: () => NOW1 });
    const plan = await planFor(target.db, envelope, "replace");
    const before = await snapshot(target);

    const result = await applyRestore(target.db, plan, {
      safetyBackup,
      now: () => NOW2,
      afterStoreWritten: throwAfter("formulaVersions"),
    });
    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(await snapshot(target)).toEqual(before);
  });

  it("replace: a bulkPut that fails (duplicate [formulaId+number]) rolls back the clear", async () => {
    const src = await makeSource();
    const target = await newDevice();
    await addFormula(target, "Local only");
    const { envelope } = await exportChecked(src.device.db, target.db);
    // Alpha has two versions in the file; give them the same number.
    const broken = structuredClone(envelope);
    const alpha = broken.data.formulaVersions.filter((v) => v.formulaId === src.first.formula.id);
    expect(alpha).toHaveLength(2);
    alpha[1].number = alpha[0].number;
    const safetyBackup = await exportBackup(target.db, { now: () => NOW1 });
    const plan = await planFor(target.db, broken, "replace");
    const before = await snapshot(target);

    const result = await applyRestore(target.db, plan, { safetyBackup, now: () => NOW2 });
    expect(result).toMatchObject({ ok: false, reason: "storage" });
    expect(await snapshot(target)).toEqual(before);
  });
});

describe("TEST-25: replace everything", () => {
  it("leaves exactly the file's data, and a later export has the same data and checksum", async () => {
    const src = await makeSource();
    const target = await newDevice();
    const local = await addFormula(target, "Local only");
    await addRevision(target, local.formula.id, local.version, 600);
    await addMeasurement(target, local.formula.id, local.version.id);

    const { envelope } = await exportChecked(src.device.db, target.db);
    const safetyBackup = await exportBackup(target.db, { now: () => NOW1 });
    expect(await counterOf(target.layer)).toBe(0);
    const plan = await planFor(target.db, envelope, "replace");
    expect(plan.clear).toBe(true);

    const result = await applyRestore(target.db, plan, { safetyBackup, now: () => NOW2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts).toEqual(plan.expectedCounts);

    expect(await readDeviceData(target.db)).toEqual(envelope.data);
    // Nothing of the old device remains.
    expect(await target.db.formulas.get(local.formula.id)).toBeUndefined();
    expect(await target.db.formulaVersions.get(local.version.id)).toBeUndefined();

    const meta = await target.layer.meta.get();
    expect(meta.lastRestoreAt).toBe(NOW2);
    expect(meta.changesSinceBackup).toBe(1);

    const later = await exportBackup(target.db, { now: () => "2026-11-18T00:00:00.000Z" });
    expect(later.envelope.data).toEqual(envelope.data);
    expect(later.envelope.checksum).toEqual(envelope.checksum);
  });

  it("replaces an empty file's worth: restoring an empty backup empties the device", async () => {
    const empty = setup();
    const target = await newDevice();
    await addFormula(target, "Local only");
    const { envelope } = await exportChecked(empty.db, target.db);
    const safetyBackup = await exportBackup(target.db, { now: () => NOW1 });
    const plan = await planFor(target.db, envelope, "replace");
    const result = await applyRestore(target.db, plan, { safetyBackup, now: () => NOW2 });
    expect(result.ok).toBe(true);
    expect(await target.db.formulas.count()).toBe(0);
    expect(await target.db.materials.count()).toBe(0);
  });

  it("refuses without a safety backup and changes nothing", async () => {
    const src = await makeSource();
    const target = await newDevice();
    await addFormula(target, "Local only");
    const { envelope } = await exportChecked(src.device.db, target.db);
    const plan = await planFor(target.db, envelope, "replace");
    const before = await snapshot(target);
    const result = await applyRestore(target.db, plan, { now: () => NOW2 });
    expect(result).toMatchObject({ ok: false, reason: "no-safety" });
    expect(await snapshot(target)).toEqual(before);
    expect(await applyRestore(target.db, plan)).toMatchObject({ ok: false, reason: "no-safety" });
    expect(await snapshot(target)).toEqual(before);
  });
});
