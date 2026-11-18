import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { createDataLayer, openDatabase, SCHEMA_V1 } from "@/lib/db";
import type { BackupEnvelope } from "@/lib/types";
import { id, uniqueName } from "./harness";

/**
 * DATA-29: the v0.2 schema (version 2) must open a v0.1 database (version 1)
 * with every record intact. The v0.1 data is the real v0.1 export in
 * tests/fixtures/backups/good.json, written with the v0.1 schema exactly as
 * the v0.1 app declared it.
 */
const V1 = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "backups", "good.json"), "utf8"),
) as BackupEnvelope;

const names: string[] = [];
afterEach(async () => {
  for (const name of names.splice(0)) await Dexie.delete(name);
});

async function makeV1Database(name: string) {
  const v1 = new Dexie(name);
  v1.version(1).stores(SCHEMA_V1);
  await v1.open();
  await v1.table("materials").bulkAdd(V1.data.materials);
  await v1.table("formulas").bulkAdd(V1.data.formulas);
  await v1.table("formulaVersions").bulkAdd(V1.data.formulaVersions);
  await v1.table("measurements").bulkAdd(V1.data.measurements);
  await v1.table("drafts").put({ key: "new", baseVersionId: null, fields: { name: "unsaved" }, updatedAt: V1.exportedAt });
  await v1.table("meta").bulkPut([
    { key: "changesSinceBackup", value: 3 },
    { key: "exampleOffered", value: true },
  ]);
  expect(v1.verno).toBe(1);
  v1.close();
}

describe("schema upgrade from v0.1 (version 1) to v0.2 (version 2)", () => {
  it("keeps every v0.1 record, draft and meta row, and adds an empty batches store", async () => {
    const name = uniqueName();
    names.push(name);
    await makeV1Database(name);

    const db = openDatabase(name);
    await db.open();
    expect(db.verno).toBe(2);
    expect(db.tables.map((t) => t.name).sort()).toEqual(
      ["batches", "drafts", "formulaVersions", "formulas", "materials", "measurements", "meta"].sort(),
    );

    const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));
    expect(byId(await db.materials.toArray())).toEqual(byId(V1.data.materials));
    expect(byId(await db.formulas.toArray())).toEqual(byId(V1.data.formulas));
    expect(byId(await db.formulaVersions.toArray())).toEqual(byId(V1.data.formulaVersions));
    expect(byId(await db.measurements.toArray())).toEqual(byId(V1.data.measurements));
    expect(await db.batches.count()).toBe(0);
    expect((await db.drafts.get("new"))?.fields).toEqual({ name: "unsaved" });

    const layer = createDataLayer(db);
    const meta = await layer.meta.get();
    expect(meta.changesSinceBackup).toBe(3);
    expect(meta.exampleOffered).toBe(true);

    // The upgraded data works with the v0.2 layer: list, open, and batch.
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
  });

  it("indexes on the new store work (formulaId lookups)", async () => {
    const name = uniqueName();
    names.push(name);
    await makeV1Database(name);
    const db = openDatabase(name);
    const layer = createDataLayer(db);
    const version = V1.data.formulaVersions[0]!;
    await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-18", entries: [] });
    expect(await layer.batches.listByFormula(version.formulaId)).toHaveLength(1);
    expect(await layer.formulas.deletionImpact(version.formulaId)).toMatchObject({ batches: 1 });
    db.close();
  });
});
