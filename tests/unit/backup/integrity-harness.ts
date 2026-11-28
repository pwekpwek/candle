import "fake-indexeddb/auto";
import { expect } from "vitest";
import {
  applyRestore,
  canonicalJson,
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  readDeviceData,
  sha256Hex,
} from "@/lib/backup";
import type { ApplyRestoreOptions, RestorePlan } from "@/lib/backup";
import type { CandleDatabase } from "@/lib/db";
import type { BackupEnvelope, DataStoreName } from "@/lib/types";
import { id } from "../db/harness";
import { addFormula, addMeasurement, makeSource } from "./apply-harness";

/** Not a test file: shared setup for the restore-integrity matrix tests. Generated data only. */

export const NOW = "2026-11-28T09:00:00.000Z";

/** A generated "JPEG" (FF D8 FF marker plus patterned bytes). Not a real photo. */
export function fakeJpeg(size: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size; i++) bytes[i] = (i * 7 + seed * 13) % 256;
  return bytes;
}

/** Re-serialises an edited envelope with counts and checksum over the stores it holds. */
export async function rebuild(env: BackupEnvelope): Promise<string> {
  const data = env.data as unknown as Record<string, unknown[]>;
  const counts: Record<string, number> = {};
  for (const [store, rows] of Object.entries(data)) counts[store] = rows.length;
  env.counts = counts as BackupEnvelope["counts"];
  env.checksum = { algorithm: "SHA-256", value: await sha256Hex(canonicalJson(data)) };
  return JSON.stringify(env);
}

/** Removes one record from a store of the envelope. */
export function drop(env: BackupEnvelope, store: DataStoreName, recordId: string): void {
  const rows = env.data[store] as { id: string }[];
  (env.data as unknown as Record<string, unknown>)[store] = rows.filter((row) => row.id !== recordId);
}

/** Runs the file check against a device's ids and returns the envelope; throws when the check refuses. */
export async function envelopeOf(text: string, db: CandleDatabase): Promise<BackupEnvelope> {
  const result = await checkBackupText(text, Buffer.byteLength(text, "utf8"), deviceIdsOf(await readDeviceData(db)));
  if (!result.ok) throw new Error(`check failed: ${JSON.stringify(result.failure)}`);
  return result.envelope;
}

/** Every record and the meta rows, as text, to prove a refused restore changed nothing. */
export async function snapshot(db: CandleDatabase) {
  return {
    data: canonicalJson(await readDeviceData(db)),
    meta: canonicalJson(await db.meta.toArray()),
  };
}

/** Applies and expects a refusal with one of `reasons`; the device and meta must be byte-identical afterwards. */
export async function expectRefused(
  db: CandleDatabase,
  plan: RestorePlan,
  options: ApplyRestoreOptions = {},
  reasons: string[] = ["integrity"],
) {
  const before = await snapshot(db);
  const result = await applyRestore(db, plan, { now: () => NOW, ...options });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(reasons).toContain(result.reason);
  const after = await snapshot(db);
  expect(after.data).toBe(before.data);
  expect(after.meta).toBe(before.meta);
  return result;
}

export function safetyOf(db: CandleDatabase) {
  return exportBackup(db, { now: () => NOW });
}

/**
 * A rich source device. Each record below has exactly one job, so a test can
 * leave out one parent and break exactly one link.
 *
 *   F1 Alpha: v1 (batches K, D, B, H, J; entry E2), v2 (batch C), measurement m1
 *   F2 Beta:  vB (measurement m2)
 *   F3 Gamma: vG (entry E1, open)
 *   F4 Delta: vD (measurement mD)
 *   K   lots on the wax row (waxLot) and oil row (oilLot)
 *   D   cure plan only
 *   B   made from entry E2
 *   H   burn session S (no photo)
 *   J   cure plan, burn session S2 (linked to its burn-test milestone) with photo P
 *   suppliers s1, s2; lots waxLot (s1), oilLot, L3 (oil 3), L4 (oil 2, s2)
 */
export async function buildRich() {
  const src = await makeSource();
  const { device } = src;
  const { layer, lib } = device;
  const v1 = src.first.version;
  const v2 = src.second.version;
  const vB = src.other.version;
  const gamma = await addFormula(device, "Gamma");
  const delta = await addFormula(device, "Delta");
  const mD = await addMeasurement(device, delta.formula.id, delta.version.id);

  const s1 = await layer.suppliers.create({ name: "Example Wax Co", notes: "Orders by email" });
  const s2 = await layer.suppliers.create({ name: "Second Example Supplier" });
  const waxLot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: s1.id, code: "WAX-T-1", receivedOn: "2026-10-01" });
  const oilLot = await layer.materialLots.create({ materialId: lib.oilIds[0], supplierId: null, code: "OIL-T-1" });
  const L3 = await layer.materialLots.create({ materialId: lib.oilIds[2], supplierId: null, code: "OIL-T-3" });
  const L4 = await layer.materialLots.create({ materialId: lib.oilIds[1], supplierId: s2.id, code: "OIL-T-2" });

  const waxRow = v1.inputs.waxes[0]!.componentId;
  const oilRow = v1.inputs.oils[0]!.componentId;
  const make = async (versionId: string, label: string, extra: { lots?: { part: "row"; componentId: string; lotId: string }[]; productionPlanId?: string } = {}) =>
    (await layer.batches.create({ batchId: id(), versionId, producedOn: "2026-11-10", label, entries: [], ...extra })).batch;

  const K = await make(v1.id, "K", {
    lots: [
      { part: "row", componentId: waxRow, lotId: waxLot.id },
      { part: "row", componentId: oilRow, lotId: oilLot.id },
    ],
  });
  const C = await make(v2.id, "C");
  const D = await make(v1.id, "D");
  await layer.curePlans.save(D.id, [{ kind: "cureEnd", offsetDays: 14 }]);
  const H = await make(v1.id, "H");
  const J = await make(v1.id, "J");
  const cureJ = await layer.curePlans.save(J.id, [
    { kind: "cureEnd", offsetDays: 14 },
    { kind: "burnTest", offsetDays: 3, label: "First burn" },
  ]);

  const { plan: E1 } = await layer.productionPlans.create({ planId: id(), versionId: gamma.version.id, plannedOn: "2026-12-02", label: "Dec run" });
  const { plan: openE2 } = await layer.productionPlans.create({ planId: id(), versionId: v1.id, plannedOn: "2026-11-18" });
  const B = await make(v1.id, "B", { productionPlanId: openE2.id });
  const E2 = (await layer.productionPlans.get(openE2.id))!.plan;

  const candle = { label: "A", wick: { text: "CD-10" }, burns: [{ durationMin: 60 }] };
  const { session: S } = await layer.burnSessions.create({ sessionId: id(), batchId: H.id, testedOn: "2026-11-13", milestoneId: null, candles: [candle] });
  const { session: S2 } = await layer.burnSessions.create({
    sessionId: id(),
    batchId: J.id,
    testedOn: "2026-11-13",
    milestoneId: cureJ.milestones[1]!.id,
    candles: [candle],
  });
  const { photo: P } = await layer.burnPhotos.add({ photoId: id(), sessionId: S2.id, bytes: fakeJpeg(3000, 1), width: 1600, height: 1200 });

  return {
    ...src,
    device,
    v1, v2, vB,
    F1: src.first.formula.id,
    F2: src.other.formula.id,
    gamma, delta, mD,
    vG: gamma.version,
    vD: delta.version,
    s1, s2, waxLot, oilLot, L3, L4,
    waxRow, oilRow,
    K, C, D, H, J, B,
    E1, E2, S, S2, P,
  };
}

export type Rich = Awaited<ReturnType<typeof buildRich>>;

/** The full export of the rich device, parsed, for editing. */
export async function exportOf(r: Rich): Promise<BackupEnvelope> {
  return structuredClone((await exportBackup(r.device.db, { now: () => NOW })).envelope);
}
