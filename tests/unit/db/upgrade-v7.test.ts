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
  SCHEMA_V6_ADDED,
  createDataLayer,
  openDatabase,
} from "@/lib/db";
import type { BackupData } from "@/lib/types";
import { id, makeClock, makeLibrary, newFormulaRequest, revisionRequest, setup, uniqueName, we5Input } from "./harness";

/**
 * v0.3 TrueCandle Cost, DATA-29: a schema 6 database (the CandleFix app,
 * IndexedDB version 60) opens with schema 7 with every record intact, drafts
 * and meta included, and two empty cost stores. The schema 6 database is
 * declared exactly as that app declared it (SCHEMA_V1 to SCHEMA_V6_ADDED) and
 * filled through the data layer: formulas and a revision, a measurement,
 * batches with lots, a cure plan, a planned entry, a burn test with a photo,
 * suppliers, lots, an investigation with a photo, and a corrective experiment.
 * Generated data only.
 */

const V6_STORES = [
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
  "investigations",
  "investigationPhotos",
  "correctiveExperiments",
] as const;

const PHOTO_STORES = new Set(["burnPhotos", "investigationPhotos"]);

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

function fakeJpeg(size = 96, seed = 3): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * seed) % 256;
  return bytes;
}

/** A rich dataset as the CandleFix app could hold it, in backup form (no prices, no counts). */
async function richData(): Promise<BackupData> {
  const { db, layer } = setup();
  const lib = await makeLibrary(layer);
  const { version } = await layer.versions.save(newFormulaRequest(we5Input(lib)));
  const { version: v2 } = await layer.versions.save(revisionRequest(version.formulaId, version.id, we5Input(lib, { fragranceBp: 900 })));
  const wax = version.inputs.waxes[0]!.componentId;
  await layer.measurements.saveEntries(version.id, [{ componentId: wax, actualMg: 1_000_100 }]);
  const supplier = await layer.suppliers.create({ name: "Test Supplier Co" });
  const lot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: supplier.id, code: "UPG-WAX-1" });
  const { batch } = await layer.batches.create({
    batchId: id(), versionId: version.id, producedOn: "2026-11-10", label: "UPG-1",
    entries: [{ componentId: wax, actualMg: 1_000_000 }],
    lots: [{ part: "row", componentId: wax, lotId: lot.id }],
  });
  const { batch: followUp } = await layer.batches.create({ batchId: id(), versionId: v2.id, producedOn: "2026-11-20", entries: [] });
  await layer.curePlans.save(batch.id, [{ kind: "cureEnd", offsetDays: 14 }, { kind: "burnTest", offsetDays: 7 }]);
  await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-01" });
  const { session } = await layer.burnSessions.create({
    sessionId: id(), batchId: batch.id, testedOn: "2026-11-18", milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 120, weightBeforeMg: 250_000, weightAfterMg: 241_000 }] }],
  });
  await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: fakeJpeg(), width: 6, height: 4 });
  const { investigation } = await layer.investigations.create({
    investigationId: id(), batchId: batch.id, observedOn: "2026-11-19", issues: ["tunneling"], checks: [],
    hypotheses: [{ text: "First burn too short", status: "open" }],
  });
  await layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: fakeJpeg(80, 5), width: 5, height: 5 });
  await layer.correctiveExperiments.create({
    experimentId: id(), investigationId: investigation.id, hypothesisId: investigation.hypotheses[0]!.id,
    followUpBatchId: followUp.id, burnSessionIds: [],
  });
  const data = (await exportBackup(db)).envelope.data;
  expect(data.investigations).toHaveLength(1);
  expect(data.investigationPhotos).toHaveLength(1);
  expect(data.correctiveExperiments).toHaveLength(1);
  return data;
}

async function makeV6Database(name: string, data: BackupData) {
  const v6 = new Dexie(name);
  v6.version(1).stores(SCHEMA_V1);
  v6.version(2).stores(SCHEMA_V2_ADDED);
  v6.version(3).stores(SCHEMA_V3_ADDED);
  v6.version(4).stores(SCHEMA_V4_ADDED);
  v6.version(5).stores(SCHEMA_V5_ADDED);
  v6.version(6).stores(SCHEMA_V6_ADDED);
  await v6.open();
  for (const store of V6_STORES) {
    const rows = PHOTO_STORES.has(store)
      ? (data[store] as Parameters<typeof photoFromBackup>[0][]).map(photoFromBackup)
      : (data[store] as unknown[]);
    await v6.table(store).bulkAdd(rows);
  }
  await v6.table("drafts").put({ key: "new", baseVersionId: null, fields: { name: "unsaved" }, updatedAt: "2026-11-20T08:00:00.000Z" });
  await v6.table("meta").bulkPut([
    { key: "changesSinceBackup", value: 9 },
    { key: "exampleOffered", value: true },
  ]);
  expect(v6.verno).toBe(6);
  expect(v6.tables.map((t) => t.name).sort()).toEqual([...V6_STORES, "drafts", "meta"].sort());
  v6.close();
}

describe("schema 6 (CandleFix) to schema 7 (TrueCandle Cost)", () => {
  it("keeps every record, photo byte, draft and meta row, and adds two empty stores", async () => {
    const data = await richData();
    const name = uniqueName();
    names.push(name);
    await makeV6Database(name, data);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(7);
    expect(db.tables.map((t) => t.name).sort()).toEqual([...V6_STORES, "costItems", "costSheets", "drafts", "meta"].sort());
    const after = await readDeviceData(db);
    for (const store of V6_STORES) {
      expect(canonicalJson(after[store]), store).toBe(canonicalJson(data[store]));
    }
    expect(after.costItems).toEqual([]);
    expect(after.costSheets).toEqual([]);
    expect(await db.table("drafts").get("new")).toMatchObject({ fields: { name: "unsaved" } });
    expect((await db.table("meta").get("changesSinceBackup"))?.value).toBe(9);
    expect((await db.table("meta").get("exampleOffered"))?.value).toBe(true);

    // The upgraded batch takes candle counts and a cost sheet, and is then protected by the new rule.
    const layer = createDataLayer(db, { now: makeClock(Date.UTC(2026, 10, 29)) });
    const batch = data.batches.find((b) => b.label === "UPG-1")!;
    const updated = await layer.batches.update(batch.id, { producedOn: batch.producedOn, entries: batch.entries, candlesMade: 6, sellable: 5 });
    expect(updated.lots).toEqual(batch.lots);
    const { sheet } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id } });
    expect(sheet).toMatchObject({ candlesMade: 6, sellable: 5, versionId: batch.versionId });
    expect(sheet.materials[0]).toMatchObject({ quantity: { mg: 1_000_000, from: "measured" }, price: { source: "none" } });
    expect(await layer.batches.deletionImpact(batch.id)).toMatchObject({ burnSessions: 1, investigations: 1, costSheets: 1 });
    // The schema 6 records other than the edited batch are unchanged.
    const later = await readDeviceData(db);
    for (const store of V6_STORES.filter((s) => s !== "batches")) {
      expect(canonicalJson(later[store]), store).toBe(canonicalJson(data[store]));
    }
    db.close();
  });

  it("an empty schema 6 database upgrades too", async () => {
    const name = uniqueName();
    names.push(name);
    await makeV6Database(name, {
      materials: [], formulas: [], formulaVersions: [], measurements: [], batches: [], curePlans: [],
      productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [],
      investigations: [], investigationPhotos: [], correctiveExperiments: [], costItems: [], costSheets: [],
    });
    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(7);
    expect(await db.costSheets.count()).toBe(0);
    expect(await db.costItems.count()).toBe(0);
    db.close();
  });
});
