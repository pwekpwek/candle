import "fake-indexeddb/auto";
import { vi } from "vitest";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { DataLayer, InvestigationInput } from "@/lib/db";
import type { Batch } from "@/lib/types";
import { makeLibrary, newFormulaRequest, revisionRequest, we5Input } from "../db/harness";

/** Not a test file: shared setup for the CandleFix investigation screen tests (4a). */

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
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
}

export async function clearAll() {
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
    db.burnPhotos.clear(),
    db.investigations.clear(),
    db.investigationPhotos.clear(),
    db.correctiveExperiments.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

export const fakeJpeg = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * 5) % 256;
  return bytes;
};

/**
 * A formula with versions 1 and 2, an original batch from version 1
 * (2026-11-10, "FIX-A") and a follow-up batch from version 2 (2026-11-20, "FIX-B").
 */
export async function seedBatches() {
  const l = layer();
  const lib = await makeLibrary(l);
  const first = await l.versions.save(newFormulaRequest(we5Input(lib)));
  const second = await l.versions.save(
    revisionRequest(first.formula.id, first.version.id, we5Input(lib, { fragranceBp: 700, changeNote: "less oil" })),
  );
  const make = async (versionId: string, producedOn: string, label: string): Promise<Batch> =>
    (await l.batches.create({ batchId: crypto.randomUUID(), versionId, producedOn, label, entries: [] })).batch;
  const original = await make(first.version.id, "2026-11-10", "FIX-A");
  const followUp = await make(second.version.id, "2026-11-20", "FIX-B");
  return { first, second, original, followUp };
}

export async function seedInvestigation(batchId: string, overrides: Partial<InvestigationInput> = {}) {
  const { investigation } = await layer().investigations.create({
    investigationId: crypto.randomUUID(),
    batchId,
    observedOn: "2026-11-14",
    title: "Rough top",
    issues: ["tunneling", "frosting"],
    checks: [],
    hypotheses: [],
    ...overrides,
  });
  return investigation;
}

export async function seedSession(batchId: string, testedOn: string) {
  const { session } = await layer().burnSessions.create({
    sessionId: crypto.randomUUID(),
    batchId,
    testedOn,
    milestoneId: null,
    candles: [{ label: "Candle 1", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] }],
  });
  return session;
}
