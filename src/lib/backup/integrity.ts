import { batchLotSlot } from "@/lib/schemas";
import type { BackupData, DataStoreName, FormulaVersion } from "@/lib/types";
import type { IntegrityProblem, IntegrityReason } from "./contract";

/**
 * Restore integrity (v0.3 fix). Pure. Finds every required link that would be
 * broken in a complete set of data stores, that is, the data that will exist
 * once a restore has committed:
 *
 *   formula version   its formula
 *   measurement       its version, which belongs to the measurement's formula
 *   batch             its version, which belongs to the batch's formula; each
 *                     linked lot exists, names a component of that version,
 *                     and is a lot of that component's material (LT-5)
 *   cure plan         its batch (a cure plan's id is its batch's id)
 *   planned entry     its version (same formula rule as batches) and, when
 *                     set, its batch, which was made from the entry's version
 *   burn test         its batch
 *   photo             its burn test
 *   lot               its material and, when set, its supplier
 *   investigation     its batch (v0.3 CandleFix)
 *   investigation     its investigation
 *     photo
 *   corrective        its investigation; a hypothesis of that investigation;
 *     experiment      its follow-up batch, which is not the investigation's
 *                     own batch; each listed burn test, which is a burn test
 *                     of the follow-up batch
 *   cost sheet        its version, which belongs to the sheet's formula; for
 *                     a batch sheet, its batch, made from that version; each
 *                     material line names a component of that version and
 *                     that component's material (v0.3 TrueCandle Cost)
 *
 * Soft links are not checked, as documented: a version's parent version and
 * the materials its inputs name (the preview's missing-material line), a burn
 * test's planned-test milestone and wick material, and a batch lot snapshot's
 * supplier id, code and name (docs/v0.2-burnmatrix.md, docs/v0.3-lots.md), and
 * a checked item's id against the current built-in lists (docs/v0.3-candlefix.md),
 * and a cost sheet's lot ids, item ids and `copiedFromId` (snapshots,
 * docs/v0.3-cost.md).
 *
 * The app's own writes keep every one of these links, so a full export always
 * passes. Only a file that leaves out parents (or was hand-edited) fails.
 */
export function findBrokenLinks(data: BackupData): IntegrityProblem[] {
  const problems: IntegrityProblem[] = [];
  const add = (store: DataStoreName, id: string, reason: IntegrityReason, missingId: string) =>
    problems.push({ store, id, reason, missingId });

  const formulaIds = new Set(data.formulas.map((formula) => formula.id));
  const versions = new Map(data.formulaVersions.map((version) => [version.id, version]));
  const batches = new Map(data.batches.map((batch) => [batch.id, batch]));
  const sessionIds = new Set(data.burnSessions.map((session) => session.id));
  const materialIds = new Set(data.materials.map((material) => material.id));
  const supplierIds = new Set(data.suppliers.map((supplier) => supplier.id));
  const lots = new Map(data.materialLots.map((lot) => [lot.id, lot]));
  const sessions = new Map(data.burnSessions.map((session) => [session.id, session]));
  const investigations = new Map(data.investigations.map((investigation) => [investigation.id, investigation]));

  /** Missing version, or a version of another formula; "ok" otherwise. */
  const versionLink = (versionId: string, formulaId: string): IntegrityReason | "ok" => {
    const version = versions.get(versionId);
    if (!version) return "version-missing";
    return version.formulaId === formulaId ? "ok" : "version-of-other-formula";
  };

  for (const version of data.formulaVersions) {
    if (!formulaIds.has(version.formulaId)) add("formulaVersions", version.id, "formula-missing", version.formulaId);
  }
  for (const measurement of data.measurements) {
    const link = versionLink(measurement.versionId, measurement.formulaId);
    if (link !== "ok") add("measurements", measurement.id, link, measurement.versionId);
  }
  for (const batch of data.batches) {
    const link = versionLink(batch.versionId, batch.formulaId);
    if (link !== "ok") add("batches", batch.id, link, batch.versionId);
    const version = versions.get(batch.versionId);
    const slots = version ? slotMaterials(version) : undefined;
    for (const lotLink of batch.lots ?? []) {
      const lot = lots.get(lotLink.lotId);
      if (!lot) {
        add("batches", batch.id, "lot-missing", lotLink.lotId);
        continue;
      }
      // Without its version the components cannot be known; that is reported above.
      if (!slots) continue;
      const key = batchLotSlot(lotLink);
      const material = slots.get(key);
      if (material === undefined) add("batches", batch.id, "component-missing", key);
      else if (lot.materialId !== material) add("batches", batch.id, "lot-of-other-material", lot.id);
    }
  }
  for (const plan of data.curePlans) {
    if (!batches.has(plan.id)) add("curePlans", plan.id, "batch-missing", plan.id);
  }
  for (const entry of data.productionPlans) {
    const link = versionLink(entry.versionId, entry.formulaId);
    if (link !== "ok") add("productionPlans", entry.id, link, entry.versionId);
    if (entry.batchId !== null) {
      const batch = batches.get(entry.batchId);
      if (!batch) add("productionPlans", entry.id, "batch-missing", entry.batchId);
      else if (batch.versionId !== entry.versionId) {
        add("productionPlans", entry.id, "batch-of-other-version", entry.batchId);
      }
    }
  }
  for (const session of data.burnSessions) {
    if (!batches.has(session.batchId)) add("burnSessions", session.id, "batch-missing", session.batchId);
  }
  for (const photo of data.burnPhotos) {
    if (!sessionIds.has(photo.sessionId)) add("burnPhotos", photo.id, "session-missing", photo.sessionId);
  }
  for (const lot of data.materialLots) {
    if (!materialIds.has(lot.materialId)) add("materialLots", lot.id, "material-missing", lot.materialId);
    if (lot.supplierId !== null && !supplierIds.has(lot.supplierId)) {
      add("materialLots", lot.id, "supplier-missing", lot.supplierId);
    }
  }
  // v0.3 CandleFix.
  for (const investigation of data.investigations) {
    if (!batches.has(investigation.batchId)) {
      add("investigations", investigation.id, "batch-missing", investigation.batchId);
    }
  }
  for (const photo of data.investigationPhotos) {
    if (!investigations.has(photo.investigationId)) {
      add("investigationPhotos", photo.id, "investigation-missing", photo.investigationId);
    }
  }
  for (const experiment of data.correctiveExperiments) {
    const investigation = investigations.get(experiment.investigationId);
    if (!investigation) {
      add("correctiveExperiments", experiment.id, "investigation-missing", experiment.investigationId);
    } else {
      if (!investigation.hypotheses.some((hypothesis) => hypothesis.id === experiment.hypothesisId)) {
        add("correctiveExperiments", experiment.id, "hypothesis-missing", experiment.hypothesisId);
      }
      if (experiment.followUpBatchId === investigation.batchId) {
        add("correctiveExperiments", experiment.id, "follow-up-is-original", experiment.followUpBatchId);
      }
    }
    if (!batches.has(experiment.followUpBatchId)) {
      add("correctiveExperiments", experiment.id, "follow-up-missing", experiment.followUpBatchId);
    }
    for (const sessionId of experiment.burnSessionIds) {
      const session = sessions.get(sessionId);
      if (!session) add("correctiveExperiments", experiment.id, "listed-session-missing", sessionId);
      else if (session.batchId !== experiment.followUpBatchId) {
        add("correctiveExperiments", experiment.id, "session-of-other-batch", sessionId);
      }
    }
  }
  // v0.3 TrueCandle Cost.
  for (const sheet of data.costSheets) {
    const link = versionLink(sheet.versionId, sheet.formulaId);
    if (link !== "ok") add("costSheets", sheet.id, link, sheet.versionId);
    if (sheet.batchId !== null) {
      const batch = batches.get(sheet.batchId);
      if (!batch) add("costSheets", sheet.id, "batch-missing", sheet.batchId);
      else if (batch.versionId !== sheet.versionId) add("costSheets", sheet.id, "batch-of-other-version", sheet.batchId);
    }
    const version = versions.get(sheet.versionId);
    // Without its version the components cannot be known; that is reported above.
    if (!version) continue;
    const slots = slotMaterials(version);
    for (const line of sheet.materials) {
      const material = slots.get(line.key);
      if (material === undefined) add("costSheets", sheet.id, "component-missing", line.key);
      else if (material !== line.materialId) add("costSheets", sheet.id, "line-of-other-material", line.materialId);
    }
  }
  return problems;
}

/** The material of each component a lot can be recorded for, keyed as `batchLotSlot` keys them. */
function slotMaterials(version: FormulaVersion): Map<string, string> {
  const slots = new Map<string, string>();
  for (const row of [...version.inputs.waxes, ...version.inputs.oils]) {
    slots.set(batchLotSlot({ part: "row", componentId: row.componentId }), row.materialId);
  }
  if (version.inputs.wick) slots.set(batchLotSlot({ part: "wick" }), version.inputs.wick.materialId);
  if (version.inputs.vessel) slots.set(batchLotSlot({ part: "vessel" }), version.inputs.vessel.materialId);
  return slots;
}

const keyOf = (problem: IntegrityProblem) =>
  `${problem.store}\u0000${problem.id}\u0000${problem.reason}\u0000${problem.missingId}`;

/** The device records with `puts` laid over them by id, store by store (what a merge leaves). */
export function overlay(device: BackupData, puts: BackupData): BackupData {
  const lay = <T extends { id: string }>(rows: readonly T[], over: readonly T[]): T[] => {
    const map = new Map(rows.map((row) => [row.id, row]));
    for (const row of over) map.set(row.id, row);
    return [...map.values()];
  };
  return {
    materials: lay(device.materials, puts.materials),
    formulas: lay(device.formulas, puts.formulas),
    formulaVersions: lay(device.formulaVersions, puts.formulaVersions),
    measurements: lay(device.measurements, puts.measurements),
    batches: lay(device.batches, puts.batches),
    curePlans: lay(device.curePlans, puts.curePlans),
    productionPlans: lay(device.productionPlans, puts.productionPlans),
    burnSessions: lay(device.burnSessions, puts.burnSessions),
    burnPhotos: lay(device.burnPhotos, puts.burnPhotos),
    suppliers: lay(device.suppliers, puts.suppliers),
    materialLots: lay(device.materialLots, puts.materialLots),
    investigations: lay(device.investigations, puts.investigations),
    investigationPhotos: lay(device.investigationPhotos, puts.investigationPhotos),
    correctiveExperiments: lay(device.correctiveExperiments, puts.correctiveExperiments),
    costItems: lay(device.costItems, puts.costItems),
    costSheets: lay(device.costSheets, puts.costSheets),
  };
}

/**
 * The broken links a restore would leave. Replace (`clear`): every broken link
 * in what it writes, since nothing else stays. Merge: only links the restore
 * itself would break; a problem the device already had is left alone, so a
 * merge never fails over the device's own history.
 */
export function restoreProblems(device: BackupData, puts: BackupData, clear: boolean): IntegrityProblem[] {
  if (clear) return findBrokenLinks(puts);
  const before = new Set(findBrokenLinks(device).map(keyOf));
  return findBrokenLinks(overlay(device, puts)).filter((problem) => !before.has(keyOf(problem)));
}
