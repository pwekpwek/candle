import "fake-indexeddb/auto";
import { vi } from "vitest";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { BurnCandleInput, BurnSessionInput, DataLayer } from "@/lib/db";
import type { Batch, BurnSession } from "@/lib/types";
import { makeLibrary, newFormulaRequest, we5Input } from "../db/harness";

/** Not a test file: shared setup for the BurnMatrix comparison, list and report screen tests. */

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

/** Every store is emptied before each test, so each test starts on a clean database. */
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
    db.burnSessions.clear(),
    db.burnPhotos.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

export async function seedBatch(label?: string, producedOn = "2026-11-10"): Promise<Batch> {
  const lib = await makeLibrary(layer());
  const saved = await layer().versions.save(newFormulaRequest(we5Input(lib)));
  const { batch } = await layer().batches.create({
    batchId: crypto.randomUUID(),
    versionId: saved.version.id,
    producedOn,
    ...(label ? { label } : {}),
    entries: [],
  });
  return batch;
}

export function candle(label: string, overrides: Partial<BurnCandleInput> = {}): BurnCandleInput {
  return {
    label,
    wick: { text: "CD-10" },
    burns: [
      { durationMin: 240, weightBeforeMg: 250_000, weightAfterMg: 238_500, meltPoolDiameterMm: 62, soot: "light", notes: "even pool" },
      { durationMin: 180 },
    ],
    coldThrow: "Light lavender",
    ...overrides,
  };
}

export async function makeSession(
  batch: Batch,
  overrides: Partial<BurnSessionInput> = {},
): Promise<BurnSession> {
  const { session } = await layer().burnSessions.create({
    sessionId: crypto.randomUUID(),
    batchId: batch.id,
    testedOn: "2026-11-18",
    milestoneId: null,
    candles: [candle("Candle 1")],
    ...overrides,
  });
  return session;
}

/** A small generated "JPEG": the FF D8 FF marker and some bytes. Not a real photo. */
export async function addPhoto(sessionId: string, caption?: string) {
  const bytes = new Uint8Array(64).fill(7);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return layer().burnPhotos.add({
    photoId: crypto.randomUUID(),
    sessionId,
    bytes,
    width: 10,
    height: 10,
    ...(caption ? { caption } : {}),
  });
}
