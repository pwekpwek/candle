import { DATA_STORES } from "@/lib/types";
import type {
  BackupCounts,
  BackupData,
  Batch,
  BurnPhotoBackup,
  BurnSession,
  DataStoreName,
  Formula,
  FormulaVersion,
  InvestigationPhotoBackup,
} from "@/lib/types";
import { canonicalJson } from "./canonical";
import { restoreProblems } from "./integrity";
import { photoIdentity } from "./photos";
import type { DeviceData, PlanRestore, Renumbering, RestorePlan, StoreTally } from "./contract";

type Class = "new" | "identical" | "conflict";

function zeroCounts(): BackupCounts {
  return {
    materials: 0,
    formulas: 0,
    formulaVersions: 0,
    measurements: 0,
    batches: 0,
    curePlans: 0,
    productionPlans: 0,
    burnSessions: 0,
    burnPhotos: 0,
    suppliers: 0,
    materialLots: 0,
    investigations: 0,
    investigationPhotos: 0,
    correctiveExperiments: 0,
  };
}

function emptyTally(): Record<DataStoreName, StoreTally> {
  return {
    materials: { new: 0, identical: 0, conflict: 0 },
    formulas: { new: 0, identical: 0, conflict: 0 },
    formulaVersions: { new: 0, identical: 0, conflict: 0 },
    measurements: { new: 0, identical: 0, conflict: 0 },
    batches: { new: 0, identical: 0, conflict: 0 },
    curePlans: { new: 0, identical: 0, conflict: 0 },
    productionPlans: { new: 0, identical: 0, conflict: 0 },
    burnSessions: { new: 0, identical: 0, conflict: 0 },
    burnPhotos: { new: 0, identical: 0, conflict: 0 },
    suppliers: { new: 0, identical: 0, conflict: 0 },
    materialLots: { new: 0, identical: 0, conflict: 0 },
    investigations: { new: 0, identical: 0, conflict: 0 },
    investigationPhotos: { new: 0, identical: 0, conflict: 0 },
    correctiveExperiments: { new: 0, identical: 0, conflict: 0 },
  };
}

function byId<T extends { id: string }>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.id, record]));
}

function sameFormula(a: Formula, b: Formula): boolean {
  return a.name === b.name && a.notes === b.notes && a.archivedAt === b.archivedAt;
}

function classify<T extends { id: string }>(
  incoming: T,
  device: Map<string, T>,
  same: (a: T, b: T) => boolean,
): { cls: Class; existing: T | undefined } {
  const existing = device.get(incoming.id);
  if (!existing) return { cls: "new", existing };
  return { cls: same(incoming, existing) ? "identical" : "conflict", existing };
}

function sameByCanonical<T>(a: T, b: T): boolean {
  return canonicalJson(a) === canonicalJson(b);
}

/** BurnMatrix (and CandleFix): photos compare without their bytes; `sha256` stands for them (verified on check). */
function samePhoto(a: BurnPhotoBackup | InvestigationPhotoBackup, b: BurnPhotoBackup | InvestigationPhotoBackup): boolean {
  return canonicalJson(photoIdentity(a)) === canonicalJson(photoIdentity(b));
}

/**
 * Versions compare without `number` and `originalNumber`. Both are display
 * labels (DATA-01) that a restore may change (DATA-22), so a version this
 * device renumbered is still the same version when its file is restored again.
 */
function sameVersion(a: FormulaVersion, b: FormulaVersion): boolean {
  const content = (version: FormulaVersion) => {
    const copy: Partial<FormulaVersion> = { ...version };
    delete copy.number;
    delete copy.originalNumber;
    return canonicalJson(copy);
  };
  return content(a) === content(b);
}

function countsOf(data: BackupData): BackupCounts {
  return {
    materials: data.materials.length,
    formulas: data.formulas.length,
    formulaVersions: data.formulaVersions.length,
    measurements: data.measurements.length,
    batches: data.batches.length,
    curePlans: data.curePlans.length,
    productionPlans: data.productionPlans.length,
    burnSessions: data.burnSessions.length,
    burnPhotos: data.burnPhotos.length,
    suppliers: data.suppliers.length,
    materialLots: data.materialLots.length,
    investigations: data.investigations.length,
    investigationPhotos: data.investigationPhotos.length,
    correctiveExperiments: data.correctiveExperiments.length,
  };
}

function materialIdsOf(version: FormulaVersion): string[] {
  const ids = [...version.inputs.waxes, ...version.inputs.oils].map((row) => row.materialId);
  if (version.inputs.wick) ids.push(version.inputs.wick.materialId);
  if (version.inputs.vessel) ids.push(version.inputs.vessel.materialId);
  return ids;
}

function missingMaterials(versions: readonly FormulaVersion[], present: Set<string>): string[] {
  const missing = new Set<string>();
  for (const version of versions) {
    for (const id of materialIdsOf(version)) if (!present.has(id)) missing.add(id);
  }
  return [...missing].sort();
}

/** Classify the whole file against the device, for the preview. */
function tallyAgainst(envelopeData: BackupData, device: DeviceData): Record<DataStoreName, StoreTally> {
  const tally = emptyTally();
  const sets: { [K in DataStoreName]: (a: never, b: never) => boolean } = {
    materials: sameByCanonical,
    formulas: sameFormula as (a: never, b: never) => boolean,
    formulaVersions: sameVersion as (a: never, b: never) => boolean,
    measurements: sameByCanonical,
    batches: sameByCanonical,
    curePlans: sameByCanonical,
    productionPlans: sameByCanonical,
    burnSessions: sameByCanonical,
    burnPhotos: samePhoto as (a: never, b: never) => boolean,
    suppliers: sameByCanonical,
    materialLots: sameByCanonical,
    investigations: sameByCanonical,
    investigationPhotos: samePhoto as (a: never, b: never) => boolean,
    correctiveExperiments: sameByCanonical,
  };
  for (const store of DATA_STORES) {
    const deviceMap = byId(device[store] as { id: string }[]);
    for (const record of envelopeData[store] as { id: string }[]) {
      const { cls } = classify(record, deviceMap, sets[store] as (a: { id: string }, b: { id: string }) => boolean);
      tally[store][cls] += 1;
    }
  }
  return tally;
}

function planReplace(
  envelope: Parameters<PlanRestore>[0],
  device: DeviceData,
  options: Parameters<PlanRestore>[2],
): RestorePlan {
  const data = envelope.data;
  const fileCounts = countsOf(data);
  return {
    mode: "replace",
    policy: options.policy,
    fileName: options.fileName,
    exportedAt: envelope.exportedAt,
    fileCounts: { ...envelope.counts },
    tally: tallyAgainst(data, device),
    puts: {
      materials: [...data.materials],
      formulas: [...data.formulas],
      formulaVersions: [...data.formulaVersions],
      measurements: [...data.measurements],
      batches: [...data.batches],
      curePlans: [...data.curePlans],
      productionPlans: [...data.productionPlans],
      burnSessions: [...data.burnSessions],
      burnPhotos: [...data.burnPhotos],
      suppliers: [...data.suppliers],
      materialLots: [...data.materialLots],
      investigations: [...data.investigations],
      investigationPhotos: [...data.investigationPhotos],
      correctiveExperiments: [...data.correctiveExperiments],
    },
    clear: true,
    added: { ...fileCounts },
    replaced: zeroCounts(),
    kept: zeroCounts(),
    skippedIdentical: 0,
    versionConflictsKept: 0,
    renumbered: [],
    missingMaterialIds: missingMaterials(
      data.formulaVersions,
      new Set(data.materials.map((material) => material.id)),
    ),
    expectedCounts: { ...fileCounts },
    burnChecks: burnChecksAfter(data.batches, data.burnSessions),
    basis: { envelope, device: structuredClone(device) },
    // Restore integrity: nothing on the device stays, so every parent must be in the file.
    problems: restoreProblems(device, data, true),
  };
}


/**
 * Integration QA (M-1, M-2): what the burn tests will look like once the plan
 * is applied, for two informational preview lines. A restore never refuses a
 * file over these (the milestone link is a soft link, and older app versions
 * could write a burn test dated before its batch); the maker is told instead.
 */
export function burnChecksAfter(
  batches: readonly Batch[],
  sessions: readonly BurnSession[],
): RestorePlan["burnChecks"] {
  const producedOn = new Map(batches.map((batch) => [batch.id, batch.producedOn]));
  let datesBeforeBatch = 0;
  const linkCount = new Map<string, number>();
  for (const session of sessions) {
    const made = producedOn.get(session.batchId);
    if (made !== undefined && session.testedOn < made) datesBeforeBatch += 1;
    if (session.milestoneId !== null) {
      linkCount.set(session.milestoneId, (linkCount.get(session.milestoneId) ?? 0) + 1);
    }
  }
  const sharedPlannedTests = [...linkCount.values()].filter((n) => n > 1).length;
  return { datesBeforeBatch, sharedPlannedTests };
}

/** Device records with the plan's puts laid over them, by id. */
function after<T extends { id: string }>(device: readonly T[], puts: readonly T[]): T[] {
  const byIdMap = new Map(device.map((row) => [row.id, row]));
  for (const row of puts) byIdMap.set(row.id, row);
  return [...byIdMap.values()];
}

/** DATA-19 to DATA-23. Pure; never touches the database and never mutates its inputs. */
export const planRestore: PlanRestore = (envelope, device, options) => {
  if (options.mode === "replace") return planReplace(envelope, device, options);

  const { policy } = options;
  const data = envelope.data;
  const tally = emptyTally();
  const added = zeroCounts();
  const replaced = zeroCounts();
  const kept = zeroCounts();
  const puts: BackupData = {
    materials: [],
    formulas: [],
    formulaVersions: [],
    measurements: [],
    batches: [],
    curePlans: [],
    productionPlans: [],
    burnSessions: [],
    burnPhotos: [],
    suppliers: [],
    materialLots: [],
    investigations: [],
    investigationPhotos: [],
    correctiveExperiments: [],
  };

  // Materials, measurements and batches: new, identical or conflict.
  const deviceMaterials = byId(device.materials);
  for (const record of data.materials) {
    const { cls } = classify(record, deviceMaterials, sameByCanonical);
    tally.materials[cls] += 1;
    if (cls === "new") {
      puts.materials.push(record);
      added.materials += 1;
    } else if (cls === "conflict") {
      if (policy === "useBackup") {
        puts.materials.push(record);
        replaced.materials += 1;
      } else kept.materials += 1;
    }
  }
  const deviceMeasurements = byId(device.measurements);
  for (const record of data.measurements) {
    const { cls } = classify(record, deviceMeasurements, sameByCanonical);
    tally.measurements[cls] += 1;
    if (cls === "new") {
      puts.measurements.push(record);
      added.measurements += 1;
    } else if (cls === "conflict") {
      if (policy === "useBackup") {
        puts.measurements.push(record);
        replaced.measurements += 1;
      } else kept.measurements += 1;
    }
  }

  // Batches are editable records like measurements (v0.2). Their source link
  // never differs between two copies made by the app, so a conflict is about
  // the date, label, notes or measured weights.
  //
  // CurePilot: cure plans and production entries are editable records too and
  // are classified the same way, whole (docs/v0.2-curepilot.md). A cure plan's
  // id is its batch's id, so two devices that planned the same batch meet here
  // as an ordinary conflict.
  //
  // BurnMatrix: burn sessions too (whole), and photos without their bytes.
  //
  // v0.3: suppliers and lots are editable records, compared whole. A batch's
  // lot links are part of the batch, so they take part in its comparison.
  //
  // v0.3 CandleFix: investigations (with their checks and hypotheses) and
  // corrective experiments are compared whole; their photos without bytes.
  const editableStores = [
    "batches",
    "curePlans",
    "productionPlans",
    "burnSessions",
    "burnPhotos",
    "suppliers",
    "materialLots",
    "investigations",
    "investigationPhotos",
    "correctiveExperiments",
  ] as const;
  for (const store of editableStores) {
    const deviceMap = byId<{ id: string }>(device[store]);
    const incoming: { id: string }[] = data[store];
    const out: { id: string }[] = puts[store];
    const same = (store === "burnPhotos" || store === "investigationPhotos" ? samePhoto : sameByCanonical) as (
      a: { id: string },
      b: { id: string },
    ) => boolean;
    for (const record of incoming) {
      const { cls } = classify(record, deviceMap, same);
      tally[store][cls] += 1;
      if (cls === "new") {
        out.push(record);
        added[store] += 1;
      } else if (cls === "conflict") {
        if (policy === "useBackup") {
          out.push(record);
          replaced[store] += 1;
        } else kept[store] += 1;
      }
    }
  }

  // Versions: classify, then renumber the new ones per formula.
  const deviceVersions = byId(device.formulaVersions);
  const newVersions: FormulaVersion[] = [];
  for (const record of data.formulaVersions) {
    const { cls } = classify(record, deviceVersions, sameVersion);
    tally.formulaVersions[cls] += 1;
    if (cls === "new") newVersions.push(record);
    else if (cls === "conflict") kept.formulaVersions += 1;
  }
  added.formulaVersions = newVersions.length;
  const versionConflictsKept = kept.formulaVersions;

  // What each formula will be called after the restore (for the renumbering list).
  const deviceFormulas = byId(device.formulas);
  const finalName = new Map<string, string>();
  for (const formula of device.formulas) finalName.set(formula.id, formula.name);
  for (const formula of data.formulas) {
    const existing = deviceFormulas.get(formula.id);
    if (!existing || (!sameFormula(formula, existing) && policy === "useBackup")) {
      finalName.set(formula.id, formula.name);
    }
  }

  const numbersInUse = new Map<string, Set<number>>();
  for (const version of device.formulaVersions) {
    const set = numbersInUse.get(version.formulaId) ?? new Set<number>();
    set.add(version.number);
    numbersInUse.set(version.formulaId, set);
  }
  const maxNumber = new Map<string, number>();
  for (const [formulaId, set] of numbersInUse) maxNumber.set(formulaId, Math.max(...set));

  const placed = new Map<string, FormulaVersion>();
  const renumberings = new Map<string, Renumbering>();
  const grouped = new Map<string, FormulaVersion[]>();
  for (const version of newVersions) {
    const list = grouped.get(version.formulaId) ?? [];
    list.push(version);
    grouped.set(version.formulaId, list);
  }
  for (const [formulaId, list] of grouped) {
    const inUse = numbersInUse.get(formulaId) ?? new Set<number>();
    let max = maxNumber.get(formulaId) ?? 0;
    const ordered = [...list].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    for (const version of ordered) {
      let result = version;
      if (inUse.has(version.number)) {
        const to = max + 1;
        result = { ...version, number: to, originalNumber: version.number };
        renumberings.set(version.id, {
          versionId: version.id,
          formulaId,
          formulaName: finalName.get(formulaId) ?? "",
          from: version.number,
          to,
        });
      }
      inUse.add(result.number);
      max = Math.max(max, result.number);
      placed.set(version.id, result);
    }
    maxNumber.set(formulaId, max);
  }
  for (const version of newVersions) puts.formulaVersions.push(placed.get(version.id)!);
  const renumbered = newVersions
    .map((version) => renumberings.get(version.id))
    .filter((entry): entry is Renumbering => entry !== undefined);

  // Formulas.
  const latestFor = (formula: Formula): number =>
    grouped.has(formula.id) ? (maxNumber.get(formula.id) ?? formula.latestVersionNumber) : formula.latestVersionNumber;
  const incomingIds = new Set<string>();
  for (const record of data.formulas) {
    incomingIds.add(record.id);
    const { cls, existing } = classify(record, deviceFormulas, sameFormula);
    tally.formulas[cls] += 1;
    if (cls === "new") {
      puts.formulas.push({ ...record, latestVersionNumber: latestFor(record) });
      added.formulas += 1;
    } else if (existing) {
      const useBackup = cls === "conflict" && policy === "useBackup";
      if (cls === "conflict") {
        if (useBackup) replaced.formulas += 1;
        else kept.formulas += 1;
      }
      const latest = latestFor(existing);
      if (useBackup) {
        const { notes: _drop, ...rest } = existing;
        void _drop;
        puts.formulas.push({
          ...rest,
          ...(record.notes !== undefined ? { notes: record.notes } : {}),
          name: record.name,
          archivedAt: record.archivedAt,
          updatedAt: record.updatedAt,
          latestVersionNumber: latest,
        });
      } else if (latest !== existing.latestVersionNumber) {
        puts.formulas.push({ ...existing, latestVersionNumber: latest });
      }
    }
  }
  // Device formulas that are not in the file but gain a version.
  for (const formula of device.formulas) {
    if (incomingIds.has(formula.id) || !grouped.has(formula.id)) continue;
    const latest = latestFor(formula);
    if (latest !== formula.latestVersionNumber) puts.formulas.push({ ...formula, latestVersionNumber: latest });
  }

  const skippedIdentical = DATA_STORES.reduce((sum, store) => sum + tally[store].identical, 0);
  const expectedCounts: BackupCounts = {
    materials: device.materials.length + added.materials,
    formulas: device.formulas.length + added.formulas,
    formulaVersions: device.formulaVersions.length + added.formulaVersions,
    measurements: device.measurements.length + added.measurements,
    batches: device.batches.length + added.batches,
    curePlans: device.curePlans.length + added.curePlans,
    productionPlans: device.productionPlans.length + added.productionPlans,
    burnSessions: device.burnSessions.length + added.burnSessions,
    burnPhotos: device.burnPhotos.length + added.burnPhotos,
    suppliers: device.suppliers.length + added.suppliers,
    materialLots: device.materialLots.length + added.materialLots,
    investigations: device.investigations.length + added.investigations,
    investigationPhotos: device.investigationPhotos.length + added.investigationPhotos,
    correctiveExperiments: device.correctiveExperiments.length + added.correctiveExperiments,
  };
  const present = new Set([
    ...device.materials.map((material) => material.id),
    ...data.materials.map((material) => material.id),
  ]);

  return {
    mode: "merge",
    policy,
    fileName: options.fileName,
    exportedAt: envelope.exportedAt,
    fileCounts: { ...envelope.counts },
    tally,
    puts,
    clear: false,
    added,
    replaced,
    kept,
    skippedIdentical,
    versionConflictsKept,
    renumbered,
    missingMaterialIds: missingMaterials(data.formulaVersions, present),
    expectedCounts,
    burnChecks: burnChecksAfter(
      after(device.batches, puts.batches),
      after(device.burnSessions, puts.burnSessions),
    ),
    // The stale check in applyRestore re-plans against this (contract).
    basis: { envelope, device: structuredClone(device) },
    // Restore integrity: device parents stay, so they count; only new breaks are listed.
    problems: restoreProblems(device, puts, false),
  };
};
