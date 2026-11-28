import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planRestore } from "@/lib/backup";
import type { ConflictPolicy, DeviceData, RestoreMode } from "@/lib/backup";
import { restoreSummary } from "@/lib/messages";
import type { BackupEnvelope, FormulaVersion } from "@/lib/types";

const GOOD = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "fixtures", "backups", "good.json"), "utf8"),
) as BackupEnvelope;

const clone = <T>(value: T): T => structuredClone(value);
// good.json is format 1; restore migrates it to the current shape first.
const envelope = (): BackupEnvelope => {
  const env = clone(GOOD);
  env.data = { ...env.data, batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [], investigations: [], investigationPhotos: [], correctiveExperiments: [] };
  env.counts = { ...env.counts, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 };
  return env;
};
const deviceFrom = (env: BackupEnvelope): DeviceData => clone(env.data);
const emptyDevice = (): DeviceData => ({
  materials: [],
  formulas: [],
  formulaVersions: [],
  measurements: [],
  batches: [],
  curePlans: [],
  productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [],
  investigations: [], investigationPhotos: [], correctiveExperiments: [],
});

function plan(
  env: BackupEnvelope,
  device: DeviceData,
  mode: RestoreMode = "merge",
  policy: ConflictPolicy = "keepDevice",
) {
  return planRestore(env, device, { mode, policy, fileName: "backup.json" });
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const ZERO = { materials: 0, formulas: 0, formulaVersions: 0, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 };
const FILE_COUNTS = { materials: 7, formulas: 2, formulaVersions: 3, measurements: 1, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 };

describe("merge: new and identical", () => {
  it("adds everything to an empty device", () => {
    const env = envelope();
    const p = plan(env, emptyDevice());
    expect(p.mode).toBe("merge");
    expect(p.clear).toBe(false);
    expect(p.puts).toEqual(env.data);
    expect(p.added).toEqual(FILE_COUNTS);
    expect(p.expectedCounts).toEqual(FILE_COUNTS);
    expect(p.fileCounts).toEqual(env.counts);
    expect(p.exportedAt).toBe(env.exportedAt);
    expect(p.fileName).toBe("backup.json");
    expect(p.replaced).toEqual(ZERO);
    expect(p.kept).toEqual(ZERO);
    expect(p.skippedIdentical).toBe(0);
    expect(p.versionConflictsKept).toBe(0);
    expect(p.renumbered).toEqual([]);
    expect(p.tally.materials).toEqual({ new: 7, identical: 0, conflict: 0 });
  });

  it("skips everything the device already holds", () => {
    const env = envelope();
    const device = deviceFrom(env);
    const p = plan(env, device);
    expect(p.puts).toEqual(ZERO_PUTS());
    expect(p.added).toEqual(ZERO);
    expect(p.skippedIdentical).toBe(13);
    expect(p.expectedCounts).toEqual(FILE_COUNTS);
    expect(p.tally.formulaVersions).toEqual({ new: 0, identical: 3, conflict: 0 });
  });

  it("gives the same answer under both policies when nothing conflicts", () => {
    const env = envelope();
    const device = deviceFrom(env);
    expect(plan(env, device, "merge", "useBackup")).toEqual({
      ...plan(env, device, "merge", "keepDevice"),
      policy: "useBackup",
    });
  });
});

function ZERO_PUTS() {
  return { materials: [], formulas: [], formulaVersions: [], measurements: [], batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [], investigations: [], investigationPhotos: [], correctiveExperiments: [] };
}

describe("merge: conflicts", () => {
  it("material: keep or replace", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.materials[0]!.name = "Renamed on device";
    const keep = plan(env, device, "merge", "keepDevice");
    expect(keep.puts.materials).toEqual([]);
    expect(keep.kept.materials).toBe(1);
    expect(keep.replaced.materials).toBe(0);
    expect(keep.tally.materials).toEqual({ new: 0, identical: 6, conflict: 1 });
    expect(keep.skippedIdentical).toBe(12);

    const use = plan(env, device, "merge", "useBackup");
    expect(use.puts.materials).toEqual([env.data.materials[0]]);
    expect(use.replaced.materials).toBe(1);
    expect(use.kept.materials).toBe(0);
    expect(use.added.materials).toBe(0);
    expect(use.expectedCounts).toEqual(FILE_COUNTS);
  });

  it("measurement: keep or replace", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.measurements[0]!.notes = "device note";
    expect(plan(env, device).kept.measurements).toBe(1);
    expect(plan(env, device).puts.measurements).toEqual([]);
    const use = plan(env, device, "merge", "useBackup");
    expect(use.puts.measurements).toEqual(env.data.measurements);
    expect(use.replaced.measurements).toBe(1);
  });

  it("formula: a changed name conflicts; the put is the device record with the backup's fields", () => {
    const env = envelope();
    const device = deviceFrom(env);
    const original = clone(device.formulas[0]!);
    device.formulas[0] = {
      ...original,
      name: "Device name",
      notes: "device notes",
      latestVersionNumber: 2,
      updatedAt: "2026-11-15T00:00:00.000Z",
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    const keep = plan(env, device, "merge", "keepDevice");
    expect(keep.puts.formulas).toEqual([]);
    expect(keep.kept.formulas).toBe(1);
    expect(keep.tally.formulas).toEqual({ new: 0, identical: 1, conflict: 1 });

    const use = plan(env, device, "merge", "useBackup");
    expect(use.replaced.formulas).toBe(1);
    const put = use.puts.formulas[0]!;
    expect(put.id).toBe(original.id);
    expect(put.name).toBe(env.data.formulas[0]!.name);
    expect("notes" in put).toBe(env.data.formulas[0]!.notes !== undefined);
    expect(put.updatedAt).toBe(env.data.formulas[0]!.updatedAt);
    expect(put.archivedAt).toBe(env.data.formulas[0]!.archivedAt);
    expect(put.createdAt).toBe("2026-11-01T00:00:00.000Z");
    expect(put.latestVersionNumber).toBe(2);
  });

  it("formula: notes added or an archive change also conflict", () => {
    const env = envelope();
    const a = deviceFrom(env);
    a.formulas[1]!.notes = "only on device";
    expect(plan(env, a).tally.formulas.conflict).toBe(1);
    const b = deviceFrom(env);
    b.formulas[1]!.archivedAt = "2026-11-15T00:00:00.000Z";
    expect(plan(env, b).tally.formulas.conflict).toBe(1);
  });

  it("formula: updatedAt or latestVersionNumber alone are identical", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.formulas[0]!.updatedAt = "2026-12-01T00:00:00.000Z";
    device.formulas[0]!.latestVersionNumber = 9;
    for (const policy of ["keepDevice", "useBackup"] as const) {
      const p = plan(env, device, "merge", policy);
      expect(p.tally.formulas).toEqual({ new: 0, identical: 2, conflict: 0 });
      expect(p.puts.formulas).toEqual([]);
      expect(p.replaced.formulas).toBe(0);
      expect(p.kept.formulas).toBe(0);
    }
  });

  it("version conflict: never written, counted, under both policies", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.formulaVersions[1]!.changeNote = "different on device";
    for (const policy of ["keepDevice", "useBackup"] as const) {
      const p = plan(env, device, "merge", policy);
      expect(p.puts.formulaVersions).toEqual([]);
      expect(p.kept.formulaVersions).toBe(1);
      expect(p.replaced.formulaVersions).toBe(0);
      expect(p.versionConflictsKept).toBe(1);
      expect(p.tally.formulaVersions).toEqual({ new: 0, identical: 2, conflict: 1 });
      expect(p.expectedCounts).toEqual(FILE_COUNTS);
    }
  });
});

const T = (n: number) => `2026-11-15T10:00:0${n}.000Z`;

function versionLike(base: FormulaVersion, id: string, number: number, createdAt: string, parent: string | null) {
  const v = clone(base);
  v.id = id;
  v.number = number;
  v.createdAt = createdAt;
  v.parentVersionId = parent;
  v.origin = parent ? "revision" : "initial";
  v.scale = null;
  return v;
}

const V3 = "aaaaaaaa-0000-4000-8000-000000000003";
const V4 = "aaaaaaaa-0000-4000-8000-000000000004";
const D3 = "dddddddd-0000-4000-8000-000000000003";

describe("merge: renumbering (DATA-22)", () => {
  /** Device has 1, 2, 3 of formula A; the file has the same 1 and 2 plus its own 3 and 4. */
  function scenario() {
    const env = envelope();
    const [v1, v2] = env.data.formulaVersions as [FormulaVersion, FormulaVersion];
    const formulaId = v1.formulaId;
    const device = deviceFrom(env);
    device.formulaVersions.push(versionLike(v2, D3, 3, T(1), v2.id));
    device.formulas[0]!.latestVersionNumber = 3;
    const inc3 = versionLike(v2, V3, 3, T(2), v2.id);
    const inc4 = versionLike(v2, V4, 4, T(3), V3);
    env.data.formulaVersions.push(inc3, inc4);
    env.data.formulas[0]!.latestVersionNumber = 4;
    env.counts.formulaVersions = 5;
    return { env, device, formulaId, v1, v2, inc3, inc4 };
  }

  it("moves a clashing version up, in createdAt order, above everything in use", () => {
    const { env, device, formulaId, inc3, inc4 } = scenario();
    const p = plan(env, device);
    expect(p.added.formulaVersions).toBe(2);
    expect(p.skippedIdentical).toBe(7 + 2 + 3 + 1);
    expect(p.expectedCounts.formulaVersions).toBe(device.formulaVersions.length + 2);
    // 3 clashes with the device and becomes 4; 4 then clashes with that and becomes 5.
    const put3 = p.puts.formulaVersions.find((v) => v.id === V3)!;
    const put4 = p.puts.formulaVersions.find((v) => v.id === V4)!;
    expect(put3).toEqual({ ...inc3, number: 4, originalNumber: 3 });
    expect(put4).toEqual({ ...inc4, number: 5, originalNumber: 4 });
    expect(put4.parentVersionId).toBe(V3);
    expect(put3.parentVersionId).toBe(inc3.parentVersionId);
    expect(p.renumbered).toEqual([
      { versionId: V3, formulaId, formulaName: env.data.formulas[0]!.name, from: 3, to: 4 },
      { versionId: V4, formulaId, formulaName: env.data.formulas[0]!.name, from: 4, to: 5 },
    ]);
  });

  it("restoring the same file again after a renumbering changes nothing (DATA-19)", () => {
    const { env, device } = scenario();
    const first = plan(env, device);
    // Apply the plan by hand: what the device holds after the first restore.
    const after = clone(device);
    after.formulaVersions.push(...clone(first.puts.formulaVersions));
    for (const put of first.puts.formulas) {
      const i = after.formulas.findIndex((f) => f.id === put.id);
      if (i >= 0) after.formulas[i] = clone(put);
      else after.formulas.push(clone(put));
    }
    const second = plan(env, after);
    expect(second.tally.formulaVersions).toEqual({ new: 0, identical: 5, conflict: 0 });
    expect(second.versionConflictsKept).toBe(0);
    expect(second.kept).toEqual(ZERO);
    expect(second.added).toEqual(ZERO);
    expect(second.renumbered).toEqual([]);
    expect(second.puts).toEqual({ materials: [], formulas: [], formulaVersions: [], measurements: [], batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [], investigations: [], investigationPhotos: [], correctiveExperiments: [] });
  });

  it("a version that differs only in its number is identical, not a conflict", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.formulaVersions[1]!.number = 9;
    device.formulaVersions[1]!.originalNumber = 2;
    const p = plan(env, device);
    expect(p.tally.formulaVersions).toEqual({ new: 0, identical: 3, conflict: 0 });
    expect(p.puts.formulaVersions).toEqual([]);
  });

  it("raises latestVersionNumber on an otherwise identical formula, uncounted", () => {
    const { env, device } = scenario();
    const p = plan(env, device);
    expect(p.puts.formulas).toEqual([{ ...device.formulas[0]!, latestVersionNumber: 5 }]);
    expect(p.added.formulas).toBe(0);
    expect(p.replaced.formulas).toBe(0);
    expect(p.kept.formulas).toBe(0);
    expect(p.expectedCounts.formulas).toBe(2);
  });

  it("raises latestVersionNumber on a kept formula too, and names the formula as it will be", () => {
    const { env, device } = scenario();
    device.formulas[0]!.name = "Device name";
    const keep = plan(env, device, "merge", "keepDevice");
    expect(keep.kept.formulas).toBe(1);
    expect(keep.puts.formulas).toEqual([{ ...device.formulas[0]!, latestVersionNumber: 5 }]);
    expect(keep.renumbered.every((r) => r.formulaName === "Device name")).toBe(true);
    const use = plan(env, device, "merge", "useBackup");
    expect(use.replaced.formulas).toBe(1);
    expect(use.puts.formulas[0]!.name).toBe(env.data.formulas[0]!.name);
    expect(use.puts.formulas[0]!.latestVersionNumber).toBe(5);
    expect(use.renumbered.every((r) => r.formulaName === env.data.formulas[0]!.name)).toBe(true);
  });

  it("lets createdAt decide between two clashing versions, not file order", () => {
    const { env, device, v2 } = scenario();
    const x = versionLike(v2, "bbbbbbbb-0000-4000-8000-000000000001", 3, T(5), null);
    const y = versionLike(v2, "bbbbbbbb-0000-4000-8000-000000000002", 3, T(4), null);
    env.data.formulaVersions = [env.data.formulaVersions[0]!, v2, x, y];
    const p = plan(env, device);
    const byId = (id: string) => p.puts.formulaVersions.find((v) => v.id === id)!;
    expect(byId(y.id).number).toBe(4);
    expect(byId(x.id).number).toBe(5);
    // Puts and the renumbering list keep the file's order.
    expect(p.puts.formulaVersions.map((v) => v.id)).toEqual([x.id, y.id]);
    expect(p.renumbered.map((r) => r.versionId)).toEqual([x.id, y.id]);
  });

  it("breaks createdAt ties by id", () => {
    const { env, device, v2 } = scenario();
    const hi = versionLike(v2, "cccccccc-0000-4000-8000-000000000002", 3, T(4), null);
    const lo = versionLike(v2, "cccccccc-0000-4000-8000-000000000001", 3, T(4), null);
    env.data.formulaVersions = [hi, lo];
    const p = plan(env, device);
    expect(p.puts.formulaVersions.find((v) => v.id === lo.id)!.number).toBe(4);
    expect(p.puts.formulaVersions.find((v) => v.id === hi.id)!.number).toBe(5);
  });

  it("keeps a free number and leaves originalNumber off", () => {
    const { env, device, v2 } = scenario();
    const free = versionLike(v2, "eeeeeeee-0000-4000-8000-000000000001", 7, T(4), null);
    env.data.formulaVersions = [free];
    const p = plan(env, device);
    expect(p.puts.formulaVersions).toEqual([free]);
    expect("originalNumber" in p.puts.formulaVersions[0]!).toBe(false);
    expect(p.renumbered).toEqual([]);
    expect(p.puts.formulas).toEqual([{ ...device.formulas[0]!, latestVersionNumber: 7 }]);
  });

  it("a kept number above the rest pushes later clashes above it", () => {
    const { env, device, v2 } = scenario();
    const a = versionLike(v2, "eeeeeeee-0000-4000-8000-000000000001", 9, T(1), null);
    const b = versionLike(v2, "eeeeeeee-0000-4000-8000-000000000002", 3, T(2), null);
    env.data.formulaVersions = [a, b];
    const p = plan(env, device);
    expect(p.puts.formulaVersions.map((v) => v.number)).toEqual([9, 10]);
  });

  it("renumbers within a formula only", () => {
    const { env, device, v2 } = scenario();
    const other = env.data.formulaVersions.find((v) => v.formulaId !== v2.formulaId)!;
    const clash = versionLike(other, "ffffffff-0000-4000-8000-000000000001", 1, T(4), null);
    env.data.formulaVersions = [clash];
    const p = plan(env, device);
    expect(p.puts.formulaVersions[0]!.number).toBe(2);
    expect(p.puts.formulaVersions[0]!.originalNumber).toBe(1);
    expect(p.renumbered[0]!.formulaId).toBe(other.formulaId);
  });

  it("recomputes latestVersionNumber for a formula arriving in the file", () => {
    const env = envelope();
    const device = emptyDevice();
    const [v1, v2] = env.data.formulaVersions as [FormulaVersion, FormulaVersion];
    // The file is internally inconsistent about the latest number; the plan uses the real highest.
    env.data.formulas[0]!.latestVersionNumber = 1;
    expect(v1.number).toBe(1);
    expect(v2.number).toBe(2);
    const p = plan(env, device);
    expect(p.puts.formulas[0]!.latestVersionNumber).toBe(2);
    expect(p.puts.formulas[1]!.latestVersionNumber).toBe(1);
    expect(p.added.formulas).toBe(2);
  });

  it("adds a version for a formula that is only on the device", () => {
    const env = envelope();
    const [v1] = env.data.formulaVersions as [FormulaVersion];
    const deviceOnly = { ...clone(env.data.formulas[0]!), id: "99999999-0000-4000-8000-000000000001", name: "Device only", latestVersionNumber: 1 };
    const deviceOnlyV1 = { ...versionLike(v1, "99999999-0000-4000-8000-0000000000a1", 1, T(0), null), formulaId: deviceOnly.id };
    const device: DeviceData = { ...emptyDevice(), formulas: [deviceOnly], formulaVersions: [deviceOnlyV1] };
    const incoming = { ...versionLike(v1, "99999999-0000-4000-8000-0000000000a2", 2, T(1), deviceOnlyV1.id), formulaId: deviceOnly.id };
    env.data = { materials: [], formulas: [], formulaVersions: [incoming], measurements: [], batches: [], curePlans: [], productionPlans: [], burnSessions: [], burnPhotos: [], suppliers: [], materialLots: [], investigations: [], investigationPhotos: [], correctiveExperiments: [] };
    env.counts = { materials: 0, formulas: 0, formulaVersions: 1, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 };
    const p = plan(env, device);
    expect(p.puts.formulaVersions).toEqual([incoming]);
    expect(p.added.formulaVersions).toBe(1);
    expect(p.puts.formulas).toEqual([{ ...deviceOnly, latestVersionNumber: 2 }]);
    expect(p.added.formulas).toBe(0);
    expect(p.expectedCounts).toEqual({ materials: 0, formulas: 1, formulaVersions: 2, measurements: 0, batches: 0, curePlans: 0, productionPlans: 0, burnSessions: 0, burnPhotos: 0, suppliers: 0, materialLots: 0, investigations: 0, investigationPhotos: 0, correctiveExperiments: 0 });
  });
});

describe("merge: missing library materials", () => {
  it("lists material ids that versions use and nobody holds", () => {
    const env = envelope();
    const used = new Set<string>();
    for (const v of env.data.formulaVersions) {
      for (const row of [...v.inputs.waxes, ...v.inputs.oils]) used.add(row.materialId);
      if (v.inputs.wick) used.add(v.inputs.wick.materialId);
      if (v.inputs.vessel) used.add(v.inputs.vessel.materialId);
    }
    expect(used.size).toBeGreaterThan(2);
    const sorted = [...used].sort();
    const dropped = sorted.slice(0, 2);
    env.data.materials = env.data.materials.filter((m) => !dropped.includes(m.id));
    expect(plan(env, emptyDevice()).missingMaterialIds).toEqual(dropped);
    // A material on the device is not missing.
    const device = emptyDevice();
    device.materials = [{ ...clone(GOOD.data.materials[0]!), id: dropped[0]! }];
    expect(plan(env, device).missingMaterialIds).toEqual([dropped[1]]);
    // Nothing missing when the file holds the library.
    expect(plan(envelope(), emptyDevice()).missingMaterialIds).toEqual([]);
  });
});

describe("replace mode", () => {
  it("clears and writes the file exactly, but still classifies against the device", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.materials[0]!.name = "Changed";
    device.materials.push({ ...clone(device.materials[1]!), id: "12121212-0000-4000-8000-000000000001" });
    device.formulaVersions = device.formulaVersions.slice(0, 1);
    const p = plan(env, device, "replace", "useBackup");
    expect(p.mode).toBe("replace");
    expect(p.policy).toBe("useBackup");
    expect(p.clear).toBe(true);
    expect(p.puts).toEqual(env.data);
    expect(p.added).toEqual(FILE_COUNTS);
    expect(p.expectedCounts).toEqual(FILE_COUNTS);
    expect(p.fileCounts).toEqual(FILE_COUNTS);
    expect(p.replaced).toEqual(ZERO);
    expect(p.kept).toEqual(ZERO);
    expect(p.skippedIdentical).toBe(0);
    expect(p.versionConflictsKept).toBe(0);
    expect(p.renumbered).toEqual([]);
    expect(p.tally.materials).toEqual({ new: 0, identical: 6, conflict: 1 });
    expect(p.tally.formulaVersions).toEqual({ new: 2, identical: 1, conflict: 0 });
  });

  it("computes missing materials against the file only", () => {
    const env = envelope();
    const device = deviceFrom(env);
    env.data.materials = [];
    const p = plan(env, device, "replace", "keepDevice");
    expect(p.missingMaterialIds.length).toBeGreaterThan(0);
    expect(p.policy).toBe("keepDevice");
  });
});

describe("purity", () => {
  it("does not mutate frozen inputs and is deterministic", () => {
    const { env, device } = (() => {
      const e = envelope();
      const d = deviceFrom(e);
      d.materials[0]!.name = "Changed";
      d.formulas[0]!.name = "Changed";
      d.formulaVersions[1]!.changeNote = "x";
      d.formulaVersions.push(versionLike(e.data.formulaVersions[1]!, D3, 3, T(1), null));
      e.data.formulaVersions.push(versionLike(e.data.formulaVersions[1]!, V3, 3, T(2), null));
      return { env: deepFreeze(e), device: deepFreeze(d) };
    })();
    for (const mode of ["merge", "replace"] as const) {
      for (const policy of ["keepDevice", "useBackup"] as const) {
        const first = plan(env, device, mode, policy);
        const second = plan(env, device, mode, policy);
        expect(second).toEqual(first);
      }
    }
  });

  it("fits RestoreSummaryInput directly", () => {
    const env = envelope();
    const device = deviceFrom(env);
    device.materials[0]!.name = "Changed";
    device.materials.pop();
    const p = plan(env, device);
    expect(restoreSummary(p)).toBe(
      "Restored from backup.json: added 1 material. Skipped 11 identical items. Kept this device's copy of 1 material.",
    );
  });
});
