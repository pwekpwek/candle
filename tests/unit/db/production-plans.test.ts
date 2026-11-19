import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import { counterOf, id, makeLibrary, newFormulaRequest, revisionRequest, setup, we5Input } from "./harness";

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
  return { ...ctx, lib, ...result };
}

describe("CurePilot: planned production entries", () => {
  it("creates an open entry linked to the version and its formula, trimmed, idempotent on the id", async () => {
    const { layer, formula, version } = await saved();
    const c0 = await counterOf(layer);
    const planId = id();
    const request = { planId, versionId: version.id, plannedOn: "2026-12-02", label: "  Dec run ", notes: "   " };
    const first = await layer.productionPlans.create(request);
    expect(first.created).toBe(true);
    expect(first.plan).toMatchObject({
      id: planId,
      formulaId: formula.id,
      versionId: version.id,
      plannedOn: "2026-12-02",
      label: "Dec run",
      batchId: null,
    });
    expect(first.plan).not.toHaveProperty("notes");
    const again = await layer.productionPlans.create({ ...request, plannedOn: "2027-01-01" });
    expect(again).toEqual({ plan: first.plan, created: false });
    expect(await counterOf(layer)).toBe(c0 + 1);

    const item = await layer.productionPlans.get(planId);
    expect(item?.formula.id).toBe(formula.id);
    expect(item?.version.id).toBe(version.id);
    expect(item?.batch).toBeNull();
  });

  it("allows past dates (late entry) and refuses a bad date, a long label and a missing version", async () => {
    const { layer, version } = await saved();
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2025-01-15" });
    expect(await code(layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-02-30" }))).toBe(
      "invalid",
    );
    expect(
      await code(layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02", label: "x".repeat(41) })),
    ).toBe("invalid");
    expect(await code(layer.productionPlans.create({ planId: id(), versionId: id(), plannedOn: "2026-12-02" }))).toBe(
      "not-found",
    );
  });

  it("update changes date, label and notes only; the links never change", async () => {
    const { layer, version } = await saved();
    const { plan } = await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02", label: "A" });
    const updated = await layer.productionPlans.update(plan.id, { plannedOn: "2026-12-09", notes: " bigger pour " });
    expect(updated).toMatchObject({
      id: plan.id,
      formulaId: plan.formulaId,
      versionId: plan.versionId,
      plannedOn: "2026-12-09",
      notes: "bigger pour",
      batchId: null,
      createdAt: plan.createdAt,
    });
    expect(updated).not.toHaveProperty("label");
    expect(await code(layer.productionPlans.update(id(), { plannedOn: "2026-12-09" }))).toBe("not-found");
  });

  it("lists earliest planned first, with batch null while open", async () => {
    const { layer, version } = await saved();
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-09" });
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-01" });
    const list = await layer.productionPlans.list();
    expect(list.map((item) => item.plan.plannedOn)).toEqual(["2026-12-01", "2026-12-09"]);
    expect(list.every((item) => item.batch === null)).toBe(true);
  });

  it("Create batch from an entry writes the batch and links the entry in one transaction, with one counter bump", async () => {
    const { layer, version } = await saved();
    const { plan } = await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });
    const c0 = await counterOf(layer);
    const batchId = id();
    const request = { batchId, versionId: version.id, producedOn: "2026-11-19", entries: [], productionPlanId: plan.id };
    const { batch, created } = await layer.batches.create(request);
    expect(created).toBe(true);
    expect(await counterOf(layer)).toBe(c0 + 1);
    const item = await layer.productionPlans.get(plan.id);
    expect(item?.plan.batchId).toBe(batch.id);
    expect(item?.plan.plannedOn).toBe("2026-12-02");
    expect(item?.batch?.producedOn).toBe("2026-11-19");

    // A retry with the same batch id writes nothing.
    expect((await layer.batches.create(request)).created).toBe(false);
    expect(await counterOf(layer)).toBe(c0 + 1);
  });

  it("refuses an entry that is gone, already has a batch, or is for another version; nothing is written", async () => {
    const { layer, db, formula, version, lib } = await saved();
    const { version: v2 } = await layer.versions.save(revisionRequest(formula.id, version.id, we5Input(lib)));
    const { plan } = await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });

    expect(
      await code(layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-19", entries: [], productionPlanId: id() })),
    ).toBe("not-found");
    expect(
      await code(layer.batches.create({ batchId: id(), versionId: v2.id, producedOn: "2026-11-19", entries: [], productionPlanId: plan.id })),
    ).toBe("invalid");
    expect(await db.batches.count()).toBe(0);

    await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-19", entries: [], productionPlanId: plan.id });
    const c0 = await counterOf(layer);
    expect(
      await code(layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-19", entries: [], productionPlanId: plan.id })),
    ).toBe("invalid");
    expect(await db.batches.count()).toBe(1);
    expect(await counterOf(layer)).toBe(c0);
  });

  it("deleting the batch reopens the entry it came from", async () => {
    const { layer, version } = await saved();
    const { plan } = await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-19",
      entries: [],
      productionPlanId: plan.id,
    });
    expect(await layer.batches.deletionImpact(batch.id)).toEqual({ milestones: 0, productionPlans: 1, burnSessions: 0 });
    await layer.batches.delete(batch.id);
    const item = await layer.productionPlans.get(plan.id);
    expect(item?.plan.batchId).toBeNull();
    expect(item?.batch).toBeNull();
  });

  it("deleting an entry leaves its batch alone", async () => {
    const { layer, version } = await saved();
    const { plan } = await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-19",
      entries: [],
      productionPlanId: plan.id,
    });
    const c0 = await counterOf(layer);
    await layer.productionPlans.delete(plan.id);
    expect(await counterOf(layer)).toBe(c0 + 1);
    expect(await layer.batches.get(batch.id)).toBeDefined();
    expect(await code(layer.productionPlans.delete(plan.id))).toBe("not-found");
  });

  it("archiving the formula keeps its entries, and Create batch still works", async () => {
    const { layer, formula, version } = await saved();
    const { plan } = await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });
    await layer.formulas.setArchived(formula.id, true);
    const item = await layer.productionPlans.get(plan.id);
    expect(item?.formula.archivedAt).not.toBeNull();
    await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-19", entries: [], productionPlanId: plan.id });
    expect((await layer.productionPlans.get(plan.id))?.plan.batchId).not.toBeNull();
  });

  it("deleting a formula deletes its open entries; a formula whose entry made a batch cannot be deleted", async () => {
    const { layer, db, formula, version } = await saved();
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-09" });
    expect(await layer.formulas.deletionImpact(formula.id)).toMatchObject({ batches: 0, productionPlans: 2 });
    await layer.formulas.deletePermanently(formula.id);
    expect(await db.productionPlans.count()).toBe(0);

    const other = await saved();
    const { plan } = await other.layer.productionPlans.create({
      planId: id(),
      versionId: other.version.id,
      plannedOn: "2026-12-02",
    });
    await other.layer.batches.create({
      batchId: id(),
      versionId: other.version.id,
      producedOn: "2026-11-19",
      entries: [],
      productionPlanId: plan.id,
    });
    expect(await code(other.layer.formulas.deletePermanently(other.formula.id))).toBe("in-use");
    expect(await other.db.productionPlans.count()).toBe(1);
  });
});

describe("CurePilot: schedule read", () => {
  it("returns cure plans with their batch, formula and version, and every production entry", async () => {
    const { layer, formula, version } = await saved();
    const { batch } = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-10", entries: [] });
    await layer.curePlans.save(batch.id, [{ kind: "cureEnd", offsetDays: 14 }]);
    await layer.productionPlans.create({ planId: id(), versionId: version.id, plannedOn: "2026-12-02" });
    const data = await layer.schedule.read();
    expect(data.cure).toHaveLength(1);
    expect(data.cure[0]).toMatchObject({ batch: { id: batch.id }, formula: { id: formula.id }, version: { id: version.id } });
    expect(data.production).toHaveLength(1);
    expect(data.production[0]!.batch).toBeNull();
  });

  it("leaves out a cure plan whose batch is missing (damaged data only)", async () => {
    const { layer, db } = await saved();
    await db.curePlans.add({
      id: id(),
      milestones: [{ id: id(), kind: "cureEnd", offsetDays: 14, doneOn: null }],
      createdAt: "2026-11-10T00:00:00.000Z",
      updatedAt: "2026-11-10T00:00:00.000Z",
    });
    expect((await layer.schedule.read()).cure).toEqual([]);
  });
});
