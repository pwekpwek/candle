import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
import type { FormulaVersion } from "@/lib/types";
import { makeLibrary, newFormulaRequest, we5Input } from "../db/harness";
import type { Library } from "../db/harness";

/** Not a test file: shared setup for the v0.3 lots tests of the batch screens. */

export const layer = (): DataLayer => getDataLayer();

export async function clearStores() {
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.batches.clear(),
    db.curePlans.clear(),
    db.productionPlans.clear(),
    db.burnSessions.clear(),
    db.suppliers.clear(),
    db.materialLots.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

/** Browser APIs that jsdom lacks and the form controls use. */
export function polyfills() {
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

/**
 * A formula (wax "Soy wax", oils "Lavender" / "Vanilla" / "Cedarwood", wick
 * "Wick A", vessel "Tin 180") with one saved version, two suppliers and lots
 * for the wax (two), the first oil and the wick. Fake data only.
 */
export async function seedTrace() {
  const lib: Library = await makeLibrary(layer());
  const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
  const version = saved.version as FormulaVersion;
  const supplier = await layer().suppliers.create({ name: "Example Wax Co" });
  const other = await layer().suppliers.create({ name: "Example Oils Ltd" });
  const waxLot1 = await layer().materialLots.create({
    materialId: lib.waxId,
    supplierId: supplier.id,
    code: "LOT-TEST-001",
    receivedOn: "2026-10-01",
  });
  const waxLot2 = await layer().materialLots.create({
    materialId: lib.waxId,
    supplierId: other.id,
    code: "LOT-TEST-002",
  });
  const oilLot = await layer().materialLots.create({
    materialId: lib.oilIds[0],
    supplierId: other.id,
    code: "OIL-TEST-001",
  });
  const wickLot = await layer().materialLots.create({
    materialId: lib.wickId,
    supplierId: null,
    code: "WICK-TEST-001",
  });
  return {
    lib,
    formulaId: saved.formula.id,
    version,
    supplier,
    other,
    waxLot1,
    waxLot2,
    oilLot,
    wickLot,
  };
}

export type Trace = Awaited<ReturnType<typeof seedTrace>>;

export async function makeBatch(
  trace: Trace,
  extra: Partial<Parameters<DataLayer["batches"]["create"]>[0]> = {},
) {
  const { batch } = await layer().batches.create({
    batchId: crypto.randomUUID(),
    versionId: trace.version.id,
    producedOn: "2026-11-10",
    entries: [],
    ...extra,
  });
  return batch;
}
