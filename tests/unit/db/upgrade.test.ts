import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDataLayer, openDatabase, SCHEMA_V1, SCHEMA_V2_ADDED, SCHEMA_V3_ADDED, SCHEMA_V4_ADDED } from "@/lib/db";
import type { BackupEnvelope, Batch, CurePlan, ProductionPlan } from "@/lib/types";
import { id, uniqueName } from "./harness";

/**
 * DATA-29: the current schema (version 5, v0.3 lots) must open a v0.1
 * database (version 1), a BatchTrace database (version 2), a CurePilot
 * database (version 3) and a BurnMatrix database (version 4) with every record intact. The v0.1 data is the real v0.1 export in
 * tests/fixtures/backups/good.json, written with the older schemas exactly as
 * those apps declared them (SCHEMA_V1, then SCHEMA_V2_ADDED).
 */
const V1 = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "backups", "good.json"), "utf8"),
) as BackupEnvelope;

const ALL_STORES = [
  "batches",
  "curePlans",
  "drafts",
  "formulaVersions",
  "formulas",
  "materials",
  "measurements",
  "meta",
  "productionPlans",
  "burnSessions",
  "burnPhotos",
  "suppliers",
  "materialLots",
].sort();

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

function fresh(): string {
  const name = uniqueName();
  names.push(name);
  return name;
}

async function seedV1Stores(db: Dexie) {
  await db.table("materials").bulkAdd(V1.data.materials);
  await db.table("formulas").bulkAdd(V1.data.formulas);
  await db.table("formulaVersions").bulkAdd(V1.data.formulaVersions);
  await db.table("measurements").bulkAdd(V1.data.measurements);
  await db.table("drafts").put({ key: "new", baseVersionId: null, fields: { name: "unsaved" }, updatedAt: V1.exportedAt });
  await db.table("meta").bulkPut([
    { key: "changesSinceBackup", value: 3 },
    { key: "exampleOffered", value: true },
  ]);
}

async function makeV1Database(name: string) {
  const v1 = new Dexie(name);
  v1.version(1).stores(SCHEMA_V1);
  await v1.open();
  await seedV1Stores(v1);
  expect(v1.verno).toBe(1);
  v1.close();
}

/** Two batches as the BatchTrace app (schema 2) stored them, one with a label and weights. */
function batchTraceBatches(): Batch[] {
  const version = V1.data.formulaVersions[0]!;
  const wax = version.inputs.waxes[0]!.componentId;
  return [
    {
      id: "aaaaaaaa-0000-4000-8000-000000000001",
      formulaId: version.formulaId,
      versionId: version.id,
      label: "Nov pour",
      producedOn: "2026-11-10",
      entries: [{ componentId: wax, actualMg: 812300 }],
      notes: "Poured at 60 °C",
      createdAt: "2026-11-10T09:00:00.000Z",
      updatedAt: "2026-11-10T09:00:00.000Z",
    },
    {
      id: "aaaaaaaa-0000-4000-8000-000000000002",
      formulaId: version.formulaId,
      versionId: version.id,
      producedOn: "2026-11-12",
      entries: [],
      createdAt: "2026-11-12T09:00:00.000Z",
      updatedAt: "2026-11-12T09:00:00.000Z",
    },
  ];
}

/** A real schema 2 database: the BatchTrace declaration (versions 1 and 2), with batches. */
async function makeV2Database(name: string) {
  const v2 = new Dexie(name);
  v2.version(1).stores(SCHEMA_V1);
  v2.version(2).stores(SCHEMA_V2_ADDED);
  await v2.open();
  await seedV1Stores(v2);
  await v2.table("batches").bulkAdd(batchTraceBatches());
  expect(v2.verno).toBe(2);
  v2.close();
}

/** The version IndexedDB itself reports (Dexie multiplies by 10). */
function rawVersion(name: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => {
      const version = request.result.version;
      request.result.close();
      resolve(version);
    };
    request.onerror = () => reject(request.error);
  });
}

const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

describe("schema upgrade from v0.1 (version 1) to version 5", () => {
  it("keeps every v0.1 record, draft and meta row, and adds empty batches, curePlans and productionPlans", async () => {
    const name = fresh();
    await makeV1Database(name);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name).sort()).toEqual(ALL_STORES);

    expect(byId(await db.materials.toArray())).toEqual(byId(V1.data.materials));
    expect(byId(await db.formulas.toArray())).toEqual(byId(V1.data.formulas));
    expect(byId(await db.formulaVersions.toArray())).toEqual(byId(V1.data.formulaVersions));
    expect(byId(await db.measurements.toArray())).toEqual(byId(V1.data.measurements));
    expect(await db.batches.count()).toBe(0);
    expect(await db.curePlans.count()).toBe(0);
    expect(await db.productionPlans.count()).toBe(0);
    expect((await db.drafts.get("new"))?.fields).toEqual({ name: "unsaved" });

    const layer = createDataLayer(db);
    const meta = await layer.meta.get();
    expect(meta.changesSinceBackup).toBe(3);
    expect(meta.exampleOffered).toBe(true);

    // The upgraded data works with the current layer: list, open, and batch.
    const list = await layer.formulas.list();
    expect(list).toHaveLength(V1.data.formulas.length);
    const version = V1.data.formulaVersions[0]!;
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-18",
      entries: [{ componentId: version.inputs.waxes[0]!.componentId, actualMg: 100000 }],
    });
    expect((await layer.batches.get(batch.id))?.version.id).toBe(version.id);
    db.close();
    expect(await rawVersion(name)).toBe(50);
  });

  it("indexes on the added stores work", async () => {
    const name = fresh();
    await makeV1Database(name);
    const db = openDatabase(name);
    const layer = createDataLayer(db);
    const version = V1.data.formulaVersions[0]!;
    await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-18", entries: [] });
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-01" });
    expect(await layer.batches.listByFormula(version.formulaId)).toHaveLength(1);
    expect(await layer.productionPlans.listByFormula(version.formulaId)).toHaveLength(1);
    expect(await layer.formulas.deletionImpact(version.formulaId)).toMatchObject({ batches: 1, productionPlans: 1 });
    db.close();
  });
});

describe("schema upgrade from BatchTrace (version 2) to version 5", () => {
  it("keeps every record including batches, and adds empty curePlans and productionPlans", async () => {
    const name = fresh();
    await makeV2Database(name);
    expect(await rawVersion(name)).toBe(20);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name).sort()).toEqual(ALL_STORES);

    expect(byId(await db.materials.toArray())).toEqual(byId(V1.data.materials));
    expect(byId(await db.formulas.toArray())).toEqual(byId(V1.data.formulas));
    expect(byId(await db.formulaVersions.toArray())).toEqual(byId(V1.data.formulaVersions));
    expect(byId(await db.measurements.toArray())).toEqual(byId(V1.data.measurements));
    expect(byId(await db.batches.toArray())).toEqual(byId(batchTraceBatches()));
    expect(await db.curePlans.count()).toBe(0);
    expect(await db.productionPlans.count()).toBe(0);
    expect((await db.drafts.get("new"))?.fields).toEqual({ name: "unsaved" });
    db.close();
    expect(await rawVersion(name)).toBe(50);
  });

  it("upgraded batches take a cure plan, keep their batch index, and a planned run becomes a batch", async () => {
    const name = fresh();
    await makeV2Database(name);
    const db = openDatabase(name);
    const layer = createDataLayer(db);
    const [first] = batchTraceBatches();
    const version = V1.data.formulaVersions[0]!;

    const plan = await layer.curePlans.save(first!.id, [
      { kind: "cureEnd", offsetDays: 14 },
      { kind: "burnTest", offsetDays: 3 },
    ]);
    expect(plan.id).toBe(first!.id);
    const schedule = await layer.schedule.read();
    expect(schedule.cure).toHaveLength(1);
    expect(schedule.cure[0]!.batch.producedOn).toBe("2026-11-10");

    expect(await layer.batches.listByFormula(version.formulaId)).toHaveLength(2);

    const planId = id();
    await layer.productionPlans.create({ planId, versionId: version.id, plannedOn: "2026-11-19" });
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-19",
      entries: [],
      productionPlanId: planId,
    });
    expect((await layer.productionPlans.get(planId))?.plan.batchId).toBe(batch.id);
    db.close();
  });
});

/** A cure plan and two planned entries as the CurePilot app (schema 3) stored them. */
function curePilotRecords(): { plan: CurePlan; entries: ProductionPlan[] } {
  const [first] = batchTraceBatches();
  const version = V1.data.formulaVersions[0]!;
  const plan: CurePlan = {
    id: first!.id,
    milestones: [
      { id: "bbbbbbbb-0000-4000-8000-000000000001", kind: "cureEnd", offsetDays: 14, doneOn: null },
      { id: "bbbbbbbb-0000-4000-8000-000000000002", kind: "burnTest", label: "First burn", offsetDays: 3, doneOn: null },
      { id: "bbbbbbbb-0000-4000-8000-000000000003", kind: "check", label: "Look", offsetDays: 7, doneOn: "2026-11-17" },
    ],
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-17T10:00:00.000Z",
  };
  const entries: ProductionPlan[] = [
    {
      id: "cccccccc-0000-4000-8000-000000000001",
      formulaId: version.formulaId,
      versionId: version.id,
      plannedOn: "2026-12-02",
      label: "Holiday run",
      batchId: null,
      createdAt: "2026-11-15T10:00:00.000Z",
      updatedAt: "2026-11-15T10:00:00.000Z",
    },
    {
      id: "cccccccc-0000-4000-8000-000000000002",
      formulaId: version.formulaId,
      versionId: version.id,
      plannedOn: "2026-11-12",
      batchId: batchTraceBatches()[1]!.id,
      createdAt: "2026-11-09T10:00:00.000Z",
      updatedAt: "2026-11-12T10:00:00.000Z",
    },
  ];
  return { plan, entries };
}

/** A real schema 3 database: the CurePilot declaration (versions 1 to 3), with batches, a cure plan and entries. */
async function makeV3Database(name: string) {
  const v3 = new Dexie(name);
  v3.version(1).stores(SCHEMA_V1);
  v3.version(2).stores(SCHEMA_V2_ADDED);
  v3.version(3).stores(SCHEMA_V3_ADDED);
  await v3.open();
  await seedV1Stores(v3);
  await v3.table("batches").bulkAdd(batchTraceBatches());
  const { plan, entries } = curePilotRecords();
  await v3.table("curePlans").add(plan);
  await v3.table("productionPlans").bulkAdd(entries);
  expect(v3.verno).toBe(3);
  v3.close();
}

describe("schema upgrade from CurePilot (version 3) to version 5", () => {
  it("keeps every record including cure plans and planned entries, and adds empty burnSessions and burnPhotos", async () => {
    const name = fresh();
    await makeV3Database(name);
    expect(await rawVersion(name)).toBe(30);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name).sort()).toEqual(ALL_STORES);
    const { plan, entries } = curePilotRecords();
    expect(byId(await db.materials.toArray())).toEqual(byId(V1.data.materials));
    expect(byId(await db.formulas.toArray())).toEqual(byId(V1.data.formulas));
    expect(byId(await db.formulaVersions.toArray())).toEqual(byId(V1.data.formulaVersions));
    expect(byId(await db.measurements.toArray())).toEqual(byId(V1.data.measurements));
    expect(byId(await db.batches.toArray())).toEqual(byId(batchTraceBatches()));
    expect(await db.curePlans.toArray()).toEqual([plan]);
    expect(byId(await db.productionPlans.toArray())).toEqual(byId(entries));
    expect(await db.burnSessions.count()).toBe(0);
    expect(await db.burnPhotos.count()).toBe(0);
    expect((await db.drafts.get("new"))?.fields).toEqual({ name: "unsaved" });
    expect((await db.meta.get("changesSinceBackup"))?.value).toBe(3);
    expect(await db.productionPlans.where("batchId").equals(batchTraceBatches()[1]!.id).count()).toBe(1);
    db.close();
    expect(await rawVersion(name)).toBe(50);
  });

  it("an upgraded batch takes a burn session linked to its planned burn test, and then refuses deletion", async () => {
    const name = fresh();
    await makeV3Database(name);
    const db = openDatabase(name);
    const layer = createDataLayer(db);
    const { plan } = curePilotRecords();
    const burnTest = plan.milestones[1]!;
    const { session } = await layer.burnSessions.create({
      sessionId: id(),
      batchId: plan.id,
      testedOn: "2026-11-13",
      milestoneId: burnTest.id,
      candles: [{ label: "Candle 1", wick: { text: "CD-10" }, burns: [{ durationMin: 240 }] }],
    });
    expect(session.milestoneId).toBe(burnTest.id);
    const after = (await layer.curePlans.get(plan.id))!;
    expect(after.milestones.find((m) => m.id === burnTest.id)!.doneOn).toBe("2026-11-13");
    expect(after.milestones.find((m) => m.kind === "check")!.doneOn).toBe("2026-11-17");
    await expect(layer.batches.delete(plan.id)).rejects.toMatchObject({ code: "in-use" });
    expect((await layer.schedule.read()).cure).toHaveLength(1);
    db.close();
  });
});

/** A burn session and a photo as the BurnMatrix app (schema 4) stored them, on the batch with the cure plan. */
function burnMatrixRecords() {
  const { plan } = curePilotRecords();
  const session = {
    id: "cccccccc-0000-4000-8000-000000000001",
    batchId: plan.id,
    testedOn: "2026-11-13",
    milestoneId: plan.milestones[1]!.id,
    candles: [
      {
        id: "cccccccc-0000-4000-8000-0000000000c1",
        label: "Candle 1",
        wick: { materialId: null, name: "Test wick" },
        burns: [{ id: "cccccccc-0000-4000-8000-0000000000b1", durationMin: 240, weightBeforeMg: 250000, weightAfterMg: 238500 }],
      },
    ],
    conclusion: "Observed a full melt pool at 4 h.",
    createdAt: "2026-11-13T12:00:00.000Z",
    updatedAt: "2026-11-13T12:00:00.000Z",
  };
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
  const photo = {
    id: "cccccccc-0000-4000-8000-0000000000f1",
    sessionId: session.id,
    mimeType: "image/jpeg" as const,
    width: 4,
    height: 3,
    byteLength: bytes.length,
    sha256: "0".repeat(64),
    bytes,
    createdAt: "2026-11-13T12:05:00.000Z",
  };
  return { session, photo };
}

/** A real schema 4 database: the BurnMatrix declaration (versions 1 to 4), with every kind of record. */
async function makeV4Database(name: string) {
  const v4 = new Dexie(name);
  v4.version(1).stores(SCHEMA_V1);
  v4.version(2).stores(SCHEMA_V2_ADDED);
  v4.version(3).stores(SCHEMA_V3_ADDED);
  v4.version(4).stores(SCHEMA_V4_ADDED);
  await v4.open();
  await seedV1Stores(v4);
  await v4.table("batches").bulkAdd(batchTraceBatches());
  const { plan, entries } = curePilotRecords();
  await v4.table("curePlans").add(plan);
  await v4.table("productionPlans").bulkAdd(entries);
  const { session, photo } = burnMatrixRecords();
  await v4.table("burnSessions").add(session);
  await v4.table("burnPhotos").add(photo);
  expect(v4.verno).toBe(4);
  v4.close();
}

describe("schema upgrade from BurnMatrix (version 4) to v0.3 lots (version 5)", () => {
  it("keeps every record including burn sessions and photo bytes, and adds empty suppliers and materialLots", async () => {
    const name = fresh();
    await makeV4Database(name);
    expect(await rawVersion(name)).toBe(40);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(5);
    expect(db.tables.map((t) => t.name).sort()).toEqual(ALL_STORES);
    const { plan, entries } = curePilotRecords();
    const { session, photo } = burnMatrixRecords();
    expect(byId(await db.materials.toArray())).toEqual(byId(V1.data.materials));
    expect(byId(await db.formulas.toArray())).toEqual(byId(V1.data.formulas));
    expect(byId(await db.formulaVersions.toArray())).toEqual(byId(V1.data.formulaVersions));
    expect(byId(await db.measurements.toArray())).toEqual(byId(V1.data.measurements));
    expect(byId(await db.batches.toArray())).toEqual(byId(batchTraceBatches()));
    expect(await db.curePlans.toArray()).toEqual([plan]);
    expect(byId(await db.productionPlans.toArray())).toEqual(byId(entries));
    expect(await db.burnSessions.toArray()).toEqual([session]);
    const stored = (await db.burnPhotos.get(photo.id))!;
    expect({ ...stored, bytes: Array.from(stored.bytes) }).toEqual({ ...photo, bytes: Array.from(photo.bytes) });
    expect(await db.suppliers.count()).toBe(0);
    expect(await db.materialLots.count()).toBe(0);
    expect((await db.drafts.get("new"))?.fields).toEqual({ name: "unsaved" });
    expect((await db.meta.get("changesSinceBackup"))?.value).toBe(3);
    expect(await db.burnSessions.where("milestoneId").equals(session.milestoneId).count()).toBe(1);
    db.close();
    expect(await rawVersion(name)).toBe(50);
  });

  it("an upgraded batch takes lots and keeps its cure plan and burn test; the trace read sees it all", async () => {
    const name = fresh();
    await makeV4Database(name);
    const db = openDatabase(name);
    const layer = createDataLayer(db);
    const [labelled, bare] = batchTraceBatches();
    const version = V1.data.formulaVersions[0]!;
    const waxRow = version.inputs.waxes[0]!;
    const supplier = await layer.suppliers.create({ name: "Example Wax Co" });
    const lot = await layer.materialLots.create({ materialId: waxRow.materialId, supplierId: supplier.id, code: "LOT-TEST-001" });

    // An edit written before v0.3 (no `lots`) still works on an upgraded batch.
    const edited = await layer.batches.update(labelled!.id, {
      producedOn: labelled!.producedOn,
      label: "Nov pour",
      notes: "Poured at 60 °C",
      entries: labelled!.entries,
    });
    expect("lots" in edited).toBe(false);
    const linked = await layer.batches.update(labelled!.id, {
      producedOn: labelled!.producedOn,
      label: "Nov pour",
      entries: labelled!.entries,
      lots: [{ part: "row", componentId: waxRow.componentId, lotId: lot.id }],
    });
    expect(linked.lots).toEqual([
      { part: "row", componentId: waxRow.componentId, lotId: lot.id, lotCode: "LOT-TEST-001", supplierId: supplier.id, supplierName: "Example Wax Co" },
    ]);
    expect(linked.entries).toEqual(labelled!.entries);

    const trace = await layer.batchTrace.read();
    const byBatch = new Map(trace.items.map((item) => [item.batch.id, item]));
    // The cure plan and the burn test are on the first (labelled) batch.
    expect(byBatch.get(labelled!.id)).toMatchObject({ hasCurePlan: true, burnTestCount: 1 });
    expect(byBatch.get(bare!.id)).toMatchObject({ hasCurePlan: false, burnTestCount: 0, lots: [] });
    expect(byBatch.get(labelled!.id)!.lots[0]!.lot?.id).toBe(lot.id);
    await expect(layer.materialLots.delete(lot.id)).rejects.toMatchObject({ code: "in-use" });
    db.close();
  });
});
