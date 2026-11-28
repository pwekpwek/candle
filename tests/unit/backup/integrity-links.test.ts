import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyRestore, planRestore, readDeviceData } from "@/lib/backup";
import type { IntegrityProblem } from "@/lib/backup";
import type { BackupEnvelope } from "@/lib/types";
import { id, setup } from "../db/harness";
import { blankDevice, planFor } from "./apply-harness";
import { NOW, buildRich, drop, envelopeOf, exportOf, expectRefused, rebuild, safetyOf } from "./integrity-harness";
import type { Rich } from "./integrity-harness";

/**
 * Restore integrity matrix (v0.3 fix), part 2: ownership rules, LT-5, soft
 * links that stay accepted, a full round trip of a rich device, and the older
 * formats. Generated test data only.
 */

const opts = { mode: "merge" as const, policy: "keepDevice" as const, fileName: "edited.json" };

/** Checks `text` against the device and plans both modes. */
async function plansFor(r: Rich, text: string) {
  const { db } = r.device;
  const envelope = await envelopeOf(text, db);
  const device = await readDeviceData(db);
  return {
    replace: planRestore(envelope, device, { ...opts, mode: "replace" }),
    merge: planRestore(envelope, device, opts),
  };
}

describe("ownership", () => {
  it("a batch whose version belongs to another formula (version on the device only)", async () => {
    const r = await buildRich();
    const env = await exportOf(r);
    const bad = { ...r.C, id: id(), formulaId: r.F2 };
    drop(env, "batches", r.C.id);
    drop(env, "formulaVersions", r.v2.id);
    env.data.batches.push(bad);
    const plans = await plansFor(r, await rebuild(env));
    expect(plans.replace.problems).toEqual([{ store: "batches", id: bad.id, reason: "version-missing", missingId: r.v2.id }]);
    expect(plans.merge.problems).toEqual([{ store: "batches", id: bad.id, reason: "version-of-other-formula", missingId: r.v2.id }]);
    await expectRefused(r.device.db, plans.merge);
  });

  it("a production entry whose formula differs from its version's formula", async () => {
    const r = await buildRich();
    const env = await exportOf(r);
    const bad = { ...r.E1, id: id(), formulaId: r.F2 };
    drop(env, "productionPlans", r.E1.id);
    drop(env, "formulaVersions", r.vG.id);
    env.data.productionPlans.push(bad);
    const plans = await plansFor(r, await rebuild(env));
    expect(plans.replace.problems).toEqual([{ store: "productionPlans", id: bad.id, reason: "version-missing", missingId: r.vG.id }]);
    expect(plans.merge.problems).toEqual([{ store: "productionPlans", id: bad.id, reason: "version-of-other-formula", missingId: r.vG.id }]);
    await expectRefused(r.device.db, plans.merge);
  });

  it("a production entry whose batch (on the device only) is of another version", async () => {
    const r = await buildRich();
    const env = await exportOf(r);
    const bad = { ...r.E2, id: id(), versionId: r.vB.id, formulaId: r.F2, batchId: r.B.id };
    drop(env, "productionPlans", r.E2.id);
    drop(env, "batches", r.B.id);
    env.data.productionPlans.push(bad);
    const plans = await plansFor(r, await rebuild(env));
    expect(plans.replace.problems).toEqual([{ store: "productionPlans", id: bad.id, reason: "batch-missing", missingId: r.B.id }]);
    expect(plans.merge.problems).toEqual([{ store: "productionPlans", id: bad.id, reason: "batch-of-other-version", missingId: r.B.id }]);
    await expectRefused(r.device.db, plans.merge);
  });

  it("a measurement whose formula differs from its version's formula", async () => {
    const r = await buildRich();
    const env = await exportOf(r);
    const bad = { ...r.mD, id: id(), formulaId: r.F2 };
    drop(env, "measurements", r.mD.id);
    drop(env, "formulaVersions", r.vD.id);
    env.data.measurements.push(bad);
    const plans = await plansFor(r, await rebuild(env));
    expect(plans.replace.problems).toEqual([{ store: "measurements", id: bad.id, reason: "version-missing", missingId: r.vD.id }]);
    expect(plans.merge.problems).toEqual([{ store: "measurements", id: bad.id, reason: "version-of-other-formula", missingId: r.vD.id }]);
    await expectRefused(r.device.db, plans.merge);
  });
});

describe("LT-5: batch lot links", () => {
  /** A copy of batch K under a new id (new to the device), edited by `edit`, added to a full export. */
  async function withEditedK(r: Rich, edit: (links: NonNullable<typeof r.K.lots>) => void) {
    const env = await exportOf(r);
    const copy = { ...r.K, id: id(), lots: structuredClone(r.K.lots!) };
    edit(copy.lots);
    env.data.batches.push(copy);
    return { text: await rebuild(env), copy };
  }

  it("a link to a lot of another material than the component is refused under Replace and Merge", async () => {
    const r = await buildRich();
    const { text, copy } = await withEditedK(r, (links) => (links[0]!.lotId = r.oilLot.id)); // the wax row now names an oil lot
    const plans = await plansFor(r, text);
    const expected: IntegrityProblem[] = [{ store: "batches", id: copy.id, reason: "lot-of-other-material", missingId: r.oilLot.id }];
    expect(plans.replace.problems).toEqual(expected);
    expect(plans.merge.problems).toEqual(expected);
    await expectRefused(r.device.db, plans.merge);
    await expectRefused(r.device.db, plans.replace, { safetyBackup: await safetyOf(r.device.db) });
  });

  it("a link naming a component the version lacks is refused under Replace and Merge", async () => {
    const r = await buildRich();
    const { text, copy } = await withEditedK(r, (links) => (links[0]!.componentId = "no-such-component"));
    const plans = await plansFor(r, text);
    const expected: IntegrityProblem[] = [{ store: "batches", id: copy.id, reason: "component-missing", missingId: "row:no-such-component" }];
    expect(plans.replace.problems).toEqual(expected);
    expect(plans.merge.problems).toEqual(expected);
    await expectRefused(r.device.db, plans.merge);
  });

  it("both are refused when restoring into a blank device too (Merge, batch new there)", async () => {
    const r = await buildRich();
    const { text, copy } = await withEditedK(r, (links) => (links[0]!.lotId = r.oilLot.id));
    const blank = blankDevice(r.device.lib);
    const plan = await planFor(blank.db, await envelopeOf(text, blank.db), "merge");
    expect(plan.problems).toEqual([{ store: "batches", id: copy.id, reason: "lot-of-other-material", missingId: r.oilLot.id }]);
    await expectRefused(blank.db, plan);
  });

  it("archived lots and an edited lot code or supplier snapshot (soft links) still restore", async () => {
    const r = await buildRich();
    const env = await exportOf(r);
    for (const lot of env.data.materialLots) lot.archivedAt = "2026-11-25T08:00:00.000Z";
    for (const batch of env.data.batches) {
      for (const link of batch.lots ?? []) {
        link.lotCode = "EDITED-CODE";
        if (link.supplierId) link.supplierName = "Renamed Supplier";
      }
    }
    const text = await rebuild(env);
    const plans = await plansFor(r, text);
    expect(plans.replace.problems).toEqual([]);
    expect(plans.merge.problems).toEqual([]);
    const { db, layer } = r.device;
    const result = await applyRestore(db, plans.replace, { safetyBackup: await safetyOf(db), now: () => NOW });
    expect(result.ok).toBe(true);
    expect((await layer.materialLots.get(r.waxLot.id))?.archivedAt).not.toBeNull();
    expect((await layer.batches.get(r.K.id))?.batch.lots?.[0]?.lotCode).toBe("EDITED-CODE");
  });
});

describe("soft links are still accepted", () => {
  type Edit = (env: BackupEnvelope, r: Rich) => void;
  const SOFT: [string, Edit][] = [
    ["a burn session whose milestone points nowhere", (env, r) => (env.data.burnSessions.find((s) => s.id === r.S2.id)!.milestoneId = id())],
    ["a version whose parent version is missing from the file", (env, r) => (env.data.formulaVersions.find((v) => v.id === r.v2.id)!.parentVersionId = id())],
    ["a version whose input material is missing from the file", (env, r) => drop(env, "materials", r.device.lib.vesselId)],
    ["a batch lot snapshot whose supplier no longer exists", (env, r) => (env.data.batches.find((b) => b.id === r.K.id)!.lots![0]!.supplierId = id())],
  ];

  it.each(SOFT)("%s: no problems, Replace applies, Merge into a blank device is clean", async (_name, edit) => {
    const r = await buildRich();
    const { db } = r.device;
    const env = await exportOf(r);
    edit(env, r);
    const text = await rebuild(env);
    const blank = blankDevice(r.device.lib);
    const merge = await planFor(blank.db, await envelopeOf(text, blank.db), "merge");
    expect(merge.problems).toEqual([]);

    const plans = await plansFor(r, text);
    expect(plans.replace.problems).toEqual([]);
    expect(plans.merge.problems).toEqual([]);
    const result = await applyRestore(db, plans.replace, { safetyBackup: await safetyOf(db), now: () => NOW });
    expect(result.ok).toBe(true);
  });
});

describe("success leaves every link readable (format 5, rich device)", () => {
  async function expectReadable(target: ReturnType<typeof setup>, r: Rich) {
    const { layer } = target;
    for (const batch of [r.K, r.C, r.D, r.H, r.J, r.B]) {
      expect((await layer.batches.get(batch.id))?.version.id).toBe(batch.versionId);
    }
    expect((await layer.batches.get(r.K.id))?.batch.lots).toHaveLength(2);
    for (const session of [r.S, r.S2]) expect((await layer.burnSessions.get(session.id))?.session.id).toBe(session.id);
    expect((await layer.burnPhotos.listBySession(r.S2.id)).map((p) => p.id)).toEqual([r.P.id]);
    for (const batch of [r.D, r.J]) expect((await layer.curePlans.get(batch.id))?.id).toBe(batch.id);
    for (const entry of [r.E1, r.E2]) expect((await layer.productionPlans.get(entry.id))?.plan.id).toBe(entry.id);
    expect((await layer.productionPlans.get(r.E2.id))?.batch?.id).toBe(r.B.id);
    for (const lot of [r.waxLot, r.oilLot, r.L3, r.L4]) expect((await layer.materialLots.get(lot.id))?.id).toBe(lot.id);
    for (const supplier of [r.s1, r.s2]) expect((await layer.suppliers.get(supplier.id))?.id).toBe(supplier.id);
    expect((await layer.measurements.getForVersion(r.vB.id))?.id).toBe(r.m2.id);
    expect(await layer.versions.get(r.v2.id)).toBeDefined();
  }

  it("Replace into the same device", async () => {
    const r = await buildRich();
    const { db } = r.device;
    const text = (await safetyOf(db)).json;
    const before = await readDeviceData(db);
    const plan = await planFor(db, await envelopeOf(text, db), "replace");
    expect(plan.problems).toEqual([]);
    const result = await applyRestore(db, plan, { safetyBackup: await safetyOf(db), now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await readDeviceData(db)).toEqual(before);
    await expectReadable(r.device, r);
  });

  it("Replace into a blank device", async () => {
    const r = await buildRich();
    const blank = blankDevice(r.device.lib);
    const text = (await safetyOf(r.device.db)).json;
    const plan = await planFor(blank.db, await envelopeOf(text, blank.db), "replace");
    expect(plan.problems).toEqual([]);
    const result = await applyRestore(blank.db, plan, { safetyBackup: await safetyOf(blank.db), now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await readDeviceData(blank.db)).toEqual(await readDeviceData(r.device.db));
    await expectReadable(blank, r);
  });

  it("Merge into a blank device", async () => {
    const r = await buildRich();
    const blank = blankDevice(r.device.lib);
    const text = (await safetyOf(r.device.db)).json;
    const plan = await planFor(blank.db, await envelopeOf(text, blank.db), "merge");
    expect(plan.problems).toEqual([]);
    const result = await applyRestore(blank.db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    expect(await readDeviceData(blank.db)).toEqual(await readDeviceData(r.device.db));
    await expectReadable(blank, r);
  });
});

describe("formats 1 to 6 still read and restore", () => {
  const FIXTURES = join(process.cwd(), "tests", "fixtures", "backups");

  /** The same data as a v0.2 BurnMatrix (format 4) file: no suppliers, lots or batch lot links. */
  function asFormat4(env: BackupEnvelope): BackupEnvelope {
    const copy = structuredClone(env);
    copy.formatVersion = 4;
    copy.schemaVersion = 4;
    copy.appVersion = "0.2.0";
    const loose = copy.data as unknown as Record<string, unknown>;
    delete loose.suppliers;
    delete loose.materialLots;
    delete loose.investigations;
    delete loose.investigationPhotos;
    delete loose.correctiveExperiments;
    copy.data.batches = env.data.batches.map((batch) => {
      const plain = { ...batch };
      delete plain.lots;
      return plain;
    });
    return copy;
  }

  /** The same data as a v0.3 lots (format 5) file: no investigations, investigation photos or corrective experiments. */
  function asFormat5(env: BackupEnvelope): BackupEnvelope {
    const copy = structuredClone(env);
    copy.formatVersion = 5;
    copy.schemaVersion = 5;
    const loose = copy.data as unknown as Record<string, unknown>;
    delete loose.investigations;
    delete loose.investigationPhotos;
    delete loose.correctiveExperiments;
    return copy;
  }

  async function restoresBoth(text: string, expectedFormat: number) {
    const replaceTarget = setup();
    const envelope = await envelopeOf(text, replaceTarget.db);
    expect(envelope.formatVersion).toBe(expectedFormat);
    const replace = await planFor(replaceTarget.db, envelope, "replace");
    expect(replace.problems).toEqual([]);
    const replaced = await applyRestore(replaceTarget.db, replace, { safetyBackup: await safetyOf(replaceTarget.db), now: () => NOW });
    expect(replaced.ok).toBe(true);

    const mergeTarget = setup();
    const merge = await planFor(mergeTarget.db, await envelopeOf(text, mergeTarget.db), "merge");
    expect(merge.problems).toEqual([]);
    const merged = await applyRestore(mergeTarget.db, merge, { now: () => NOW });
    expect(merged.ok).toBe(true);
    expect(await readDeviceData(mergeTarget.db)).toEqual(await readDeviceData(replaceTarget.db));
  }

  it.each([
    ["good.json", 1],
    ["good-v2.json", 2],
    ["good-v3.json", 3],
  ] as const)("%s (format %i) restores with Replace and with Merge", async (file, format) => {
    await restoresBoth(readFileSync(join(FIXTURES, file), "utf8"), format);
  });

  it("a format 4 file (a rich export without suppliers or lots) restores with Replace and with Merge", async () => {
    const r = await buildRich();
    await restoresBoth(await rebuild(asFormat4(await exportOf(r))), 4);
  });

  it("a format 5 export restores with Replace and with Merge", async () => {
    const r = await buildRich();
    await restoresBoth(await rebuild(asFormat5(await exportOf(r))), 5);
  });

  it("a format 6 export restores with Replace and with Merge", async () => {
    const r = await buildRich();
    await restoresBoth(await rebuild(await exportOf(r)), 6);
  });
});
