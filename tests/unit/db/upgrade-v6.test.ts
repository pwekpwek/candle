import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalJson, exportBackup, readDeviceData } from "@/lib/backup";
import { photoFromBackup } from "@/lib/backup/photos";
import {
  SCHEMA_V1,
  SCHEMA_V2_ADDED,
  SCHEMA_V3_ADDED,
  SCHEMA_V4_ADDED,
  SCHEMA_V5_ADDED,
  createDataLayer,
  openDatabase,
} from "@/lib/db";
import type { BackupData } from "@/lib/types";
import { id, makeClock, makeLibrary, newFormulaRequest, setup, uniqueName, we5Input } from "./harness";

/**
 * v0.3 CandleFix, DATA-29: a schema 5 database (the v0.3 lots app, IndexedDB
 * version 50) opens with schema 6 with every record intact, drafts and meta
 * included, and three empty CandleFix stores. The schema 5 database is
 * declared exactly as that app declared it (SCHEMA_V1 to SCHEMA_V5_ADDED) and
 * filled with a rich dataset made through the data layer: formulas,
 * revisions, measurements, batches with lots, a cure plan, a planned entry, a
 * burn test with a photo, suppliers and lots. Generated data only.
 */

const V5_STORES = [
  "materials",
  "formulas",
  "formulaVersions",
  "measurements",
  "batches",
  "curePlans",
  "productionPlans",
  "burnSessions",
  "burnPhotos",
  "suppliers",
  "materialLots",
] as const;

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

function fakeJpeg(size = 96): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * 3) % 256;
  return bytes;
}

/** A rich dataset as the v0.3 lots app could hold it, in backup form. */
async function richData(): Promise<BackupData> {
  const { db, layer } = setup();
  const lib = await makeLibrary(layer);
  const { version } = await layer.versions.save(newFormulaRequest(we5Input(lib)));
  await layer.measurements.saveEntries(version.id, [{ componentId: version.inputs.waxes[0]!.componentId, actualMg: 1_000_100 }]);
  const supplier = await layer.suppliers.create({ name: "Test Supplier Co" });
  const lot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: supplier.id, code: "UPG-WAX-1" });
  const { batch } = await layer.batches.create({
    batchId: id(),
    versionId: version.id,
    producedOn: "2026-11-10",
    label: "UPG-1",
    entries: [],
    lots: [{ part: "row", componentId: version.inputs.waxes[0]!.componentId, lotId: lot.id }],
  });
  await layer.curePlans.save(batch.id, [{ kind: "cureEnd", offsetDays: 14 }, { kind: "burnTest", offsetDays: 7 }]);
  await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-01" });
  const { session } = await layer.burnSessions.create({
    sessionId: id(),
    batchId: batch.id,
    testedOn: "2026-11-18",
    milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 120, weightBeforeMg: 250_000, weightAfterMg: 241_000 }] }],
  });
  await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(), width: 6, height: 4 });
  const data = (await exportBackup(db)).envelope.data;
  expect(data.batches[0]!.lots).toHaveLength(1);
  expect(data.burnPhotos).toHaveLength(1);
  return data;
}

async function makeV5Database(name: string, data: BackupData) {
  const v5 = new Dexie(name);
  v5.version(1).stores(SCHEMA_V1);
  v5.version(2).stores(SCHEMA_V2_ADDED);
  v5.version(3).stores(SCHEMA_V3_ADDED);
  v5.version(4).stores(SCHEMA_V4_ADDED);
  v5.version(5).stores(SCHEMA_V5_ADDED);
  await v5.open();
  for (const store of V5_STORES) {
    const rows = store === "burnPhotos" ? data.burnPhotos.map(photoFromBackup) : (data[store] as unknown[]);
    await v5.table(store).bulkAdd(rows);
  }
  await v5.table("drafts").put({ key: "new", baseVersionId: null, fields: { name: "unsaved" }, updatedAt: "2026-11-20T08:00:00.000Z" });
  await v5.table("meta").bulkPut([
    { key: "changesSinceBackup", value: 7 },
    { key: "exampleOffered", value: true },
  ]);
  expect(v5.verno).toBe(5);
  expect(v5.tables.map((t) => t.name).sort()).toEqual([...V5_STORES, "drafts", "meta"].sort());
  v5.close();
}

describe("schema 5 (v0.3 lots) to schema 6 (CandleFix)", () => {
  it("keeps every record, photo byte, draft and meta row, and adds three empty stores", async () => {
    const data = await richData();
    const name = uniqueName();
    names.push(name);
    await makeV5Database(name, data);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(7);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      [...V5_STORES, "investigations", "investigationPhotos", "correctiveExperiments", "costItems", "costSheets", "drafts", "meta"].sort(),
    );
    const after = await readDeviceData(db);
    for (const store of V5_STORES) {
      expect(canonicalJson(after[store]), store).toBe(canonicalJson(data[store]));
    }
    expect(after.investigations).toEqual([]);
    expect(after.investigationPhotos).toEqual([]);
    expect(after.correctiveExperiments).toEqual([]);
    expect(await db.table("drafts").get("new")).toMatchObject({ fields: { name: "unsaved" } });
    expect((await db.table("meta").get("changesSinceBackup"))?.value).toBe(7);

    // The upgraded batch takes an investigation, and is then protected by the new delete rule.
    const layer = createDataLayer(db, { now: makeClock(Date.UTC(2026, 10, 28)) });
    const batch = data.batches[0]!;
    const { investigation } = await layer.investigations.create({
      investigationId: id(),
      batchId: batch.id,
      observedOn: "2026-11-19",
      issues: ["tunneling"],
      checks: [],
      hypotheses: [{ text: "First burn too short", status: "open" }],
    });
    expect((await layer.investigations.get(investigation.id))?.version.id).toBe(batch.versionId);
    expect(await layer.batches.deletionImpact(batch.id)).toMatchObject({ burnSessions: 1, investigations: 1 });
    db.close();
  });

  it("an empty schema 5 database upgrades too", async () => {
    const name = uniqueName();
    names.push(name);
    await makeV5Database(name, {
      materials: [], formulas: [], formulaVersions: [], measurements: [], batches: [], curePlans: [],
      productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [],
      investigations: [], investigationPhotos: [], correctiveExperiments: [], costItems: [], costSheets: [],
    });
    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(7);
    expect(await db.investigations.count()).toBe(0);
    db.close();
  });
});
