import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { applyRestore, readDeviceData } from "@/lib/backup";
import { burnChecksAfter } from "@/lib/backup/plan";
import type { BurnSessionInput } from "@/lib/db";
import type { Batch, BurnSession } from "@/lib/types";
import { id, newFormulaRequest, we5Input } from "../db/harness";
import { blankDevice, exportChecked, newDevice, planFor } from "./apply-harness";

/**
 * Integration QA (M-1, M-2): the restore preview counts burn tests that will be
 * dated before their batch, and planned burn tests that more than one burn test
 * will link to, once the plan is applied. The restore still goes ahead.
 */

const NOW = () => "2026-11-17T10:00:00.000Z";

function session(testedOn: string, milestoneId: string | null = null): BurnSessionInput {
  return { testedOn, milestoneId, candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] }] };
}

/** A device with a batch made 2026-11-10, a planned burn test, and a session linked to it. */
async function sourceWithLinkedTest() {
  const src = await newDevice();
  const { version } = await src.layer.versions.save(newFormulaRequest(we5Input(src.lib)));
  const { batch } = await src.layer.batches.create({
    batchId: id(),
    versionId: version.id,
    producedOn: "2026-11-10",
    entries: [],
  });
  const plan = await src.layer.curePlans.save(batch.id, [{ kind: "burnTest", offsetDays: 2 }]);
  const milestoneId = plan.milestones[0]!.id;
  const first = id();
  await src.layer.burnSessions.create({ sessionId: first, batchId: batch.id, ...session("2026-11-12", milestoneId) });
  return { src, batch, milestoneId, first };
}

/** A blank device that has restored everything the source holds now. */
async function copyOf(src: Awaited<ReturnType<typeof newDevice>>) {
  const target = blankDevice(src.lib);
  const { envelope } = await exportChecked(src.db, target.db);
  const result = await applyRestore(target.db, await planFor(target.db, envelope), { now: NOW });
  expect(result.ok).toBe(true);
  return target;
}

describe("burnChecksAfter", () => {
  it("counts dates before the batch and planned tests linked more than once", () => {
    const batches = [{ id: "b1", producedOn: "2026-11-10" }] as unknown as Batch[];
    const sessions = [
      { id: "s1", batchId: "b1", testedOn: "2026-11-09", milestoneId: "m1" },
      { id: "s2", batchId: "b1", testedOn: "2026-11-10", milestoneId: "m1" },
      { id: "s3", batchId: "b1", testedOn: "2026-11-11", milestoneId: "m2" },
      { id: "s4", batchId: "gone", testedOn: "2026-01-01", milestoneId: null },
    ] as unknown as BurnSession[];
    expect(burnChecksAfter(batches, sessions)).toEqual({ datesBeforeBatch: 1, sharedPlannedTests: 1 });
    expect(burnChecksAfter([], [])).toEqual({ datesBeforeBatch: 0, sharedPlannedTests: 0 });
  });
});

describe("restore preview burn checks", () => {
  it("are zero for an ordinary round trip, in both modes", async () => {
    const { src } = await sourceWithLinkedTest();
    const target = blankDevice(src.lib);
    const { envelope } = await exportChecked(src.db, target.db);
    const none = { datesBeforeBatch: 0, sharedPlannedTests: 0 };
    expect((await planFor(target.db, envelope)).burnChecks).toEqual(none);
    expect((await planFor(target.db, envelope, "replace")).burnChecks).toEqual(none);
  });

  it("count a planned burn test that two devices linked to different sessions, and the restore still applies", async () => {
    const { src, batch, milestoneId, first } = await sourceWithLinkedTest();
    const target = await copyOf(src);

    // The source moves its link to a new session; the target keeps the old one.
    await src.layer.burnSessions.update(first, session("2026-11-12"));
    await src.layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...session("2026-11-13", milestoneId) });
    const { envelope } = await exportChecked(src.db, target.db, "2026-11-17T09:00:00.000Z");
    const plan = await planFor(target.db, envelope, "merge", "keepDevice");
    expect(plan.burnChecks).toEqual({ datesBeforeBatch: 0, sharedPlannedTests: 1 });
    expect((await applyRestore(target.db, plan, { now: NOW })).ok).toBe(true);
    const linked = (await readDeviceData(target.db)).burnSessions.filter((s) => s.milestoneId === milestoneId);
    expect(linked).toHaveLength(2);
    // With the backup's copies the old session is unlinked, so nothing is shared.
    expect((await planFor(target.db, envelope, "merge", "useBackup")).burnChecks.sharedPlannedTests).toBe(0);
  });

  it("count a burn test that the backup's copy of a batch would leave dated before the batch", async () => {
    const { src, batch } = await sourceWithLinkedTest();
    const target = await copyOf(src);
    await target.layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...session("2026-11-10") });

    await src.layer.batches.update(batch.id, { producedOn: "2026-11-11", entries: [] });
    const { envelope } = await exportChecked(src.db, target.db, "2026-11-17T09:00:00.000Z");
    expect((await planFor(target.db, envelope, "merge", "useBackup")).burnChecks.datesBeforeBatch).toBe(1);
    expect((await planFor(target.db, envelope, "merge", "keepDevice")).burnChecks.datesBeforeBatch).toBe(0);
  });
});
