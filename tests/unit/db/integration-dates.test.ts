import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import type { BurnSessionInput } from "@/lib/db";
import { id, makeLibrary, newFormulaRequest, setup, we5Input } from "./harness";

/**
 * v0.2 integration QA: a burn test is never dated before its batch was made.
 * The screens refused it already; moving the batch's production date past an
 * existing burn test, or a caller other than the editor, could still break it.
 */

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

async function withBatch(producedOn = "2026-11-10") {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  const { version } = await ctx.layer.versions.save(newFormulaRequest(we5Input(lib)));
  const { batch } = await ctx.layer.batches.create({ batchId: id(), versionId: version.id, producedOn, entries: [] });
  return { ...ctx, batch };
}

function session(testedOn: string): BurnSessionInput {
  return {
    testedOn,
    milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] }],
  };
}

describe("integration QA: production date and burn test dates", () => {
  it("refuses to move a batch's production date past its earliest burn test, and allows up to it", async () => {
    const { layer, batch } = await withBatch("2026-11-10");
    await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...session("2026-11-15") });
    await layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...session("2026-11-12") });

    const later = { producedOn: "2026-11-13", entries: [] };
    expect(await code(layer.batches.update(batch.id, later))).toBe("invalid");
    expect((await layer.batches.get(batch.id))?.batch.producedOn).toBe("2026-11-10");

    const same = await layer.batches.update(batch.id, { producedOn: "2026-11-12", entries: [] });
    expect(same.producedOn).toBe("2026-11-12");
    const earlier = await layer.batches.update(batch.id, { producedOn: "2026-11-01", entries: [] });
    expect(earlier.producedOn).toBe("2026-11-01");
  });

  it("lets a batch without burn tests move its production date freely", async () => {
    const { layer, batch } = await withBatch("2026-11-10");
    const moved = await layer.batches.update(batch.id, { producedOn: "2026-11-19", entries: [] });
    expect(moved.producedOn).toBe("2026-11-19");
  });

  it("refuses a burn test dated before its batch, on create and on update", async () => {
    const { layer, batch } = await withBatch("2026-11-10");
    expect(await code(layer.burnSessions.create({ sessionId: id(), batchId: batch.id, ...session("2026-11-09") }))).toBe(
      "invalid",
    );
    expect(await layer.burnSessions.list()).toHaveLength(0);

    const sessionId = id();
    await layer.burnSessions.create({ sessionId, batchId: batch.id, ...session("2026-11-10") });
    expect(await code(layer.burnSessions.update(sessionId, session("2026-11-01")))).toBe("invalid");
    expect((await layer.burnSessions.get(sessionId))?.session.testedOn).toBe("2026-11-10");
  });
});
