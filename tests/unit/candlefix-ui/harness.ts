import "fake-indexeddb/auto";
import { vi } from "vitest";
import { getDataLayer, openDatabase } from "@/lib/db";
import type { BurnCandleInput, DataLayer, InvestigationInput } from "@/lib/db";
import type { Batch, BurnSession } from "@/lib/types";
import { makeLibrary, newFormulaRequest, revisionRequest, we5Input } from "../db/harness";

/** Not a test file: shared setup for the CandleFix experiment, comparison and list screen tests. */

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
    db.investigations.clear(),
    db.investigationPhotos.clear(),
    db.correctiveExperiments.clear(),
    db.drafts.clear(),
    db.meta.clear(),
  ]);
  db.close();
}

export type World = Awaited<ReturnType<typeof seedWorld>>;

/**
 * A formula with versions 1 and 2, an original batch from version 1
 * (2026-11-10, "FIX-A") and a follow-up batch from version 2 (2026-11-20,
 * "FIX-B"). The investigation is on the original batch, with one hypothesis.
 */
export async function seedWorld(options: { investigation?: Partial<InvestigationInput> } = {}) {
  const l = layer();
  const lib = await makeLibrary(l);
  const first = await l.versions.save(newFormulaRequest(we5Input(lib)));
  const second = await l.versions.save(
    revisionRequest(first.formula.id, first.version.id, we5Input(lib, { fragranceBp: 700, changeNote: "less oil" })),
  );
  const make = async (versionId: string, producedOn: string, label: string): Promise<Batch> =>
    (
      await l.batches.create({
        batchId: crypto.randomUUID(),
        versionId,
        producedOn,
        label,
        entries: [],
      })
    ).batch;
  const original = await make(first.version.id, "2026-11-10", "FIX-A");
  const followUp = await make(second.version.id, "2026-11-20", "FIX-B");
  const { investigation } = await l.investigations.create({
    investigationId: crypto.randomUUID(),
    batchId: original.id,
    observedOn: "2026-11-14",
    title: "Rough top",
    issues: ["tunneling", "frosting"],
    checks: [],
    hypotheses: [{ text: "The wick is small for the tin.", status: "open" }],
    ...options.investigation,
  });
  return { first, second, original, followUp, investigation, hypothesisId: investigation.hypotheses[0].id };
}

export function candle(label: string, overrides: Partial<BurnCandleInput> = {}): BurnCandleInput {
  return {
    label,
    wick: { text: "CD-10" },
    burns: [
      { durationMin: 240, weightBeforeMg: 250_000, weightAfterMg: 238_500, meltPoolDiameterMm: 62, soot: "light" },
      { durationMin: 180 },
    ],
    ...overrides,
  };
}

export async function makeSession(batch: Batch, testedOn: string, label?: string): Promise<BurnSession> {
  const { session } = await layer().burnSessions.create({
    sessionId: crypto.randomUUID(),
    batchId: batch.id,
    testedOn,
    milestoneId: null,
    candles: [candle("Candle 1")],
    ...(label ? { label } : {}),
  });
  return session;
}

export async function makeExperiment(
  world: Pick<World, "investigation" | "hypothesisId" | "followUp">,
  overrides: { burnSessionIds?: string[]; change?: string; notes?: string } = {},
) {
  const { experiment } = await layer().correctiveExperiments.create({
    experimentId: crypto.randomUUID(),
    investigationId: world.investigation.id,
    hypothesisId: world.hypothesisId,
    followUpBatchId: world.followUp.id,
    burnSessionIds: [],
    ...overrides,
  });
  return experiment;
}

export const makeRouter = () => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
  forward: vi.fn(),
  bfcacheId: "t",
});
