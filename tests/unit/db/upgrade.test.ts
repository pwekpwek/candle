import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDataLayer, openDatabase, SCHEMA_V1, SCHEMA_V2_ADDED } from "@/lib/db";
import type { BackupEnvelope, Batch } from "@/lib/types";
import { id, uniqueName } from "./harness";

/**
 * DATA-29: the current schema (version 3, CurePilot) must open a v0.1
 * database (version 1) and a BatchTrace database (version 2) with every
 * record intact. The v0.1 data is the real v0.1 export in
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

describe("schema upgrade from v0.1 (version 1) to version 3", () => {
  it("keeps every v0.1 record, draft and meta row, and adds empty batches, curePlans and productionPlans", async () => {
    const name = fresh();
    await makeV1Database(name);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(3);
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
    expect(await rawVersion(name)).toBe(30);
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

describe("schema upgrade from BatchTrace (version 2) to CurePilot (version 3)", () => {
  it("keeps every record including batches, and adds empty curePlans and productionPlans", async () => {
    const name = fresh();
    await makeV2Database(name);
    expect(await rawVersion(name)).toBe(20);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(3);
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
    expect(await rawVersion(name)).toBe(30);
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
