import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import type { InvestigationInput } from "@/lib/db";
import { MAX_INVESTIGATION_PHOTOS } from "@/lib/types";
import { counterOf, id, makeLibrary, newFormulaRequest, revisionRequest, setup, we5Input } from "./harness";

/** v0.3 CandleFix data layer (docs/v0.3-candlefix.md). Generated data and made-up names only. */

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

/** A generated "JPEG" (FF D8 FF marker and patterned bytes). Not a real photo. */
function fakeJpeg(size = 64, seed = 1): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * 5 + seed * 11) % 256;
  return bytes;
}

/** A formula with two versions, an original batch from v1 (2026-11-10) and a follow-up batch from v2 (2026-11-20). */
async function world() {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  const first = await ctx.layer.versions.save(newFormulaRequest(we5Input(lib)));
  const second = await ctx.layer.versions.save(
    revisionRequest(first.formula.id, first.version.id, we5Input(lib, { fragranceBp: 700, changeNote: "less oil" })),
  );
  const { batch: original } = await ctx.layer.batches.create({
    batchId: id(),
    versionId: first.version.id,
    producedOn: "2026-11-10",
    label: "FIX-A",
    entries: [],
  });
  const { batch: followUp } = await ctx.layer.batches.create({
    batchId: id(),
    versionId: second.version.id,
    producedOn: "2026-11-20",
    label: "FIX-B",
    entries: [],
  });
  return { ...ctx, lib, first, second, original, followUp };
}

function input(overrides: Partial<InvestigationInput> = {}): InvestigationInput {
  return {
    observedOn: "2026-11-14",
    title: "  Rough top  ",
    issues: ["tunneling", "frosting"],
    notes: "  Seen after the first burn.  ",
    checks: [
      { itemId: "frosting.pour-temperature", issue: "frosting", label: "  Pour temperature  ", checked: true },
      { itemId: "tunneling.first-burn-length", issue: "tunneling", label: "First burn length", checked: false, note: "  2 h  " },
      { itemId: "tunneling.wick-size", issue: "tunneling", label: "Wick size", checked: false },
    ],
    hypotheses: [{ text: "  The wick is small for the tin.  ", status: "open" }],
    ...overrides,
  };
}

async function sessionFor(ctx: Awaited<ReturnType<typeof world>>, batchId: string, testedOn: string) {
  const { session } = await ctx.layer.burnSessions.create({
    sessionId: id(),
    batchId,
    testedOn,
    milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 120 }] }],
  });
  return session;
}

describe("investigations: create", () => {
  it("stores trimmed fields, issues in the fixed order, only ticked or noted checks, and new hypothesis ids", async () => {
    const ctx = await world();
    const before = await counterOf(ctx.layer);
    const investigationId = id();
    const { investigation, created } = await ctx.layer.investigations.create({
      investigationId,
      batchId: ctx.original.id,
      ...input(),
    });
    expect(created).toBe(true);
    expect(investigation).toMatchObject({
      id: investigationId,
      batchId: ctx.original.id,
      observedOn: "2026-11-14",
      title: "Rough top",
      issues: ["frosting", "tunneling"],
      notes: "Seen after the first burn.",
      archivedAt: null,
    });
    expect(investigation.checks).toEqual([
      { itemId: "frosting.pour-temperature", issue: "frosting", label: "Pour temperature", checked: true },
      { itemId: "tunneling.first-burn-length", issue: "tunneling", label: "First burn length", checked: false, note: "2 h" },
    ]);
    expect(investigation.hypotheses).toHaveLength(1);
    expect(investigation.hypotheses[0]).toMatchObject({ text: "The wick is small for the tin.", status: "open" });
    expect(investigation.hypotheses[0]!.createdAt).toBe(investigation.createdAt);
    expect("otherIssue" in investigation).toBe(false);
    expect(await counterOf(ctx.layer)).toBe(before + 1);

    // Retry with the same id writes nothing.
    const again = await ctx.layer.investigations.create({ investigationId, batchId: ctx.original.id, ...input({ title: "Other" }) });
    expect(again.created).toBe(false);
    expect(again.investigation).toEqual(investigation);
    expect(await counterOf(ctx.layer)).toBe(before + 1);
  });

  it("needs the Other text exactly when Other is chosen, and drops it otherwise", async () => {
    const ctx = await world();
    const make = (o: Partial<InvestigationInput>) =>
      ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input(o) });
    expect(await code(make({ issues: ["other"], otherIssue: "   " }))).toBe("invalid");
    const withOther = await make({ issues: ["other", "soot"], otherIssue: "  Smell of smoke  " });
    expect(withOther.investigation.issues).toEqual(["soot", "other"]);
    expect(withOther.investigation.otherIssue).toBe("Smell of smoke");
    const without = await make({ issues: ["soot"], otherIssue: "ignored" });
    expect("otherIssue" in without.investigation).toBe(false);
  });

  it("refuses no issues, a repeated or unknown issue, a missing batch and a date before the batch was made", async () => {
    const ctx = await world();
    const make = (o: Partial<InvestigationInput>, batchId = ctx.original.id) =>
      ctx.layer.investigations.create({ investigationId: id(), batchId, ...input(o) });
    expect(await code(make({ issues: [] }))).toBe("invalid");
    expect(await code(make({ issues: ["soot", "soot"] }))).toBe("invalid");
    expect(await code(make({ issues: ["burnt" as never] }))).toBe("invalid");
    expect(await code(make({}, id()))).toBe("not-found");
    expect(await code(make({ observedOn: "2026-11-09" }))).toBe("invalid");
    expect(await code(make({ observedOn: "2026-11-10" }))).toBe("no error");
  });
});

describe("investigations: update, archive and lists", () => {
  it("keeps a tick's label snapshot and an unchanged hypothesis's timestamps; refuses an unknown hypothesis id", async () => {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({
      investigationId: id(),
      batchId: ctx.original.id,
      ...input({ hypotheses: [{ text: "Wick small", status: "open" }, { text: "Cold room", status: "open" }] }),
    });
    const [h1, h2] = investigation.hypotheses;
    const updated = await ctx.layer.investigations.update(investigation.id, {
      ...input(),
      checks: [{ itemId: "frosting.pour-temperature", issue: "frosting", label: "Reworded text", checked: true, note: "62 C" }],
      hypotheses: [
        { id: h2!.id, text: "Cold room", status: "testing" },
        { id: h1!.id, text: "Wick small", status: "open" },
        { text: "Fragrance load", status: "open" },
      ],
    });
    expect(updated.checks).toEqual([
      { itemId: "frosting.pour-temperature", issue: "frosting", label: "Pour temperature", checked: true, note: "62 C" },
    ]);
    expect(updated.hypotheses.map((h) => h.text)).toEqual(["Cold room", "Wick small", "Fragrance load"]);
    expect(updated.hypotheses[0]).toMatchObject({ id: h2!.id, status: "testing", createdAt: h2!.createdAt });
    expect(updated.hypotheses[0]!.updatedAt).not.toBe(h2!.updatedAt);
    expect(updated.hypotheses[1]).toEqual(h1);
    expect(updated.createdAt).toBe(investigation.createdAt);
    expect(updated.batchId).toBe(ctx.original.id);

    expect(
      await code(ctx.layer.investigations.update(investigation.id, { ...input(), hypotheses: [{ id: id(), text: "x", status: "open" }] })),
    ).toBe("invalid");
  });

  it("keeps a stored date that breaks the rule, but refuses a changed one", async () => {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() });
    // A restore can bring in a date before the batch (as with burn tests, M-2).
    await ctx.db.investigations.put({ ...investigation, observedOn: "2026-11-01" });
    await expect(ctx.layer.investigations.update(investigation.id, input({ observedOn: "2026-11-01", title: "Edited" }))).resolves.toMatchObject({ title: "Edited" });
    expect(await code(ctx.layer.investigations.update(investigation.id, input({ observedOn: "2026-11-02" })))).toBe("invalid");
  });

  it("archives and unarchives; the all-list hides archived ones unless asked, the batch list shows them", async () => {
    const ctx = await world();
    const a = (await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input({ observedOn: "2026-11-12" }) })).investigation;
    const b = (await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input({ observedOn: "2026-11-15" }) })).investigation;
    const archived = await ctx.layer.investigations.setArchived(a.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect((await ctx.layer.investigations.setArchived(a.id, true)).archivedAt).toBe(archived.archivedAt);
    expect((await ctx.layer.investigations.list()).map((i) => i.investigation.id)).toEqual([b.id]);
    expect((await ctx.layer.investigations.list({ includeArchived: true })).map((i) => i.investigation.id)).toEqual([b.id, a.id]);
    const byBatch = await ctx.layer.investigations.listByBatch(ctx.original.id);
    expect(byBatch.map((i) => i.investigation.id)).toEqual([b.id, a.id]);
    expect(byBatch[0]).toMatchObject({ batch: { id: ctx.original.id }, formula: { id: ctx.first.formula.id }, version: { id: ctx.first.version.id }, photoCount: 0, experimentCount: 0 });
    expect((await ctx.layer.investigations.setArchived(a.id, false)).archivedAt).toBeNull();
  });

  it("the batch's production date cannot move past its earliest investigation", async () => {
    const ctx = await world();
    await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input({ observedOn: "2026-11-12" }) });
    const edit = (producedOn: string) => ctx.layer.batches.update(ctx.original.id, { producedOn, entries: [] });
    expect(await code(edit("2026-11-13"))).toBe("invalid");
    expect(await code(edit("2026-11-12"))).toBe("no error");
  });
});

describe("investigation photos", () => {
  it("adds JPEGs up to the limit, idempotently, and refuses a missing investigation", async () => {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() });
    const photoId = id();
    const first = await ctx.layer.investigationPhotos.add({ photoId, investigationId: investigation.id, bytes: fakeJpeg(), width: 10, height: 8, caption: "  Top  " });
    expect(first.created).toBe(true);
    expect(first.photo).toMatchObject({ investigationId: investigation.id, byteLength: 64, caption: "Top", mimeType: "image/jpeg" });
    expect(first.photo.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await ctx.layer.investigationPhotos.add({ photoId, investigationId: investigation.id, bytes: fakeJpeg(80, 2), width: 1, height: 1 })).created).toBe(false);
    for (let i = 1; i < MAX_INVESTIGATION_PHOTOS; i++) {
      await ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: fakeJpeg(32, i), width: 4, height: 4 });
    }
    expect(await code(ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: fakeJpeg(), width: 4, height: 4 }))).toBe("invalid");
    expect(await code(ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: id(), bytes: fakeJpeg(), width: 4, height: 4 }))).toBe("not-found");
    expect(await code(ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: new Uint8Array([1, 2, 3]), width: 4, height: 4 }))).toBe("invalid");
    expect((await ctx.layer.investigationPhotos.listByInvestigation(investigation.id))[0]!.id).toBe(photoId);
    expect(await ctx.layer.investigationPhotos.usage()).toEqual({ count: 12, bytes: 64 + 32 * 11 });
    await ctx.layer.investigationPhotos.delete(photoId);
    expect(await ctx.layer.investigationPhotos.listByInvestigation(investigation.id)).toHaveLength(11);
    expect(await code(ctx.layer.investigationPhotos.delete(photoId))).toBe("not-found");
  });
});

describe("corrective experiments", () => {
  async function withInvestigation() {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() });
    return { ...ctx, investigation, hypothesis: investigation.hypotheses[0]! };
  }

  it("links a hypothesis to a follow-up batch and its burn tests; the links stay fixed on update", async () => {
    const ctx = await withInvestigation();
    const session = await sessionFor(ctx, ctx.followUp.id, "2026-11-25");
    const before = await counterOf(ctx.layer);
    const experimentId = id();
    const { experiment, created } = await ctx.layer.correctiveExperiments.create({
      experimentId,
      investigationId: ctx.investigation.id,
      hypothesisId: ctx.hypothesis.id,
      followUpBatchId: ctx.followUp.id,
      burnSessionIds: [session.id],
      change: "  Next wick size up  ",
      notes: "  ",
    });
    expect(created).toBe(true);
    expect(experiment).toMatchObject({ followUpBatchId: ctx.followUp.id, burnSessionIds: [session.id], change: "Next wick size up" });
    expect("notes" in experiment).toBe(false);
    expect(await counterOf(ctx.layer)).toBe(before + 1);
    expect((await ctx.layer.correctiveExperiments.create({ experimentId, investigationId: ctx.investigation.id, hypothesisId: ctx.hypothesis.id, followUpBatchId: ctx.followUp.id, burnSessionIds: [] })).created).toBe(false);

    const updated = await ctx.layer.correctiveExperiments.update(experimentId, { burnSessionIds: [], notes: "Waiting" });
    expect(updated).toMatchObject({ id: experimentId, hypothesisId: ctx.hypothesis.id, followUpBatchId: ctx.followUp.id, burnSessionIds: [], notes: "Waiting", createdAt: experiment.createdAt });
    expect("change" in updated).toBe(false);
    expect(await ctx.layer.correctiveExperiments.listByInvestigation(ctx.investigation.id)).toEqual([updated]);
  });

  it("refuses a missing hypothesis, investigation, batch or burn test, the original batch, and a burn test of another batch", async () => {
    const ctx = await withInvestigation();
    const ownSession = await sessionFor(ctx, ctx.original.id, "2026-11-15");
    const make = (o: Record<string, unknown>) =>
      ctx.layer.correctiveExperiments.create({
        experimentId: id(),
        investigationId: ctx.investigation.id,
        hypothesisId: ctx.hypothesis.id,
        followUpBatchId: ctx.followUp.id,
        burnSessionIds: [],
        ...o,
      });
    expect(await code(make({ hypothesisId: id() }))).toBe("not-found");
    expect(await code(make({ investigationId: id() }))).toBe("not-found");
    expect(await code(make({ followUpBatchId: id() }))).toBe("not-found");
    expect(await code(make({ followUpBatchId: ctx.original.id }))).toBe("invalid");
    expect(await code(make({ burnSessionIds: [id()] }))).toBe("not-found");
    expect(await code(make({ burnSessionIds: [ownSession.id] }))).toBe("invalid");
    const s = await sessionFor(ctx, ctx.followUp.id, "2026-11-22");
    expect(await code(make({ burnSessionIds: [s.id, s.id] }))).toBe("invalid");
  });
});

describe("CandleFix delete rules: history is never silently rewritten", () => {
  it("refuses deleting a batch with an investigation, a follow-up batch, a listed burn test and a named hypothesis", async () => {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() });
    const session = await sessionFor(ctx, ctx.followUp.id, "2026-11-25");
    const { experiment } = await ctx.layer.correctiveExperiments.create({
      experimentId: id(),
      investigationId: investigation.id,
      hypothesisId: investigation.hypotheses[0]!.id,
      followUpBatchId: ctx.followUp.id,
      burnSessionIds: [session.id],
    });

    expect(await ctx.layer.batches.deletionImpact(ctx.original.id)).toMatchObject({ investigations: 1, followUpExperiments: 0 });
    expect(await ctx.layer.batches.deletionImpact(ctx.followUp.id)).toMatchObject({ burnSessions: 1, investigations: 0, followUpExperiments: 1 });
    expect(await ctx.layer.burnSessions.deletionImpact(session.id)).toEqual({ photos: 0, experiments: 1 });
    expect(await code(ctx.layer.batches.delete(ctx.original.id))).toBe("in-use");
    expect(await code(ctx.layer.burnSessions.delete(session.id))).toBe("in-use");
    expect(await code(ctx.layer.investigations.update(investigation.id, { ...input(), hypotheses: [] }))).toBe("in-use");

    // The follow-up batch without burn tests is still refused while it is a follow-up.
    await ctx.layer.correctiveExperiments.update(experiment.id, { burnSessionIds: [] });
    await ctx.layer.burnSessions.delete(session.id);
    expect(await code(ctx.layer.batches.delete(ctx.followUp.id))).toBe("in-use");

    // Removing the experiment frees the follow-up batch and the hypothesis.
    await ctx.layer.correctiveExperiments.delete(experiment.id);
    expect(await code(ctx.layer.batches.delete(ctx.followUp.id))).toBe("no error");
    await expect(ctx.layer.investigations.update(investigation.id, { ...input(), hypotheses: [] })).resolves.toMatchObject({ hypotheses: [] });
  });

  it("deleting an investigation removes its photos and experiments in one transaction and nothing else", async () => {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() });
    const keep = (await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() })).investigation;
    await ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: fakeJpeg(), width: 4, height: 4 });
    await ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: fakeJpeg(70, 3), width: 4, height: 4 });
    const keptPhoto = (await ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: keep.id, bytes: fakeJpeg(), width: 4, height: 4 })).photo;
    const session = await sessionFor(ctx, ctx.followUp.id, "2026-11-25");
    await ctx.layer.correctiveExperiments.create({ experimentId: id(), investigationId: investigation.id, hypothesisId: investigation.hypotheses[0]!.id, followUpBatchId: ctx.followUp.id, burnSessionIds: [session.id] });

    expect(await ctx.layer.investigations.deletionImpact(investigation.id)).toEqual({ photos: 2, experiments: 1 });
    const before = await counterOf(ctx.layer);
    await ctx.layer.investigations.delete(investigation.id);
    expect(await counterOf(ctx.layer)).toBe(before + 1);
    expect(await ctx.db.investigations.get(investigation.id)).toBeUndefined();
    expect((await ctx.db.investigationPhotos.toArray()).map((p) => p.id)).toEqual([keptPhoto.id]);
    expect(await ctx.db.correctiveExperiments.count()).toBe(0);
    expect(await ctx.db.batches.count()).toBe(2);
    expect(await ctx.db.burnSessions.get(session.id)).toBeDefined();
    expect(await code(ctx.layer.investigations.delete(investigation.id))).toBe("not-found");
    // The original batch still has the other investigation.
    expect(await code(ctx.layer.batches.delete(ctx.original.id))).toBe("in-use");
  });
});

describe("investigation reads for the screens", () => {
  it("get, followUpLinks and comparison join batches, versions, burn tests and investigations", async () => {
    const ctx = await world();
    const { investigation } = await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.original.id, ...input() });
    const originalSession = await sessionFor(ctx, ctx.original.id, "2026-11-12");
    const s1 = await sessionFor(ctx, ctx.followUp.id, "2026-11-22");
    const s2 = await sessionFor(ctx, ctx.followUp.id, "2026-11-26");
    const followUpIssue = (await ctx.layer.investigations.create({ investigationId: id(), batchId: ctx.followUp.id, ...input({ observedOn: "2026-11-27", issues: ["soot"], hypotheses: [] }) })).investigation;
    await ctx.layer.investigationPhotos.add({ photoId: id(), investigationId: investigation.id, bytes: fakeJpeg(), width: 4, height: 4 });
    const { experiment } = await ctx.layer.correctiveExperiments.create({
      experimentId: id(),
      investigationId: investigation.id,
      hypothesisId: investigation.hypotheses[0]!.id,
      followUpBatchId: ctx.followUp.id,
      burnSessionIds: [s2.id, s1.id],
    });

    const detail = await ctx.layer.investigations.get(investigation.id);
    expect(detail).toMatchObject({ photoCount: 1, experimentCount: 1, version: { id: ctx.first.version.id } });
    expect(detail!.experiments).toHaveLength(1);
    expect(detail!.experiments[0]!.followUp.version.id).toBe(ctx.second.version.id);
    expect(detail!.experiments[0]!.burnSessions.map((s) => s.session.id)).toEqual([s2.id, s1.id]);
    expect(await ctx.layer.investigations.get(id())).toBeUndefined();

    const links = await ctx.layer.investigations.followUpLinks(ctx.followUp.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ experiment: { id: experiment.id }, investigation: { id: investigation.id }, original: { batch: { id: ctx.original.id } } });
    expect(await ctx.layer.investigations.followUpLinks(ctx.original.id)).toEqual([]);

    const data = await ctx.layer.investigations.comparison(investigation.id);
    expect(data!.original.item.version.id).toBe(ctx.first.version.id);
    expect(data!.original.burnSessions.map((s) => s.session.id)).toEqual([originalSession.id]);
    expect(data!.original.investigations.map((i) => i.id)).toEqual([investigation.id]);
    expect(data!.experiments[0]!.followUp.burnSessions.map((s) => s.session.id)).toEqual([s2.id, s1.id]);
    expect(data!.experiments[0]!.followUp.investigations.map((i) => i.id)).toEqual([followUpIssue.id]);
    expect(await ctx.layer.investigations.comparison(id())).toBeUndefined();
  });
});
