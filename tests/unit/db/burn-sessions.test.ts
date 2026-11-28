import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import type { BurnCandleInput, BurnSessionInput } from "@/lib/db";
import { MAX_BURN_CANDLES, MAX_BURNS_PER_CANDLE } from "@/lib/types";
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

/** A saved WE-5 formula, one batch made on 2026-11-10 with a cure plan holding two burn tests. */
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
  const plan = await ctx.layer.curePlans.save(batch.id, [
    { kind: "cureEnd", offsetDays: 14 },
    { kind: "burnTest", offsetDays: 3, label: "First burn" },
    { kind: "burnTest", offsetDays: 10 },
    { kind: "check", offsetDays: 7, label: "Look" },
  ]);
  const [cureEnd, firstBurn, secondBurn, check] = plan.milestones;
  return { ...ctx, lib, formula, version, batch, cureEnd: cureEnd!, firstBurn: firstBurn!, secondBurn: secondBurn!, check: check! };
}

function candle(overrides: Partial<BurnCandleInput> = {}): BurnCandleInput {
  return {
    label: "  Candle 1  ",
    wick: { text: "  CD-10  " },
    burns: [
      { durationMin: 240, weightBeforeMg: 250_000, weightAfterMg: 238_500, meltPoolDiameterMm: 62, soot: "none", notes: "  even  " },
      { durationMin: 180, notes: "   " },
    ],
    coldThrow: "  Light lavender ",
    hotThrow: "",
    ...overrides,
  };
}

function input(overrides: Partial<BurnSessionInput> = {}): BurnSessionInput {
  return {
    testedOn: "2026-11-18",
    label: "  Wick trial  ",
    milestoneId: null,
    candles: [candle()],
    conclusion: "  CD-10 gave a full pool by hour 3.  ",
    notes: "",
    ...overrides,
  };
}

describe("BurnMatrix: burn sessions", () => {
  it("creates a session: trims text, leaves blanks out, gives ids, bumps the counter once", async () => {
    const { layer, batch } = await withBatch();
    const before = await counterOf(layer);
    const sessionId = id();
    const { session, created } = await layer.burnSessions.create({ sessionId, batchId: batch.id, ...input() });
    expect(created).toBe(true);
    expect(session.id).toBe(sessionId);
    expect(session.batchId).toBe(batch.id);
    expect(session.label).toBe("Wick trial");
    expect(session.conclusion).toBe("CD-10 gave a full pool by hour 3.");
    expect(session).not.toHaveProperty("notes");
    const [c] = session.candles;
    expect(c!.label).toBe("Candle 1");
    expect(c!.wick).toEqual({ materialId: null, name: "CD-10" });
    expect(c!.coldThrow).toBe("Light lavender");
    expect(c).not.toHaveProperty("hotThrow");
    expect(c!.burns[0]!.notes).toBe("even");
    expect(c!.burns[1]).not.toHaveProperty("notes");
    expect(c!.burns[1]).not.toHaveProperty("weightBeforeMg");
    expect(new Set([c!.id, ...c!.burns.map((b) => b.id)]).size).toBe(3);
    expect(await counterOf(layer)).toBe(before + 1);
    expect((await layer.burnSessions.get(sessionId))?.session).toEqual(session);
  });

  it("is idempotent on the session id: a retry writes nothing", async () => {
    const { layer, batch } = await withBatch();
    const sessionId = id();
    const first = await layer.burnSessions.create({ sessionId, batchId: batch.id, ...input() });
    const before = await counterOf(layer);
    const again = await layer.burnSessions.create({ sessionId, batchId: batch.id, ...input({ label: "Other" }) });
    expect(again.created).toBe(false);
    expect(again.session).toEqual(first.session);
    expect(await counterOf(layer)).toBe(before);
  });

  it("refuses bad input and writes nothing", async () => {
    const { layer, db, batch } = await withBatch();
    const before = await counterOf(layer);
    const make = (over: Partial<BurnSessionInput>) =>
      layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input(over) });
    expect(await layer.burnSessions.create({ sessionId: id(), batchId: id(), ...input() }).catch((e) => e.code)).toBe("not-found");
    expect(await code(make({ candles: [] }))).toBe("invalid");
    expect(await code(make({ candles: Array.from({ length: MAX_BURN_CANDLES + 1 }, () => candle()) }))).toBe("invalid");
    expect(await code(make({ testedOn: "18/11/2026" }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ label: "   " })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ wick: { text: "  " } })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ burns: [{ durationMin: 0 }] })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ burns: [{ durationMin: 1441 }] })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ burns: [{ durationMin: 60.5 }] })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ burns: [{ durationMin: 60, weightBeforeMg: 100_000, weightAfterMg: 100_001 }] })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ burns: [{ durationMin: 60, meltPoolDiameterMm: 501 }] })] }))).toBe("invalid");
    expect(await code(make({ candles: [candle({ burns: Array.from({ length: MAX_BURNS_PER_CANDLE + 1 }, () => ({ durationMin: 60 })) })] }))).toBe("invalid");
    expect(await code(make({ conclusion: "x".repeat(2001) }))).toBe("invalid");
    expect(await db.burnSessions.count()).toBe(0);
    expect(await counterOf(layer)).toBe(before);
  });

  it("accepts weight after equal to weight before, and the largest sizes", async () => {
    const { layer, batch } = await withBatch();
    const { session } = await layer.burnSessions.create({
      sessionId: id(),
      batchId: batch.id,
      ...input({ candles: [candle({ burns: [{ durationMin: 1440, weightBeforeMg: 1, weightAfterMg: 1, meltPoolDepthMm: 500, flameHeightMm: 0 }] })] }),
    });
    expect(session.candles[0]!.burns[0]!.weightAfterMg).toBe(1);
  });

  it("resolves a library wick: snapshots its name, refuses a non-wick or missing material", async () => {
    const { layer, lib, batch } = await withBatch();
    const { session } = await layer.burnSessions.create({
      sessionId: id(),
      batchId: batch.id,
      ...input({ candles: [candle({ wick: { materialId: lib.wickId } })] }),
    });
    expect(session.candles[0]!.wick).toEqual({ materialId: lib.wickId, name: "Wick A" });
    const make = (wick: BurnCandleInput["wick"]) =>
      layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ candles: [candle({ wick })] }) });
    expect(await code(make({ materialId: lib.waxId }))).toBe("invalid");
    expect(await code(make({ materialId: id() }))).toBe("not-found");
  });

  it("update keeps identity, the batch, candle and burn ids, and a wick's name snapshot when the material is unchanged", async () => {
    const { layer, lib, batch } = await withBatch();
    const { session } = await layer.burnSessions.create({
      sessionId: id(),
      batchId: batch.id,
      ...input({ candles: [candle({ wick: { materialId: lib.wickId } }), candle({ label: "Candle 2" })] }),
    });
    await layer.materials.update(lib.wickId, { type: "wick", name: "Wick A renamed", wick: { size: "CD-8" } });
    await layer.materials.setArchived(lib.wickId, true);
    const [c1, c2] = session.candles;
    const before = await counterOf(layer);
    const updated = await layer.burnSessions.update(session.id, {
      ...input({ testedOn: "2026-11-19", label: "" }),
      candles: [
        {
          id: c1!.id,
          label: "Candle 1",
          wick: { materialId: lib.wickId },
          burns: [{ id: c1!.burns[0]!.id, durationMin: 250 }, { durationMin: 30 }],
        },
        { id: c2!.id, label: "Candle 2", wick: { text: "CD-12" }, burns: [] },
      ],
    });
    expect(updated.id).toBe(session.id);
    expect(updated.batchId).toBe(batch.id);
    expect(updated.createdAt).toBe(session.createdAt);
    expect(updated.updatedAt > session.updatedAt).toBe(true);
    expect(updated).not.toHaveProperty("label");
    expect(updated.candles[0]!.id).toBe(c1!.id);
    expect(updated.candles[0]!.wick).toEqual({ materialId: lib.wickId, name: "Wick A" });
    expect(updated.candles[0]!.burns[0]!.id).toBe(c1!.burns[0]!.id);
    expect(updated.candles[0]!.burns[0]!.durationMin).toBe(250);
    expect(updated.candles[0]!.burns[1]!.id).not.toBe(c1!.burns[1]!.id);
    expect(updated.candles[1]!.wick).toEqual({ materialId: null, name: "CD-12" });
    expect(await counterOf(layer)).toBe(before + 1);

    // Choosing the library wick again after it was free text takes the current name.
    const again = await layer.burnSessions.update(session.id, {
      ...input(),
      candles: [{ id: c2!.id, label: "Candle 2", wick: { materialId: lib.wickId }, burns: [] }],
    });
    expect(again.candles[0]!.wick.name).toBe("Wick A renamed");
  });

  it("update refuses an unknown or repeated candle or burn id, and a missing session", async () => {
    const { layer, batch } = await withBatch();
    const { session } = await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input() });
    const c = session.candles[0]!;
    expect(await code(layer.burnSessions.update(id(), input()))).toBe("not-found");
    expect(await code(layer.burnSessions.update(session.id, input({ candles: [candle({ id: id() })] })))).toBe("invalid");
    expect(await code(layer.burnSessions.update(session.id, input({ candles: [candle({ id: c.id }), candle({ id: c.id })] })))).toBe("invalid");
    expect(
      await code(layer.burnSessions.update(session.id, input({ candles: [candle({ id: c.id, burns: [{ id: id(), durationMin: 5 }] })] }))),
    ).toBe("invalid");
  });

  it("lists sessions newest test first, by batch, with photo counts", async () => {
    const { layer, batch, version } = await withBatch();
    const other = (await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-11", entries: [] })).batch;
    const a = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ testedOn: "2026-11-15" }) })).session;
    const b = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ testedOn: "2026-11-18" }) })).session;
    const c = (await layer.burnSessions.create({ sessionId: id(), batchId: other.id, ...input({ testedOn: "2026-11-16" }) })).session;
    const all = await layer.burnSessions.list();
    expect(all.map((i) => i.session.id)).toEqual([b.id, c.id, a.id]);
    expect(all[0]!.formula.id).toBe(batch.formulaId);
    expect(all[0]!.version.id).toBe(version.id);
    expect(all[0]!.photoCount).toBe(0);
    expect((await layer.burnSessions.listByBatch(batch.id)).map((i) => i.session.id)).toEqual([b.id, a.id]);
    expect(await layer.burnSessions.get(id())).toBeUndefined();
  });
});

describe("BurnMatrix: the planned burn test link", () => {
  it("saving a linked session marks the milestone done on the test date in the same write", async () => {
    const { layer, batch, firstBurn } = await withBatch();
    const before = await counterOf(layer);
    const { session } = await layer.burnSessions.create({
      sessionId: id(),
      batchId: batch.id,
      ...input({ milestoneId: firstBurn.id, testedOn: "2026-11-13" }),
    });
    expect(session.milestoneId).toBe(firstBurn.id);
    const plan = await layer.curePlans.get(batch.id);
    expect(plan!.milestones.find((m) => m.id === firstBurn.id)!.doneOn).toBe("2026-11-13");
    expect(await counterOf(layer)).toBe(before + 1);
    expect((await layer.burnSessions.get(session.id))!.milestone!.id).toBe(firstBurn.id);

    // Moving the test date moves the done date.
    await layer.burnSessions.update(session.id, input({ milestoneId: firstBurn.id, testedOn: "2026-11-14" }));
    expect((await layer.curePlans.get(batch.id))!.milestones.find((m) => m.id === firstBurn.id)!.doneOn).toBe("2026-11-14");

    // Marked open on the batch page: the link stays, and the next save marks it done again.
    await layer.curePlans.setMilestoneDone(batch.id, firstBurn.id, null);
    expect((await layer.burnSessions.get(session.id))!.session.milestoneId).toBe(firstBurn.id);
    await layer.burnSessions.update(session.id, input({ milestoneId: firstBurn.id, testedOn: "2026-11-14" }));
    expect((await layer.curePlans.get(batch.id))!.milestones.find((m) => m.id === firstBurn.id)!.doneOn).toBe("2026-11-14");
  });

  it("unlinking or moving the link leaves the old milestone as it is; deleting the session too", async () => {
    const { layer, batch, firstBurn, secondBurn } = await withBatch();
    const { session } = await layer.burnSessions.create({
      sessionId: id(),
      batchId: batch.id,
      ...input({ milestoneId: firstBurn.id, testedOn: "2026-11-13" }),
    });
    await layer.burnSessions.update(session.id, input({ milestoneId: secondBurn.id, testedOn: "2026-11-20" }));
    let plan = (await layer.curePlans.get(batch.id))!;
    expect(plan.milestones.find((m) => m.id === firstBurn.id)!.doneOn).toBe("2026-11-13");
    expect(plan.milestones.find((m) => m.id === secondBurn.id)!.doneOn).toBe("2026-11-20");
    await layer.burnSessions.update(session.id, input({ milestoneId: null }));
    await layer.burnSessions.delete(session.id);
    plan = (await layer.curePlans.get(batch.id))!;
    expect(plan.milestones.find((m) => m.id === secondBurn.id)!.doneOn).toBe("2026-11-20");
  });

  it("refuses a link to a milestone that is not a burn test of this batch, or that another session holds", async () => {
    const { layer, db, batch, version, firstBurn, check, cureEnd } = await withBatch();
    const make = (milestoneId: string, batchId = batch.id) =>
      layer.burnSessions.create({ sessionId: id(), batchId, ...input({ milestoneId }) });
    expect(await code(make(check.id))).toBe("invalid");
    expect(await code(make(cureEnd.id))).toBe("invalid");
    expect(await code(make(id()))).toBe("invalid");
    const other = (await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-11", entries: [] })).batch;
    expect(await code(make(firstBurn.id, other.id))).toBe("invalid");
    await make(firstBurn.id);
    expect(await code(make(firstBurn.id))).toBe("invalid");
    expect(await db.burnSessions.count()).toBe(1);
    // Nothing was marked done by the refused writes.
    const plan = (await layer.curePlans.get(batch.id))!;
    expect(plan.milestones.filter((m) => m.doneOn !== null).map((m) => m.id)).toEqual([firstBurn.id]);
  });

  it("burnTestOptions lists the burn tests by offset and which session holds each", async () => {
    const { layer, batch, firstBurn, secondBurn } = await withBatch();
    const { session } = await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ milestoneId: secondBurn.id }) });
    const options = await layer.burnSessions.burnTestOptions(batch.id);
    expect(options.map((o) => [o.milestone.id, o.linkedSessionId])).toEqual([
      [firstBurn.id, null],
      [secondBurn.id, session.id],
    ]);
    expect(await layer.burnSessions.burnTestOptions(id())).toEqual([]);
  });

  it("a cure plan that drops the milestone, or turns it into another kind, clears the link in the same write", async () => {
    const { layer, batch, cureEnd, firstBurn, secondBurn, check } = await withBatch();
    const s1 = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ milestoneId: firstBurn.id }) })).session;
    const s2 = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ milestoneId: secondBurn.id }) })).session;
    const before = await counterOf(layer);
    await layer.curePlans.save(batch.id, [
      { id: cureEnd.id, kind: "cureEnd", offsetDays: 14 },
      { id: secondBurn.id, kind: "check", label: "Now a check", offsetDays: 10 },
      { id: check.id, kind: "check", label: "Look", offsetDays: 7 },
    ]);
    expect(await counterOf(layer)).toBe(before + 1);
    expect((await layer.burnSessions.get(s1.id))!.session.milestoneId).toBeNull();
    expect((await layer.burnSessions.get(s2.id))!.session.milestoneId).toBeNull();
  });

  it("keeps links to burn tests that stay in the plan", async () => {
    const { layer, batch, firstBurn, secondBurn } = await withBatch();
    const s1 = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ milestoneId: firstBurn.id }) })).session;
    await layer.curePlans.save(batch.id, [{ id: firstBurn.id, kind: "burnTest", offsetDays: 4 }, { id: secondBurn.id, kind: "burnTest", offsetDays: 10 }]);
    expect((await layer.burnSessions.get(s1.id))!.session.milestoneId).toBe(firstBurn.id);
  });

  it("deleting the cure plan clears every link of that batch", async () => {
    const { layer, batch, firstBurn } = await withBatch();
    const s1 = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ milestoneId: firstBurn.id }) })).session;
    await layer.curePlans.delete(batch.id);
    expect((await layer.burnSessions.get(s1.id))!.session.milestoneId).toBeNull();
    expect(await layer.burnSessions.burnTestOptions(batch.id)).toEqual([]);
  });

  it("get returns milestone null when a stored link no longer resolves (soft link after a restore)", async () => {
    const { layer, db, batch, firstBurn } = await withBatch();
    const s1 = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input({ milestoneId: firstBurn.id }) })).session;
    // As a merge restore that kept another copy of the plan can leave it.
    const plan = (await db.curePlans.get(batch.id))!;
    await db.curePlans.put({ ...plan, milestones: plan.milestones.filter((m) => m.id !== firstBurn.id) });
    const detail = (await layer.burnSessions.get(s1.id))!;
    expect(detail.session.milestoneId).toBe(firstBurn.id);
    expect(detail.milestone).toBeNull();
    // A write never stores an unresolvable link.
    expect(await code(layer.burnSessions.update(s1.id, input({ milestoneId: firstBurn.id })))).toBe("invalid");
    expect((await layer.burnSessions.update(s1.id, input({ milestoneId: null }))).milestoneId).toBeNull();
  });
});

describe("BurnMatrix: deletes", () => {
  it("deleting a batch is refused while it has burn sessions, and allowed after they are deleted", async () => {
    const { layer, db, batch } = await withBatch();
    const { session } = await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input() });
    expect(await layer.batches.deletionImpact(batch.id)).toEqual({ milestones: 4, productionPlans: 0, burnSessions: 1, investigations: 0, followUpExperiments: 0 });
    const before = await counterOf(layer);
    expect(await code(layer.batches.delete(batch.id))).toBe("in-use");
    expect(await db.batches.get(batch.id)).toBeDefined();
    expect(await db.curePlans.get(batch.id)).toBeDefined();
    expect(await counterOf(layer)).toBe(before);
    await layer.burnSessions.delete(session.id);
    await layer.batches.delete(batch.id);
    expect(await db.batches.get(batch.id)).toBeUndefined();
  });

  it("deleting a session deletes its photos in one write and counts them first", async () => {
    const { layer, db, batch } = await withBatch();
    const { session } = await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input() });
    const keep = (await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input() })).session;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    for (let i = 0; i < 2; i++) {
      await layer.burnPhotos.add({ photoId: id(), sessionId: session.id, bytes: jpeg, width: 10, height: 10 });
    }
    await layer.burnPhotos.add({ photoId: id(), sessionId: keep.id, bytes: jpeg, width: 10, height: 10 });
    expect(await layer.burnSessions.deletionImpact(session.id)).toEqual({ photos: 2, experiments: 0 });
    expect((await layer.burnSessions.listByBatch(batch.id)).find((i) => i.session.id === session.id)!.photoCount).toBe(2);
    const before = await counterOf(layer);
    await layer.burnSessions.delete(session.id);
    expect(await counterOf(layer)).toBe(before + 1);
    expect(await db.burnSessions.get(session.id)).toBeUndefined();
    expect(await db.burnPhotos.count()).toBe(1);
    expect(await code(layer.burnSessions.delete(session.id))).toBe("not-found");
  });

  it("a formula's batch with burn tests still blocks the formula delete", async () => {
    const { layer, formula, batch } = await withBatch();
    await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...input() });
    expect(await code(layer.formulas.deletePermanently(formula.id))).toBe("in-use");
  });
});
