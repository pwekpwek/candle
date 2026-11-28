import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  applyRestore,
  canonicalJson,
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  planRestore,
  readDeviceData,
  sha256Hex,
} from "@/lib/backup";
import type { BackupEnvelope } from "@/lib/types";
import { id } from "../db/harness";
import { makeSource } from "./apply-harness";

/**
 * Restore integrity fix (v0.3), the High finding Codex confirmed on 35712da:
 * a checksum-valid but incomplete format 5 file whose batch's version is only
 * on the device was accepted by the check, cleared by "Replace everything",
 * and reported as success with the batch unreadable. Steps follow the Codex
 * reproduction exactly. Generated test data only.
 */

const NOW = "2026-11-28T09:00:00.000Z";

async function rebuild(env: BackupEnvelope): Promise<string> {
  const data = env.data as unknown as Record<string, unknown[]>;
  const counts: Record<string, number> = {};
  for (const [store, rows] of Object.entries(data)) counts[store] = rows.length;
  env.counts = counts as BackupEnvelope["counts"];
  env.checksum = { algorithm: "SHA-256", value: await sha256Hex(canonicalJson(data)) };
  return JSON.stringify(env);
}

describe("restore integrity: Codex reproduction (batch, format 5, Replace)", () => {
  it("refuses Replace when the batch's version exists only on the device, and changes nothing", async () => {
    // 1. A valid formula version and a batch that refers to it; a full safety backup.
    const src = await makeSource();
    const { db, layer } = src.device;
    const version = src.first.version;
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-20",
      label: "REPRO-1",
      entries: [],
    });
    const safetyBackup = await exportBackup(db, { now: () => NOW });

    // 2. A checksum-valid format 5 file that keeps the batch but drops formulas, versions and measurements.
    const edited = JSON.parse(safetyBackup.json) as BackupEnvelope;
    expect(edited.formatVersion).toBe(7);
    // Downgrade to a real format 5 file: no CandleFix or cost stores.
    edited.formatVersion = 5;
    edited.schemaVersion = 5;
    const loose = edited.data as unknown as Record<string, unknown>;
    delete loose.investigations;
    delete loose.investigationPhotos;
    delete loose.correctiveExperiments;
    delete loose.costItems;
    delete loose.costSheets;
    edited.data.formulas = [];
    edited.data.formulaVersions = [];
    edited.data.measurements = [];
    const text = await rebuild(edited);

    // 3. The file check against the populated device still accepts it (Merge may reuse the device's version).
    const device = await readDeviceData(db);
    const checked = await checkBackupText(text, Buffer.byteLength(text, "utf8"), deviceIdsOf(device));
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;

    // 4. Plan Replace: the plan names the broken link instead of looking ready.
    const plan = planRestore(checked.envelope, device, { mode: "replace", policy: "keepDevice", fileName: "edited.json" });
    expect(plan.problems.length).toBeGreaterThan(0);
    expect(plan.problems[0]).toMatchObject({ store: "batches", id: batch.id, reason: "version-missing", missingId: version.id });

    // 5. Apply it anyway (a bypassed preview): refused, device and meta untouched, the batch still readable.
    const metaBefore = canonicalJson(await db.meta.toArray());
    const result = await applyRestore(db, plan, { safetyBackup, now: () => NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("integrity");
    expect(canonicalJson(await readDeviceData(db))).toBe(canonicalJson(device));
    expect(canonicalJson(await db.meta.toArray())).toBe(metaBefore);
    expect((await layer.batches.get(batch.id))?.version.id).toBe(version.id);
  });

  it("still allows Merge for the same file: the device's version stays and the batch reads", async () => {
    const src = await makeSource();
    const { db, layer } = src.device;
    const version = src.first.version;
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-20",
      entries: [],
    });
    const exported = await exportBackup(db, { now: () => NOW });
    const edited = JSON.parse(exported.json) as BackupEnvelope;
    edited.data.formulas = [];
    edited.data.formulaVersions = [];
    edited.data.measurements = [];
    const text = await rebuild(edited);
    const device = await readDeviceData(db);
    const checked = await checkBackupText(text, Buffer.byteLength(text, "utf8"), deviceIdsOf(device));
    if (!checked.ok) throw new Error(checked.failure.code);
    const plan = planRestore(checked.envelope, device, { mode: "merge", policy: "keepDevice", fileName: "edited.json" });
    expect(plan.problems).toEqual([]);
    const result = await applyRestore(db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);
    expect((await layer.batches.get(batch.id))?.version.id).toBe(version.id);
  });
});
