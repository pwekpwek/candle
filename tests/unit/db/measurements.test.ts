import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDataLayer, DataError } from "@/lib/db";
import {
  counterOf,
  id,
  makeClock,
  makeLibrary,
  newFormulaRequest,
  openTestDb,
  revisionRequest,
  setup,
  we5Input,
} from "./harness";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

async function saved() {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  const result = await ctx.layer.versions.save(newFormulaRequest(we5Input(lib)));
  return {
    ...ctx,
    lib,
    ...result,
    wax: result.version.inputs.waxes[0].componentId,
    o1: result.version.inputs.oils[0].componentId,
    o2: result.version.inputs.oils[1].componentId,
  };
}

describe("TEST-17 measurements", () => {
  it("creates, replaces and clears entries, and never touches the version", async () => {
    const { layer, db, version, formula, wax, o1, o2 } = await saved();
    const versionBefore = JSON.stringify(await db.formulaVersions.get(version.id));
    const formulaBefore = JSON.stringify(await db.formulas.get(formula.id));
    expect(await layer.measurements.getForVersion(version.id)).toBeUndefined();

    const counter = await counterOf(layer);
    const created = await layer.measurements.saveEntries(version.id, [
      { componentId: wax, actualMg: 1003200 },
      { componentId: o1, actualMg: 40000 },
    ]);
    expect(created).toMatchObject({ formulaId: formula.id, versionId: version.id });
    expect(created.createdAt).toBe(created.updatedAt);
    expect(await counterOf(layer)).toBe(counter + 1);

    const replaced = await layer.measurements.saveEntries(version.id, [
      { componentId: o2, actualMg: 0 },
    ]);
    expect(replaced.id).toBe(created.id);
    expect(replaced.createdAt).toBe(created.createdAt);
    expect(replaced.updatedAt > created.updatedAt).toBe(true);
    expect(replaced.entries).toEqual([{ componentId: o2, actualMg: 0 }]);
    expect(await counterOf(layer)).toBe(counter + 2);

    const cleared = await layer.measurements.saveEntries(version.id, []);
    expect(cleared.id).toBe(created.id);
    expect(cleared.entries).toEqual([]);
    expect(await db.measurements.count()).toBe(1);
    expect(await layer.measurements.getForVersion(version.id)).toEqual(cleared);

    expect(JSON.stringify(await db.formulaVersions.get(version.id))).toBe(versionBefore);
    expect(JSON.stringify(await db.formulas.get(formula.id))).toBe(formulaBefore);
  });

  it("rejects unknown and repeated component ids and unknown versions, writing nothing", async () => {
    const { layer, db, version, wax } = await saved();
    const counter = await counterOf(layer);
    expect(
      await code(layer.measurements.saveEntries(version.id, [{ componentId: id(), actualMg: 1 }])),
    ).toBe("invalid");
    expect(
      await code(
        layer.measurements.saveEntries(version.id, [
          { componentId: wax, actualMg: 1 },
          { componentId: wax, actualMg: 2 },
        ]),
      ),
    ).toBe("invalid");
    expect(
      await code(layer.measurements.saveEntries(version.id, [{ componentId: wax, actualMg: -1 }])),
    ).toBe("invalid");
    expect(await code(layer.measurements.saveEntries(id(), []))).toBe("not-found");
    expect(await db.measurements.count()).toBe(0);
    expect(await counterOf(layer)).toBe(counter);
  });

  it("survives closing and reopening the database", async () => {
    const { layer, db, version, formula, wax } = await saved();
    await layer.measurements.saveEntries(version.id, [{ componentId: wax, actualMg: 1003200 }]);
    const name = db.name;
    db.close();
    const reopened = openTestDb(name);
    const again = createDataLayer(reopened, { now: makeClock() });
    const found = await again.measurements.getForVersion(version.id);
    expect(found?.entries).toEqual([{ componentId: wax, actualMg: 1003200 }]);
    expect((await again.measurements.listByFormula(formula.id)).map((m) => m.id)).toEqual([
      found?.id,
    ]);
  });

  it("uses the earliest record when several exist and lists oldest first", async () => {
    const { layer, db, version, formula, wax } = await saved();
    const base = {
      formulaId: formula.id,
      versionId: version.id,
      entries: [],
      updatedAt: "2026-11-12T00:00:00.000Z",
    };
    const late = { ...base, id: id(), createdAt: "2026-11-12T00:00:00.000Z" };
    const early = { ...base, id: id(), createdAt: "2026-11-11T00:00:00.000Z" };
    await db.measurements.bulkAdd([late, early]);
    expect((await layer.measurements.getForVersion(version.id))?.id).toBe(early.id);
    expect((await layer.measurements.listByFormula(formula.id)).map((m) => m.id)).toEqual([
      early.id,
      late.id,
    ]);
    const result = await layer.measurements.saveEntries(version.id, [
      { componentId: wax, actualMg: 5 },
    ]);
    expect(result.id).toBe(early.id);
    expect((await db.measurements.get(late.id))?.entries).toEqual([]);
  });
});

describe("TEST-18 permanent delete after real data", () => {
  it("removes the formula, versions, measurements and draft, and leaves another formula alone", async () => {
    const { layer, db, lib, version, formula, wax } = await saved();
    const other = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    await layer.measurements.saveEntries(version.id, [{ componentId: wax, actualMg: 1 }]);
    await layer.measurements.saveEntries(other.version.id, [
      { componentId: other.version.inputs.waxes[0].componentId, actualMg: 2 },
    ]);
    const second = await layer.versions.save(
      revisionRequest(formula.id, version.id, we5Input(lib)),
    );
    await layer.drafts.put(formula.id, second.version.id, {
      name: "d",
      sizingMode: "total",
      amount: "",
      vesselCount: "",
      fillWeight: "",
      fragrancePct: "",
      basis: "wax",
      precisionMg: 100,
      waxes: [],
      oils: [],
      wickId: null,
      vesselId: null,
      notes: "",
      changeNote: "",
    });

    expect(await layer.formulas.deletionImpact(formula.id)).toEqual({
      versions: 2,
      measurements: 1,
    });
    await layer.formulas.deletePermanently(formula.id);

    expect(await db.formulas.get(formula.id)).toBeUndefined();
    expect(await db.formulaVersions.where("formulaId").equals(formula.id).count()).toBe(0);
    expect(await db.measurements.where("formulaId").equals(formula.id).count()).toBe(0);
    expect(await layer.drafts.get(formula.id)).toBeUndefined();

    expect(await db.formulas.get(other.formula.id)).toBeDefined();
    expect(await db.formulaVersions.get(other.version.id)).toEqual(other.version);
    expect(await db.measurements.where("formulaId").equals(other.formula.id).count()).toBe(1);
  });
});
