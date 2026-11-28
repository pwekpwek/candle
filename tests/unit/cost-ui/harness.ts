import "fake-indexeddb/auto";
import { vi } from "vitest";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer } from "@/lib/db";
import type { CostSheetFigures } from "@/lib/cost";
import type { Batch, CostSheet } from "@/lib/types";
import { WB1_FIGURES } from "../../fixtures/cost-worked-batch";
import { makeLibrary, newFormulaRequest, we5Input } from "../db/harness";

/** Not a test file: shared setup for the TrueCandle Cost screen tests. */

export const layer = (): DataLayer => getDataLayer();

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

export async function clearAll() {
  const db = openDatabase();
  await Promise.all([
    db.materials.clear(),
    db.formulas.clear(),
    db.formulaVersions.clear(),
    db.measurements.clear(),
    db.batches.clear(),
    db.materialLots.clear(),
    db.suppliers.clear(),
    db.costItems.clear(),
    db.costSheets.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

/** A fictional formula with one wax, two oils, a wick and a vessel (the shape of WB-1), saved as version 1. */
export async function seedFormula(name = "Demo Soy Blend") {
  const l = layer();
  const lib = await makeLibrary(l);
  const input = we5Input(lib, { name, oils: we5Input(lib).oils.slice(0, 2) });
  const saved = await l.versions.save(newFormulaRequest(input));
  return { lib, ...saved };
}

export async function seedBatch(versionId: string, overrides: { label?: string; candlesMade?: number; sellable?: number } = {}): Promise<Batch> {
  const { batch } = await layer().batches.create({
    batchId: crypto.randomUUID(),
    versionId,
    producedOn: "2026-11-20",
    label: overrides.label ?? "CL-2611-A",
    entries: [],
    ...(overrides.candlesMade === undefined ? {} : { candlesMade: overrides.candlesMade }),
    ...(overrides.sellable === undefined ? {} : { sellable: overrides.sellable }),
  });
  return batch;
}

/**
 * A stored version sheet whose cost fields are WB-1 (docs/v0.3-cost.md): the
 * line keys, materials and names come from the saved version, the weights,
 * prices, items, labour, overhead, testing and scenarios from the fixture.
 */
export async function seedWb1Sheet(
  versionId: string,
  patch: Partial<Pick<CostSheet, "title" | "pricesIncludeVat" | "sellable" | "wholesale" | "retail" | "copiedFromId" | "materials">> = {},
  figures: CostSheetFigures = WB1_FIGURES,
): Promise<CostSheet> {
  const { sheet } = await layer().costSheets.create({
    sheetId: crypto.randomUUID(),
    basis: { kind: "version", versionId },
    title: "Price list sheet",
    candlesMade: 12,
    sellable: 10,
  });
  const materials = sheet.materials.map((line, i) => ({
    ...figures.materials[i],
    key: line.key,
    materialId: line.materialId,
    materialType: line.materialType,
    name: line.name,
  }));
  const next: CostSheet = { ...sheet, ...figures, materials, title: sheet.title, ...patch };
  const db = openDatabase();
  await db.costSheets.put(next);
  db.close();
  return next;
}

export const mockNavigation = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
  forward: vi.fn(),
});
