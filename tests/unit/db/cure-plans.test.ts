import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import type { CureMilestoneInput } from "@/lib/db";
import { MAX_MILESTONES, MAX_OFFSET_DAYS } from "@/lib/types";
import { counterOf, id, makeLibrary, newFormulaRequest, setup, we5Input } from "./harness";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

/** A saved WE-5 formula with one batch made on 2026-11-10. */
async function withBatch() {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  const { formula, version } = await ctx.layer.versions.save(newFormulaRequest(we5Input(lib)));
  const { batch } = await ctx.layer.batches.create({
    batchId: id(),
    versionId: version.id,
    producedOn: "2026-11-10",
    entries: [],
  });
  return { ...ctx, formula, version, batch };
}

const STANDARD: CureMilestoneInput[] = [
  { kind: "cureEnd", offsetDays: 14 },
  { kind: "burnTest", offsetDays: 3, label: "  First burn  " },
  { kind: "check", offsetDays: 7, label: "Check frosting" },
];

describe("CurePilot: cure plans", () => {
  it("saves a plan keyed by the batch id, trims labels, starts every milestone open, and bumps the counter once", async () => {
    const { layer, batch } = await withBatch();
    const before = await counterOf(layer);
    const plan = await layer.curePlans.save(batch.id, STANDARD);
    expect(plan.id).toBe(batch.id);
    expect(plan.milestones).toHaveLength(3);
    expect(plan.milestones.map((m) => m.doneOn)).toEqual([null, null, null]);
    expect(plan.milestones[1]!.label).toBe("First burn");
    expect(plan.milestones[0]).not.toHaveProperty("label");
    expect(new Set(plan.milestones.map((m) => m.id)).size).toBe(3);
    expect(await counterOf(layer)).toBe(before + 1);
    expect(await layer.curePlans.get(batch.id)).toEqual(plan);
  });

  it("returns undefined for a batch with no plan", async () => {
    const { layer, batch } = await withBatch();
    expect(await layer.curePlans.get(batch.id)).toBeUndefined();
  });

  it("refuses a missing batch, an empty plan, two cure ends, bad offsets and long labels, writing nothing", async () => {
    const { layer, db, batch } = await withBatch();
    const before = await counterOf(layer);
    expect(await code(layer.curePlans.save(id(), STANDARD))).toBe("not-found");
    expect(await code(layer.curePlans.save(batch.id, []))).toBe("invalid");
    expect(
      await code(
        layer.curePlans.save(batch.id, [
          { kind: "cureEnd", offsetDays: 14 },
          { kind: "cureEnd", offsetDays: 21 },
        ]),
      ),
    ).toBe("invalid");
    expect(await code(layer.curePlans.save(batch.id, [{ kind: "burnTest", offsetDays: -1 }]))).toBe("invalid");
    expect(await code(layer.curePlans.save(batch.id, [{ kind: "burnTest", offsetDays: 1.5 }]))).toBe("invalid");
    expect(
      await code(layer.curePlans.save(batch.id, [{ kind: "burnTest", offsetDays: MAX_OFFSET_DAYS + 1 }])),
    ).toBe("invalid");
    expect(
      await code(layer.curePlans.save(batch.id, [{ kind: "check", offsetDays: 1, label: "x".repeat(61) }])),
    ).toBe("invalid");
    const tooMany = Array.from({ length: MAX_MILESTONES + 1 }, (_, i) => ({
      kind: "burnTest" as const,
      offsetDays: i,
    }));
    expect(await code(layer.curePlans.save(batch.id, tooMany))).toBe("invalid");
    expect(await db.curePlans.count()).toBe(0);
    expect(await counterOf(layer)).toBe(before);
  });

  it("accepts the limits: offset 0 and 365, 20 milestones, a 60-character label", async () => {
    const { layer, batch } = await withBatch();
    const rows: CureMilestoneInput[] = Array.from({ length: MAX_MILESTONES }, (_, i) => ({
      kind: "burnTest",
      offsetDays: i === 0 ? 0 : MAX_OFFSET_DAYS,
      label: i === 1 ? "y".repeat(60) : undefined,
    }));
    const plan = await layer.curePlans.save(batch.id, rows);
    expect(plan.milestones).toHaveLength(MAX_MILESTONES);
  });

  it("re-saving keeps known milestones' ids and done dates, gives new ones fresh ids, and drops removed ones", async () => {
    const { layer, batch } = await withBatch();
    const first = await layer.curePlans.save(batch.id, STANDARD);
    const [cure, burn, check] = first.milestones as [
      (typeof first.milestones)[0],
      (typeof first.milestones)[0],
      (typeof first.milestones)[0],
    ];
    await layer.curePlans.setMilestoneDone(batch.id, burn.id, "2026-11-13");

    const second = await layer.curePlans.save(batch.id, [
      { id: cure.id, kind: "cureEnd", offsetDays: 21 },
      { id: burn.id, kind: "burnTest", offsetDays: 5, label: "First burn" },
      { kind: "burnTest", offsetDays: 10, label: "Second burn" },
    ]);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.milestones.map((m) => m.id).slice(0, 2)).toEqual([cure.id, burn.id]);
    expect(second.milestones[0]!.offsetDays).toBe(21);
    // A done milestone stays done when its offset changes.
    expect(second.milestones[1]).toMatchObject({ offsetDays: 5, doneOn: "2026-11-13" });
    expect(second.milestones[2]!.doneOn).toBeNull();
    expect([cure.id, burn.id, check.id]).not.toContain(second.milestones[2]!.id);
    expect(second.milestones.map((m) => m.id)).not.toContain(check.id);
  });

  it("refuses an id that is not in the stored plan, and a repeated id", async () => {
    const { layer, batch } = await withBatch();
    const plan = await layer.curePlans.save(batch.id, STANDARD);
    const known = plan.milestones[0]!.id;
    expect(await code(layer.curePlans.save(batch.id, [{ id: id(), kind: "burnTest", offsetDays: 1 }]))).toBe(
      "invalid",
    );
    expect(
      await code(
        layer.curePlans.save(batch.id, [
          { id: known, kind: "cureEnd", offsetDays: 14 },
          { id: known, kind: "cureEnd", offsetDays: 14 },
        ]),
      ),
    ).toBe("invalid");
    expect(await layer.curePlans.get(batch.id)).toEqual(plan);
  });

  it("marks a milestone done and open again; a repeat writes nothing", async () => {
    const { layer, batch } = await withBatch();
    const plan = await layer.curePlans.save(batch.id, STANDARD);
    const target = plan.milestones[1]!.id;
    const c0 = await counterOf(layer);

    const done = await layer.curePlans.setMilestoneDone(batch.id, target, "2026-11-13");
    expect(done.milestones[1]!.doneOn).toBe("2026-11-13");
    expect(done.milestones[0]!.doneOn).toBeNull();
    expect(await counterOf(layer)).toBe(c0 + 1);

    const again = await layer.curePlans.setMilestoneDone(batch.id, target, "2026-11-13");
    expect(again).toEqual(done);
    expect(await counterOf(layer)).toBe(c0 + 1);

    const reopened = await layer.curePlans.setMilestoneDone(batch.id, target, null);
    expect(reopened.milestones[1]!.doneOn).toBeNull();
    expect(await counterOf(layer)).toBe(c0 + 2);
  });

  it("refuses marking on a missing plan, a missing milestone, or with a bad date", async () => {
    const { layer, batch } = await withBatch();
    expect(await code(layer.curePlans.setMilestoneDone(batch.id, id(), "2026-11-13"))).toBe("not-found");
    const plan = await layer.curePlans.save(batch.id, STANDARD);
    expect(await code(layer.curePlans.setMilestoneDone(batch.id, id(), "2026-11-13"))).toBe("not-found");
    expect(await code(layer.curePlans.setMilestoneDone(batch.id, plan.milestones[0]!.id, "13/11/2026"))).toBe(
      "invalid",
    );
    expect(await layer.curePlans.get(batch.id)).toEqual(plan);
  });

  it("moving the batch's production date writes nothing to the plan and keeps done dates", async () => {
    const { layer, batch } = await withBatch();
    const plan = await layer.curePlans.save(batch.id, STANDARD);
    const done = await layer.curePlans.setMilestoneDone(batch.id, plan.milestones[1]!.id, "2026-11-13");
    await layer.batches.update(batch.id, { producedOn: "2026-11-05", entries: [] });
    expect(await layer.curePlans.get(batch.id)).toEqual(done);
    const schedule = await layer.schedule.read();
    expect(schedule.cure[0]!.batch.producedOn).toBe("2026-11-05");
  });

  it("deletes a plan, and refuses deleting one that is not there", async () => {
    const { layer, batch } = await withBatch();
    await layer.curePlans.save(batch.id, STANDARD);
    const c0 = await counterOf(layer);
    await layer.curePlans.delete(batch.id);
    expect(await layer.curePlans.get(batch.id)).toBeUndefined();
    expect(await counterOf(layer)).toBe(c0 + 1);
    expect(await code(layer.curePlans.delete(batch.id))).toBe("not-found");
  });

  it("deleting a batch deletes its cure plan in the same transaction, and the impact says how many milestones go", async () => {
    const { layer, db, batch } = await withBatch();
    await layer.curePlans.save(batch.id, STANDARD);
    expect(await layer.batches.deletionImpact(batch.id)).toEqual({ milestones: 3, productionPlans: 0, burnSessions: 0, investigations: 0, followUpExperiments: 0 });
    const c0 = await counterOf(layer);
    await layer.batches.delete(batch.id);
    expect(await db.curePlans.count()).toBe(0);
    expect(await counterOf(layer)).toBe(c0 + 1);
  });

  it("a failed batch delete leaves the plan in place", async () => {
    const { layer, db, batch } = await withBatch();
    await layer.curePlans.save(batch.id, STANDARD);
    const original = db.batches.delete.bind(db.batches);
    db.batches.delete = (() => Promise.reject(new Error("disk full"))) as unknown as typeof db.batches.delete;
    expect(await code(layer.batches.delete(batch.id))).toBe("storage");
    db.batches.delete = original;
    expect(await layer.curePlans.get(batch.id)).toBeDefined();
    expect(await db.batches.get(batch.id)).toBeDefined();
  });
});
