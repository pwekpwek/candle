import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import {
  counterOf,
  id,
  makeLibrary,
  newFormulaRequest,
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

/** A WE-5 formula saved through the real version save, with its library. */
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

describe("BatchTrace: create a batch from a saved version", () => {
  it("creates two batches from one version with unique ids, the exact source link, and their own dates and weights", async () => {
    const { layer, db, formula, version, wax, o1 } = await saved();
    const versionBefore = JSON.stringify(await db.formulaVersions.get(version.id));
    const counter = await counterOf(layer);

    const a = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      label: "  LV-01 ",
      entries: [{ componentId: wax, actualMg: 1003200 }],
    });
    const b = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-17",
      entries: [
        { componentId: wax, actualMg: 998700 },
        { componentId: o1, actualMg: 40100 },
      ],
      notes: "  second pour  ",
    });

    expect(a.created).toBe(true);
    expect(b.created).toBe(true);
    expect(a.batch.id).not.toBe(b.batch.id);
    for (const { batch } of [a, b]) {
      expect(batch.formulaId).toBe(formula.id);
      expect(batch.versionId).toBe(version.id);
    }
    expect(a.batch).toMatchObject({ label: "LV-01", producedOn: "2026-11-16" });
    expect(a.batch.notes).toBeUndefined();
    expect(b.batch).toMatchObject({ producedOn: "2026-11-17", notes: "second pour" });
    expect("label" in b.batch).toBe(false);
    expect(b.batch.entries).toEqual([
      { componentId: wax, actualMg: 998700 },
      { componentId: o1, actualMg: 40100 },
    ]);
    expect(await counterOf(layer)).toBe(counter + 2);

    // Reopen: a fresh read from the stores, as after a reload.
    const reread = await layer.batches.get(a.batch.id);
    expect(reread?.batch).toEqual(a.batch);
    expect(reread?.version.id).toBe(version.id);
    expect(reread?.formula.id).toBe(formula.id);

    // Latest production date first.
    const list = await layer.batches.list();
    expect(list.map((item) => item.batch.id)).toEqual([b.batch.id, a.batch.id]);
    expect((await layer.batches.listByFormula(formula.id)).map((x) => x.id)).toEqual([
      b.batch.id,
      a.batch.id,
    ]);

    // The version is never touched (DATA-02, DATA-08).
    expect(JSON.stringify(await db.formulaVersions.get(version.id))).toBe(versionBefore);
  });

  it("is idempotent on the batch id: a retry writes nothing", async () => {
    const { layer, version } = await saved();
    const batchId = id();
    const first = await layer.batches.create({ batchId, versionId: version.id, producedOn: "2026-11-16", entries: [] });
    const counter = await counterOf(layer);
    const again = await layer.batches.create({ batchId, versionId: version.id, producedOn: "2026-11-30", entries: [] });
    expect(again.created).toBe(false);
    expect(again.batch).toEqual(first.batch);
    expect(await counterOf(layer)).toBe(counter);
    expect(await layer.batches.list()).toHaveLength(1);
  });

  it("refuses a missing version, a bad date, a long label and unknown or repeated components, writing nothing", async () => {
    const { layer, version, wax } = await saved();
    const counter = await counterOf(layer);
    const base = { versionId: version.id, producedOn: "2026-11-16", entries: [] };
    expect(await code(layer.batches.create({ ...base, batchId: id(), versionId: id() }))).toBe("not-found");
    expect(await code(layer.batches.create({ ...base, batchId: id(), producedOn: "16/11/2026" }))).toBe("invalid");
    expect(await code(layer.batches.create({ ...base, batchId: id(), producedOn: "2026-02-30" }))).toBe("invalid");
    expect(await code(layer.batches.create({ ...base, batchId: id(), label: "x".repeat(41) }))).toBe("invalid");
    expect(
      await code(layer.batches.create({ ...base, batchId: id(), entries: [{ componentId: "nope", actualMg: 1 }] })),
    ).toBe("invalid");
    expect(
      await code(
        layer.batches.create({
          ...base,
          batchId: id(),
          entries: [
            { componentId: wax, actualMg: 1 },
            { componentId: wax, actualMg: 2 },
          ],
        }),
      ),
    ).toBe("invalid");
    expect(
      await code(layer.batches.create({ ...base, batchId: id(), entries: [{ componentId: wax, actualMg: -1 }] })),
    ).toBe("invalid");
    expect(await layer.batches.list()).toHaveLength(0);
    expect(await counterOf(layer)).toBe(counter);
  });

  it("accepts a 40-character label after trimming", async () => {
    const { layer, version } = await saved();
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      label: ` ${"x".repeat(40)} `,
      entries: [],
    });
    expect(batch.label).toBe("x".repeat(40));
  });
});

describe("BatchTrace: editing and deleting a batch", () => {
  it("update changes date, label, notes and weights but never the source link or identity", async () => {
    const { layer, formula, version, wax, o2 } = await saved();
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      label: "LV-01",
      entries: [{ componentId: wax, actualMg: 1000000 }],
      notes: "first",
    });
    const counter = await counterOf(layer);
    const updated = await layer.batches.update(batch.id, {
      producedOn: "2026-11-15",
      label: "  ",
      entries: [{ componentId: o2, actualMg: 26700 }],
      notes: "",
    });
    expect(updated).toMatchObject({
      id: batch.id,
      formulaId: formula.id,
      versionId: version.id,
      producedOn: "2026-11-15",
      createdAt: batch.createdAt,
      entries: [{ componentId: o2, actualMg: 26700 }],
    });
    expect("label" in updated).toBe(false);
    expect("notes" in updated).toBe(false);
    expect(updated.updatedAt > batch.updatedAt).toBe(true);
    expect(await counterOf(layer)).toBe(counter + 1);

    // Extra keys in the input cannot move the batch to another version.
    const sneaky = { producedOn: "2026-11-15", entries: [], versionId: id(), formulaId: id() };
    const kept = await layer.batches.update(batch.id, sneaky);
    expect(kept.versionId).toBe(version.id);
    expect(kept.formulaId).toBe(formula.id);
  });

  it("update refuses components from another version and a missing batch", async () => {
    const { layer, db, version, lib, formula } = await saved();
    const v2 = await layer.versions.save(revisionRequest(formula.id, version.id, we5Input(lib)));
    const { batch } = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    const otherComponent = v2.version.inputs.waxes[0].componentId;
    expect(
      await code(layer.batches.update(batch.id, { producedOn: "2026-11-16", entries: [{ componentId: otherComponent, actualMg: 1 }] })),
    ).toBe("invalid");
    expect(await code(layer.batches.update(id(), { producedOn: "2026-11-16", entries: [] }))).toBe("not-found");
    expect(await db.batches.get(batch.id)).toEqual(batch);
  });

  it("delete removes one batch and bumps the counter", async () => {
    const { layer, version } = await saved();
    const a = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    const b = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-17", entries: [] });
    const counter = await counterOf(layer);
    await layer.batches.delete(a.batch.id);
    expect((await layer.batches.list()).map((x) => x.batch.id)).toEqual([b.batch.id]);
    expect(await counterOf(layer)).toBe(counter + 1);
    expect(await code(layer.batches.delete(a.batch.id))).toBe("not-found");
  });
});

describe("BatchTrace: the source formula changes later", () => {
  it("revising and scaling the formula leaves both batches on the version they were made from", async () => {
    const { layer, formula, version, lib } = await saved();
    const a = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    const b = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-17", entries: [] });

    const revised = await layer.versions.save(
      revisionRequest(formula.id, version.id, we5Input(lib, { fragranceBp: 900 })),
    );
    const scaled = await layer.versions.save(
      revisionRequest(formula.id, revised.version.id, we5Input(lib, { sizing: { mode: "vessels", count: 10, fillMg: 180000 } }), {
        origin: "scaled",
        scale: { method: "vesselCount", factorX10000: 16667 },
      }),
    );
    expect(scaled.formula.latestVersionNumber).toBe(3);

    for (const created of [a, b]) {
      const item = await layer.batches.get(created.batch.id);
      expect(item?.batch.versionId).toBe(version.id);
      expect(item?.version.number).toBe(1);
      expect(item?.version.targets).toEqual(version.targets);
      expect(item?.formula.latestVersionNumber).toBe(3);
    }
  });

  it("archiving the formula keeps its batches readable and editable, and new batches can still be made", async () => {
    const { layer, formula, version } = await saved();
    const a = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    await layer.formulas.setArchived(formula.id, true);
    const item = await layer.batches.get(a.batch.id);
    expect(item?.formula.archivedAt).not.toBeNull();
    expect(item?.version.id).toBe(version.id);
    await layer.batches.update(a.batch.id, { producedOn: "2026-11-14", entries: [] });
    const b = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-17", entries: [] });
    expect((await layer.batches.list()).map((x) => x.batch.id)).toEqual([b.batch.id, a.batch.id]);
  });

  it("deleting a formula is refused while a batch refers to it (DATA-12), and allowed once the batches are gone", async () => {
    const { layer, db, formula, version } = await saved();
    const a = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    expect(await layer.formulas.deletionImpact(formula.id)).toMatchObject({ versions: 1, batches: 1 });
    const counter = await counterOf(layer);

    expect(await code(layer.formulas.deletePermanently(formula.id))).toBe("in-use");
    expect(await db.formulas.get(formula.id)).toBeDefined();
    expect(await db.formulaVersions.get(version.id)).toBeDefined();
    expect(await db.batches.get(a.batch.id)).toBeDefined();
    expect(await counterOf(layer)).toBe(counter);

    await layer.batches.delete(a.batch.id);
    await layer.formulas.deletePermanently(formula.id);
    expect(await db.formulas.get(formula.id)).toBeUndefined();
  });

  it("a batch of another formula does not block deleting this one", async () => {
    const { layer, version, lib } = await saved();
    await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    const other = await layer.versions.save(newFormulaRequest(we5Input(lib, { name: "Other" })));
    await layer.formulas.deletePermanently(other.formula.id);
    expect(await layer.formulas.get(other.formula.id)).toBeUndefined();
  });
});
