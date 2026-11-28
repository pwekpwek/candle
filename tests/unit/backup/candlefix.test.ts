import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  applyRestore,
  canonicalJson,
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  planRestore,
  readDeviceData,
} from "@/lib/backup";
import type { IntegrityProblem, RestoreMode } from "@/lib/backup";
import type { CandleDatabase } from "@/lib/db";
import type { BackupEnvelope, DataStoreName } from "@/lib/types";
import { id } from "../db/harness";
import { blankDevice } from "./apply-harness";
import { NOW, buildRich, drop, envelopeOf, exportOf, expectRefused, fakeJpeg, rebuild, safetyOf, snapshot } from "./integrity-harness";

/**
 * v0.3 CandleFix: backup format 6 and restore integrity for the new links
 * (docs/v0.3-candlefix.md "Backup format 6"). Generated data only.
 *
 * On top of the rich device (integrity-harness.ts):
 *   Q   a batch of v1 with nothing else on it, investigated by I
 *   I   investigation of Q with hypotheses h1, h2; photos IP1, IP2
 *   SC  a burn test of follow-up batch C (v2)
 *   X   experiment: I/h1 -> follow-up C, lists SC
 */
async function buildFix() {
  const r = await buildRich();
  const { layer } = r.device;
  const { batch: Q } = await layer.batches.create({ batchId: id(), versionId: r.v1.id, producedOn: "2026-11-10", label: "Q", entries: [] });
  const { investigation: I } = await layer.investigations.create({
    investigationId: id(),
    batchId: Q.id,
    observedOn: "2026-11-15",
    title: "Frost and tunnel",
    issues: ["frosting", "tunneling", "other"],
    otherIssue: "Uneven colour",
    notes: "Made-up observation for tests.",
    checks: [{ itemId: "frosting.pour-temperature", issue: "frosting", label: "Pour temperature", checked: true, note: "60 C" }],
    hypotheses: [
      { text: "Wick too small", status: "testing" },
      { text: "Cold container", status: "open" },
    ],
  });
  const [h1, h2] = I.hypotheses;
  const { photo: IP1 } = await layer.investigationPhotos.add({ photoId: id(), investigationId: I.id, bytes: fakeJpeg(2048, 7), width: 1200, height: 900, caption: "Top view" });
  const { photo: IP2 } = await layer.investigationPhotos.add({ photoId: id(), investigationId: I.id, bytes: fakeJpeg(900, 8), width: 640, height: 480 });
  const { session: SC } = await layer.burnSessions.create({
    sessionId: id(),
    batchId: r.C.id,
    testedOn: "2026-11-20",
    milestoneId: null,
    candles: [{ label: "A", wick: { text: "CD-12" }, burns: [{ durationMin: 180, weightBeforeMg: 250_000, weightAfterMg: 238_000 }] }],
  });
  const { experiment: X } = await layer.correctiveExperiments.create({
    experimentId: id(),
    investigationId: I.id,
    hypothesisId: h1!.id,
    followUpBatchId: r.C.id,
    burnSessionIds: [SC.id],
    change: "One wick size up",
  });
  return { ...r, Q, I, h1: h1!, h2: h2!, IP1, IP2, SC, X };
}
type Fix = Awaited<ReturnType<typeof buildFix>>;

function plan(envelope: BackupEnvelope, device: Awaited<ReturnType<typeof readDeviceData>>, mode: RestoreMode, policy: "keepDevice" | "useBackup" = "keepDevice") {
  return planRestore(envelope, device, { mode, policy, fileName: "edited.json" });
}

const sortProblems = (list: readonly IntegrityProblem[]) =>
  [...list].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));

/** Deletes records from the device directly, so the file's copies are new under Merge. */
async function prune(db: CandleDatabase, rows: [DataStoreName, string][]) {
  for (const [store, recordId] of rows) await db.table(store).delete(recordId);
}

describe("backup format 6 export and round trip", () => {
  it("exports the CandleFix stores (photos as base64 with SHA-256) and restores them byte for byte by Replace and Merge", async () => {
    const f = await buildFix();
    const exported = await exportBackup(f.device.db, { now: () => NOW });
    const env = exported.envelope;
    expect(env.formatVersion).toBe(6);
    expect(env.schemaVersion).toBe(6);
    expect(env.counts).toMatchObject({ investigations: 1, investigationPhotos: 2, correctiveExperiments: 1 });
    const photo = env.data.investigationPhotos.find((p) => p.id === f.IP1.id)!;
    expect(photo.sha256).toBe(f.IP1.sha256);
    expect(Buffer.from(photo.dataBase64, "base64").equals(Buffer.from(fakeJpeg(2048, 7)))).toBe(true);
    const source = canonicalJson(await readDeviceData(f.device.db));

    for (const mode of ["replace", "merge"] as const) {
      const target = blankDevice(f.device.lib);
      const checked = await envelopeOf(exported.json, target.db);
      const p = plan(checked, await readDeviceData(target.db), mode);
      expect(p.problems).toEqual([]);
      const options = mode === "replace" ? { safetyBackup: await safetyOf(target.db), now: () => NOW } : { now: () => NOW };
      const result = await applyRestore(target.db, p, options);
      expect(result.ok, mode).toBe(true);
      expect(canonicalJson(await readDeviceData(target.db)), mode).toBe(source);
      const stored = await target.db.investigationPhotos.get(f.IP1.id);
      expect(Buffer.from(stored!.bytes).equals(Buffer.from(fakeJpeg(2048, 7))), mode).toBe(true);
      const detail = await target.layer.investigations.get(f.I.id);
      expect(detail?.experiments[0]?.burnSessions.map((s) => s.session.id), mode).toEqual([f.SC.id]);
      expect(detail?.version.id, mode).toBe(f.v1.id);
    }

    // Restoring the same file again finds everything identical, photos included.
    const again = plan(await envelopeOf(exported.json, f.device.db), await readDeviceData(f.device.db), "merge");
    expect(again.tally.investigations).toEqual({ new: 0, identical: 1, conflict: 0 });
    expect(again.tally.investigationPhotos).toEqual({ new: 0, identical: 2, conflict: 0 });
    expect(again.tally.correctiveExperiments).toEqual({ new: 0, identical: 1, conflict: 0 });
  });

  it("a format 5 file (no CandleFix stores) restores into a device that has CandleFix data", async () => {
    const f = await buildFix();
    const env = await exportOf(f);
    const v5 = structuredClone(env);
    v5.formatVersion = 5;
    v5.schemaVersion = 5;
    for (const store of ["investigations", "investigationPhotos", "correctiveExperiments"] as const) {
      delete (v5.data as unknown as Record<string, unknown>)[store];
    }
    const text = await rebuild(v5);
    const checked = await envelopeOf(text, f.device.db);
    expect(checked.formatVersion).toBe(5);
    expect(checked.data.investigations).toEqual([]);

    // Merge keeps the device's CandleFix records.
    const merge = plan(checked, await readDeviceData(f.device.db), "merge");
    expect(merge.problems).toEqual([]);
    expect((await applyRestore(f.device.db, merge, { now: () => NOW })).ok).toBe(true);
    expect(await f.device.db.investigations.count()).toBe(1);

    // Replace keeps only the file, so the CandleFix records go (the maker confirmed Replace).
    const replace = plan(checked, await readDeviceData(f.device.db), "replace");
    expect(replace.problems).toEqual([]);
    expect(replace.expectedCounts).toMatchObject({ investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 });
    expect((await applyRestore(f.device.db, replace, { now: () => NOW, safetyBackup: await safetyOf(f.device.db) })).ok).toBe(true);
    expect(await f.device.db.investigationPhotos.count()).toBe(0);
  });
});

describe("format 6 checks", () => {
  it("refuses an investigation photo whose bytes do not match its checksum, naming it", async () => {
    const f = await buildFix();
    const env = await exportOf(f);
    const target = env.data.investigationPhotos.find((p) => p.id === f.IP2.id)!;
    const bytes = Buffer.from(target.dataBase64, "base64");
    bytes[10] = (bytes[10]! + 1) % 256;
    target.dataBase64 = bytes.toString("base64");
    const text = await rebuild(env);
    const result = await checkBackupText(text, Buffer.byteLength(text), deviceIdsOf(await readDeviceData(blankDevice(f.device.lib).db)));
    expect(result).toEqual({
      ok: false,
      failure: { code: "invalid", count: 1, firstLabel: `investigation photo ${f.IP2.id.slice(0, 8)}…`, firstProblem: "photo data does not match its checksum" },
    });
  });

  it("counts CandleFix records whose parents are neither in the file nor on the device", async () => {
    const f = await buildFix();
    const env = await exportOf(f);
    drop(env, "batches", f.Q.id);
    const noInvestigation = structuredClone(env);
    drop(env, "burnSessions", f.SC.id);
    drop(noInvestigation, "investigations", f.I.id);
    const blank = blankDevice(f.device.lib);
    const ids = deviceIdsOf(await readDeviceData(blank.db));
    const a = await rebuild(env);
    const first = await checkBackupText(a, Buffer.byteLength(a), ids);
    expect(first.ok).toBe(false);
    expect(!first.ok && first.failure).toMatchObject({ code: "orphans", investigations: 1, investigationPhotos: 0, correctiveExperiments: 1 });
    const b = await rebuild(noInvestigation);
    const second = await checkBackupText(b, Buffer.byteLength(b), ids);
    expect(!second.ok && second.failure).toMatchObject({ code: "orphans", investigations: 0, investigationPhotos: 2, correctiveExperiments: 1 });
  });
});

type Case = {
  name: string;
  problems: (f: Fix) => IntegrityProblem[];
  drop: (f: Fix) => [DataStoreName, string][];
  /** Dependents taken off the device so they are new under Merge. */
  prune: (f: Fix) => [DataStoreName, string][];
};

const DEVICE_ONLY_PARENTS: Case[] = [
  {
    name: "investigation -> batch",
    problems: (f) => [{ store: "investigations", id: f.I.id, reason: "batch-missing", missingId: f.Q.id }],
    drop: (f) => [["batches", f.Q.id]],
    prune: (f) => [["correctiveExperiments", f.X.id], ["investigationPhotos", f.IP1.id], ["investigationPhotos", f.IP2.id], ["investigations", f.I.id]],
  },
  {
    name: "photo and experiment -> investigation",
    problems: (f) => [
      { store: "investigationPhotos", id: f.IP1.id, reason: "investigation-missing", missingId: f.I.id },
      { store: "investigationPhotos", id: f.IP2.id, reason: "investigation-missing", missingId: f.I.id },
      { store: "correctiveExperiments", id: f.X.id, reason: "investigation-missing", missingId: f.I.id },
    ],
    drop: (f) => [["investigations", f.I.id]],
    prune: (f) => [["correctiveExperiments", f.X.id], ["investigationPhotos", f.IP1.id], ["investigationPhotos", f.IP2.id]],
  },
  {
    name: "experiment -> follow-up batch",
    problems: (f) => [
      { store: "burnSessions", id: f.SC.id, reason: "batch-missing", missingId: f.C.id },
      { store: "correctiveExperiments", id: f.X.id, reason: "follow-up-missing", missingId: f.C.id },
    ],
    drop: (f) => [["batches", f.C.id]],
    prune: (f) => [["correctiveExperiments", f.X.id]],
  },
  {
    name: "experiment -> listed burn test",
    problems: (f) => [{ store: "correctiveExperiments", id: f.X.id, reason: "listed-session-missing", missingId: f.SC.id }],
    drop: (f) => [["burnSessions", f.SC.id]],
    prune: (f) => [["correctiveExperiments", f.X.id]],
  },
];

describe("restore integrity: CandleFix parents only on the device", () => {
  for (const c of DEVICE_ONLY_PARENTS) {
    it(`${c.name}: Replace is refused and changes nothing; Merge uses the device's parent`, async () => {
      const f = await buildFix();
      const env = await exportOf(f);
      for (const [store, recordId] of c.drop(f)) drop(env, store, recordId);
      const text = await rebuild(env);

      const replace = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "replace");
      expect(sortProblems(replace.problems)).toEqual(sortProblems(c.problems(f)));
      await expectRefused(f.device.db, replace, { safetyBackup: await safetyOf(f.device.db) });

      await prune(f.device.db, c.prune(f));
      const before = await snapshot(f.device.db);
      const merge = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "merge");
      expect(merge.problems).toEqual([]);
      const result = await applyRestore(f.device.db, merge, { now: () => NOW });
      expect(result.ok).toBe(true);
      expect((await snapshot(f.device.db)).data).not.toBe(before.data);
      const detail = await f.device.layer.investigations.get(f.I.id);
      expect(detail?.experiments.map((e) => e.experiment.id)).toEqual([f.X.id]);
      expect(detail?.experiments[0]?.burnSessions.map((s) => s.session.id)).toEqual([f.SC.id]);
      expect(detail?.photoCount).toBe(2);
    });
  }
});

describe("restore integrity: CandleFix ownership", () => {
  const EDITS: { name: string; edit: (f: Fix, env: BackupEnvelope) => IntegrityProblem }[] = [
    {
      name: "a hypothesis that is not in its investigation",
      edit: (f, env) => {
        const missing = id();
        env.data.correctiveExperiments[0]!.hypothesisId = missing;
        return { store: "correctiveExperiments", id: f.X.id, reason: "hypothesis-missing", missingId: missing };
      },
    },
    {
      name: "a follow-up batch that is the investigated batch",
      edit: (f, env) => {
        Object.assign(env.data.correctiveExperiments[0]!, { followUpBatchId: f.Q.id, burnSessionIds: [] });
        return { store: "correctiveExperiments", id: f.X.id, reason: "follow-up-is-original", missingId: f.Q.id };
      },
    },
    {
      name: "a listed burn test of another batch",
      edit: (f, env) => {
        env.data.correctiveExperiments[0]!.burnSessionIds = [f.S.id];
        return { store: "correctiveExperiments", id: f.X.id, reason: "session-of-other-batch", missingId: f.S.id };
      },
    },
  ];
  for (const e of EDITS) {
    it(`${e.name}: refused under Replace and under Merge`, async () => {
      const f = await buildFix();
      const env = await exportOf(f);
      const expected = e.edit(f, env);
      const text = await rebuild(env);
      const replace = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "replace");
      expect(replace.problems).toEqual([expected]);
      await expectRefused(f.device.db, replace, { safetyBackup: await safetyOf(f.device.db) });

      await prune(f.device.db, [["correctiveExperiments", f.X.id]]);
      const merge = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "merge");
      expect(merge.problems).toEqual([expected]);
      await expectRefused(f.device.db, merge);
    });
  }

  it("Merge keeping the device's investigation refuses a file experiment on a hypothesis only the file's copy has", async () => {
    const f = await buildFix();
    // The file: I gains hypothesis h3, and a second experiment X2 follows h3.
    const env = await exportOf(f);
    const fileI = env.data.investigations[0]!;
    const h3 = { id: id(), text: "Fragrance load", status: "testing" as const, createdAt: NOW, updatedAt: NOW };
    fileI.hypotheses.push(h3);
    const X2 = { ...env.data.correctiveExperiments[0]!, id: id(), hypothesisId: h3.id, burnSessionIds: [] };
    env.data.correctiveExperiments.push(X2);
    const text = await rebuild(env);

    const keep = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "merge", "keepDevice");
    expect(keep.tally.investigations).toEqual({ new: 0, identical: 0, conflict: 1 });
    expect(keep.problems).toEqual([{ store: "correctiveExperiments", id: X2.id, reason: "hypothesis-missing", missingId: h3.id }]);
    await expectRefused(f.device.db, keep);

    const use = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "merge", "useBackup");
    expect(use.problems).toEqual([]);
    expect((await applyRestore(f.device.db, use, { now: () => NOW })).ok).toBe(true);
    expect((await f.device.layer.investigations.get(f.I.id))?.experiments.map((x) => x.experiment.hypothesisId)).toEqual(
      expect.arrayContaining([f.h1.id, h3.id]),
    );
  });

  it("a stale device: the experiment's burn test is deleted after a valid Merge plan; apply refuses and changes nothing", async () => {
    const f = await buildFix();
    const env = await exportOf(f);
    const text = await rebuild(env);
    await prune(f.device.db, [["correctiveExperiments", f.X.id]]);
    const merge = plan(await envelopeOf(text, f.device.db), await readDeviceData(f.device.db), "merge");
    expect(merge.problems).toEqual([]);
    // Bypass the data layer's guard, as a second tab or a damaged write might.
    await f.device.db.burnSessions.delete(f.SC.id);
    await expectRefused(f.device.db, merge, {}, ["stale", "integrity"]);
  });
});
