import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { applyRestore, exportBackup, planRestore, readDeviceData } from "@/lib/backup";
import type { IntegrityProblem } from "@/lib/backup";
import type { DataStoreName } from "@/lib/types";
import { id, setup } from "../db/harness";
import { blankDevice, makeSource, planFor } from "./apply-harness";
import { NOW, buildRich, drop, envelopeOf, exportOf, expectRefused, rebuild, safetyOf, snapshot } from "./integrity-harness";
import type { Rich } from "./integrity-harness";

/**
 * Restore integrity matrix (v0.3 fix), part 1: a device-only parent under
 * Replace and Merge for every dependent store, mode switching, a stale device,
 * a bypassed preview, and pre-existing breakage on the device. Generated test
 * data only; see integrity-harness.ts for the shape of the source device.
 */

type Case = {
  name: string;
  /** The problem Replace must name. */
  problem: IntegrityProblem;
  /** Parents the file leaves out (they stay on the device). */
  drop: [DataStoreName, string][];
  /** Dependents taken off the device so the file's copy is new under Merge. */
  prune: [DataStoreName, string][];
  /** True when the dependent can be read through the data layer. */
  read: () => Promise<boolean>;
};

const CASES: { name: string; make: (r: Rich) => Case }[] = [
  {
    name: "version -> formula",
    make: (r) => ({
      name: "version -> formula",
      problem: { store: "formulaVersions", id: r.vB.id, reason: "formula-missing", missingId: r.F2 },
      drop: [["formulas", r.F2]],
      prune: [["measurements", r.m2.id], ["formulaVersions", r.vB.id]],
      read: async () => (await r.device.layer.versions.get(r.vB.id))?.formulaId === r.F2,
    }),
  },
  {
    name: "measurement -> version",
    make: (r) => ({
      name: "measurement -> version",
      problem: { store: "measurements", id: r.m2.id, reason: "version-missing", missingId: r.vB.id },
      drop: [["formulaVersions", r.vB.id]],
      prune: [["measurements", r.m2.id]],
      read: async () => (await r.device.layer.measurements.getForVersion(r.vB.id))?.id === r.m2.id,
    }),
  },
  {
    name: "batch -> version",
    make: (r) => ({
      name: "batch -> version",
      problem: { store: "batches", id: r.C.id, reason: "version-missing", missingId: r.v2.id },
      drop: [["formulaVersions", r.v2.id]],
      prune: [["batches", r.C.id]],
      read: async () => (await r.device.layer.batches.get(r.C.id))?.version.id === r.v2.id,
    }),
  },
  {
    name: "cure plan -> batch",
    make: (r) => ({
      name: "cure plan -> batch",
      problem: { store: "curePlans", id: r.D.id, reason: "batch-missing", missingId: r.D.id },
      drop: [["batches", r.D.id]],
      prune: [["curePlans", r.D.id]],
      read: async () => (await r.device.layer.curePlans.get(r.D.id))?.id === r.D.id,
    }),
  },
  {
    name: "production entry -> version",
    make: (r) => ({
      name: "production entry -> version",
      problem: { store: "productionPlans", id: r.E1.id, reason: "version-missing", missingId: r.vG.id },
      drop: [["formulaVersions", r.vG.id]],
      prune: [["productionPlans", r.E1.id]],
      read: async () => (await r.device.layer.productionPlans.get(r.E1.id))?.version.id === r.vG.id,
    }),
  },
  {
    name: "production entry -> batch",
    make: (r) => ({
      name: "production entry -> batch",
      problem: { store: "productionPlans", id: r.E2.id, reason: "batch-missing", missingId: r.B.id },
      drop: [["batches", r.B.id]],
      prune: [["productionPlans", r.E2.id]],
      read: async () => (await r.device.layer.productionPlans.get(r.E2.id))?.batch?.id === r.B.id,
    }),
  },
  {
    name: "burn session -> batch",
    make: (r) => ({
      name: "burn session -> batch",
      problem: { store: "burnSessions", id: r.S.id, reason: "batch-missing", missingId: r.H.id },
      drop: [["batches", r.H.id]],
      prune: [["burnSessions", r.S.id]],
      read: async () => (await r.device.layer.burnSessions.get(r.S.id))?.batch.id === r.H.id,
    }),
  },
  {
    name: "photo -> burn session",
    make: (r) => ({
      name: "photo -> burn session",
      problem: { store: "burnPhotos", id: r.P.id, reason: "session-missing", missingId: r.S2.id },
      drop: [["burnSessions", r.S2.id]],
      prune: [["burnPhotos", r.P.id]],
      read: async () => (await r.device.layer.burnPhotos.listBySession(r.S2.id)).some((photo) => photo.id === r.P.id),
    }),
  },
  {
    name: "lot -> material",
    make: (r) => ({
      name: "lot -> material",
      problem: { store: "materialLots", id: r.L3.id, reason: "material-missing", missingId: r.L3.materialId },
      drop: [["materials", r.L3.materialId]],
      prune: [["materialLots", r.L3.id]],
      read: async () => (await r.device.layer.materialLots.get(r.L3.id))?.materialId === r.L3.materialId,
    }),
  },
  {
    name: "lot -> supplier",
    make: (r) => ({
      name: "lot -> supplier",
      problem: { store: "materialLots", id: r.L4.id, reason: "supplier-missing", missingId: r.s2.id },
      drop: [["suppliers", r.s2.id]],
      prune: [["materialLots", r.L4.id]],
      read: async () => (await r.device.layer.materialLots.get(r.L4.id))?.supplierId === r.s2.id,
    }),
  },
  {
    name: "batch lot link -> lot",
    make: (r) => ({
      name: "batch lot link -> lot",
      problem: { store: "batches", id: r.K.id, reason: "lot-missing", missingId: r.waxLot.id },
      drop: [["materialLots", r.waxLot.id]],
      prune: [["batches", r.K.id]],
      read: async () => (await r.device.layer.batches.get(r.K.id))?.batch.lots?.length === 2,
    }),
  },
];
const NAMES = CASES.map((c) => c.name);

/** The file for one case: a full export with the case's parents left out, counts and checksum rebuilt. */
async function fileFor(r: Rich, c: Case): Promise<string> {
  const env = await exportOf(r);
  for (const [store, recordId] of c.drop) drop(env, store, recordId);
  return rebuild(env);
}

const caseOf = (r: Rich, name: string) => CASES.find((c) => c.name === name)!.make(r);

describe("device-only parent under Replace, for every dependent store", () => {
  it.each(NAMES)("%s: the check accepts, the plan names the broken link, apply refuses and changes nothing", async (name) => {
    const r = await buildRich();
    const { db } = r.device;
    const c = caseOf(r, name);
    const text = await fileFor(r, c);
    const envelope = await envelopeOf(text, db); // the check counts device ids as parents, so it is ok

    const plan = planRestore(envelope, await readDeviceData(db), { mode: "replace", policy: "keepDevice", fileName: "edited.json" });
    expect(plan.problems).toEqual([c.problem]);

    const safetyBackup = await safetyOf(db);
    const result = await expectRefused(db, plan, { safetyBackup });
    if (!result.ok && result.reason === "integrity") expect(result.problems).toEqual([c.problem]);
    expect(await c.read()).toBe(true);
  });
});

describe("the same files under Merge (device parents remain)", () => {
  it.each(NAMES)("%s: no problems, apply is ok and the dependent reads through the data layer", async (name) => {
    const r = await buildRich();
    const { db } = r.device;
    const c = caseOf(r, name);
    const text = await fileFor(r, c);
    for (const [store, recordId] of c.prune) await db.table(store).delete(recordId); // the file's copy is now new here
    expect(await c.read()).toBe(false);

    const plan = planRestore(await envelopeOf(text, db), await readDeviceData(db), { mode: "merge", policy: "keepDevice", fileName: "edited.json" });
    expect(plan.problems).toEqual([]);
    const result = await applyRestore(db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await c.read()).toBe(true);
  });
});

describe("mode switching between check and apply", () => {
  it("one checked envelope: merge ok, replace has problems, merge ok again, and the first plan still applies", async () => {
    const r = await buildRich();
    const { db } = r.device;
    const c = caseOf(r, "batch -> version");
    const text = await fileFor(r, c);
    await db.batches.delete(r.C.id);
    const envelope = await envelopeOf(text, db);
    const deviceNow = await readDeviceData(db);
    const plan = (mode: "merge" | "replace") =>
      planRestore(envelope, deviceNow, { mode, policy: "keepDevice", fileName: "edited.json" });

    const first = plan("merge");
    expect(first.problems).toEqual([]);
    expect(plan("replace").problems).toEqual([c.problem]);
    expect(plan("merge").problems).toEqual([]);
    expect(first.clear).toBe(false);
    expect((await applyRestore(db, first, { now: () => NOW })).ok).toBe(true);
    expect((await r.device.layer.batches.get(r.C.id))?.version.id).toBe(r.v2.id);
  });
});

describe("a device that changed before apply", () => {
  /** A target holding v1 etc., a file with a new batch of v1 and no formulas, versions or measurements. */
  async function mergeScenario() {
    const src = await makeSource();
    const target = blankDevice(src.device.lib);
    const first = await exportBackupText(src.device.db);
    await applyRestore(target.db, await planFor(target.db, await envelopeOf(first, target.db)), { now: () => NOW });
    const { batch } = await src.device.layer.batches.create({
      batchId: id(),
      versionId: src.first.version.id,
      producedOn: "2026-11-20",
      entries: [],
    });
    const env = JSON.parse(await exportBackupText(src.device.db));
    env.data.formulas = [];
    env.data.formulaVersions = [];
    env.data.measurements = [];
    const text = await rebuild(env);
    return { src, target, batch, text, version: src.first.version };
  }

  async function exportBackupText(db: Parameters<typeof exportBackup>[0]) {
    return (await exportBackup(db, { now: () => NOW })).json;
  }

  it("a fine Merge plan, then the device loses the batch's version: apply is refused and nothing changes", async () => {
    const { target, text, version } = await mergeScenario();
    const plan = await planFor(target.db, await envelopeOf(text, target.db), "merge");
    expect(plan.problems).toEqual([]);
    expect(plan.puts.batches).toHaveLength(1);
    await target.db.formulaVersions.delete(version.id);
    await expectRefused(target.db, plan, {}, ["stale", "integrity"]);
    expect(await target.db.batches.count()).toBe(0);
  });

  it("a Replace plan built against the device, with a matching safety backup, is refused as integrity", async () => {
    const { target, text } = await mergeScenario();
    const plan = await planFor(target.db, await envelopeOf(text, target.db), "replace");
    expect(plan.problems.length).toBeGreaterThan(0);
    const safetyBackup = await safetyOf(target.db);
    const result = await expectRefused(target.db, plan, { safetyBackup });
    expect(result).toMatchObject({ reason: "integrity" });
  });
});

describe("a bypassed or tampered preview", () => {
  it("a Replace plan with its problems forced to [] is still refused as integrity", async () => {
    const r = await buildRich();
    const { db } = r.device;
    const c = caseOf(r, "batch -> version");
    const envelope = await envelopeOf(await fileFor(r, c), db);
    const plan = planRestore(envelope, await readDeviceData(db), { mode: "replace", policy: "keepDevice", fileName: "edited.json" });
    expect(plan.problems.length).toBeGreaterThan(0);
    const hidden = { ...plan, problems: [] };
    const result = await expectRefused(db, hidden, { safetyBackup: await safetyOf(db) });
    expect(result).toMatchObject({ reason: "integrity" });
  });

  it("a Merge plan with a batch pushed into its puts whose version is nowhere is refused (stale or integrity)", async () => {
    const r = await buildRich();
    const { db } = r.device;
    const c = caseOf(r, "batch -> version");
    const text = await fileFor(r, c);
    await db.batches.delete(r.C.id);
    const plan = planRestore(await envelopeOf(text, db), await readDeviceData(db), { mode: "merge", policy: "keepDevice", fileName: "edited.json" });
    expect(plan.problems).toEqual([]);
    const bad = { ...r.K, id: id(), versionId: id(), lots: undefined };
    const tampered = { ...plan, puts: { ...plan.puts, batches: [...plan.puts.batches, bad] } };
    await expectRefused(db, tampered, {}, ["stale", "integrity"]);
  });

  it("a tampered Merge plan that also forces problems to [] and keeps its expected counts consistent is still refused", async () => {
    const r = await buildRich();
    const { db } = r.device;
    const text = await fileFor(r, caseOf(r, "batch -> version"));
    await db.batches.delete(r.C.id);
    const plan = planRestore(await envelopeOf(text, db), await readDeviceData(db), { mode: "merge", policy: "keepDevice", fileName: "edited.json" });
    const bad = { ...r.K, id: id(), versionId: id(), lots: undefined };
    const tampered = {
      ...plan,
      problems: [],
      puts: { ...plan.puts, batches: [...plan.puts.batches, bad] },
      expectedCounts: { ...plan.expectedCounts, batches: plan.expectedCounts.batches + 1 },
    };
    await expectRefused(db, tampered, {}, ["stale", "integrity"]);
  });
});

describe("pre-existing breakage on the device", () => {
  it("Merge of an unrelated valid file lists no problems and applies, leaving the device's own broken batch alone", async () => {
    const device = setup();
    const own = await makeSource(); // gives a library and a real batch to copy
    const { batch } = await own.device.layer.batches.create({
      batchId: id(),
      versionId: own.first.version.id,
      producedOn: "2026-11-10",
      entries: [],
    });
    const broken = { ...batch, id: id(), versionId: id() };
    await device.db.batches.put(broken);

    const other = await makeSource();
    const text = (await exportBackup(other.device.db, { now: () => NOW })).json;
    const envelope = await envelopeOf(text, device.db);
    const plan = await planFor(device.db, envelope, "merge");
    expect(plan.puts.formulas.length).toBeGreaterThan(0);
    expect(plan.problems).toEqual([]);

    const result = await applyRestore(device.db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    expect((await device.db.batches.get(broken.id))?.versionId).toBe(broken.versionId);
    expect((await snapshot(device.db)).data).toContain(broken.id);
  });
});
