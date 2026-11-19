import "fake-indexeddb/auto";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
import { addDays, todayLocal } from "@/lib/schedule";
import type { Batch, FormulaVersion } from "@/lib/types";
import { makeLibrary, newFormulaRequest, revisionRequest, we5Input } from "../db/harness";

/** Not a test file: shared setup for the CurePilot screen tests. */

export const layer = (): DataLayer => getDataLayer();

/** Browser APIs that Radix and the page code expect and jsdom lacks. */
export function polyfillBrowser() {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
}

export async function clearDatabase() {
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.batches.clear(),
    db.curePlans.clear(),
    db.productionPlans.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

/** Days relative to the device's local today, as YYYY-MM-DD. */
export const daysFromToday = (days: number) => addDays(todayLocal(), days);

export async function seedFormula() {
  const lib = await makeLibrary(layer());
  const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
  return {
    lib,
    formulaId: saved.formula.id,
    version: saved.version as FormulaVersion,
  };
}

/** A second version of the same formula (a revision). */
export async function seedRevision(s: Awaited<ReturnType<typeof seedFormula>>) {
  const saved = await layer().versions.save(
    revisionRequest(s.formulaId, s.version.id, we5Input(s.lib)),
  );
  return saved.version as FormulaVersion;
}

export async function seedBatch(producedOn: string, label?: string) {
  const s = await seedFormula();
  const batch = await makeBatch(s.version.id, producedOn, label);
  return { ...s, batch };
}

export async function makeBatch(
  versionId: string,
  producedOn: string,
  label?: string,
  productionPlanId?: string,
): Promise<Batch> {
  const { batch } = await layer().batches.create({
    batchId: crypto.randomUUID(),
    versionId,
    producedOn,
    ...(label ? { label } : {}),
    ...(productionPlanId ? { productionPlanId } : {}),
    entries: [],
  });
  return batch;
}
