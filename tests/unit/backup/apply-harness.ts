import "fake-indexeddb/auto";
import {
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  planRestore,
  readDeviceData,
} from "@/lib/backup";
import type { ConflictPolicy, ExportedBackup, RestoreMode, RestorePlan } from "@/lib/backup";
import type { CandleDatabase } from "@/lib/db";
import type { BackupEnvelope, FormulaVersion } from "@/lib/types";
import {
  makeLibrary,
  makeMeasurement,
  newFormulaRequest,
  revisionRequest,
  setup,
  we5Input,
} from "../db/harness";
import type { Library } from "../db/harness";

/** Not a test file: shared setup for the restore-apply tests. */

export type Device = ReturnType<typeof setup> & { lib: Library };

/** A second, separate database that has the library (materials) but no formulas yet. */
export async function newDevice(): Promise<Device> {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  return { ...ctx, lib };
}

/**
 * An empty database. `lib` is the id set of materials it will hold once a
 * restore has copied them from the device that made the file.
 */
export function blankDevice(lib: Library): Device {
  return { ...setup(), lib };
}

/** Creates a formula with its first version through the data layer. */
export async function addFormula(device: Device, name: string, fragranceBp = 800) {
  const request = newFormulaRequest(we5Input(device.lib, { name, fragranceBp }));
  return device.layer.versions.save(request);
}

/** Adds the next version to a formula through the data layer. */
export async function addRevision(
  device: Device,
  formulaId: string,
  parent: FormulaVersion,
  fragranceBp: number,
) {
  return device.layer.versions.save(
    revisionRequest(formulaId, parent.id, we5Input(device.lib, { fragranceBp })),
  );
}

export async function addMeasurement(device: Device, formulaId: string, versionId: string) {
  const record = makeMeasurement(formulaId, versionId);
  await device.db.measurements.put(record);
  return record;
}

/** A source device with two formulas, three versions and two measurements. */
export async function makeSource() {
  const device = await newDevice();
  const first = await addFormula(device, "Alpha");
  const second = await addRevision(device, first.formula.id, first.version, 700);
  const other = await addFormula(device, "Beta");
  const m1 = await addMeasurement(device, first.formula.id, first.version.id);
  const m2 = await addMeasurement(device, other.formula.id, other.version.id);
  return { device, first, second, other, m1, m2 };
}

/** Exports `source`, then runs the file through `checkBackupText` against `target`. */
export async function exportChecked(
  source: CandleDatabase,
  target: CandleDatabase,
  exportedAt = "2026-11-16T09:00:00.000Z",
): Promise<{ exported: ExportedBackup; envelope: BackupEnvelope }> {
  const exported = await exportBackup(source, { now: () => exportedAt });
  const result = await checkBackupText(
    exported.json,
    Buffer.byteLength(exported.json, "utf8"),
    deviceIdsOf(await readDeviceData(target)),
  );
  if (!result.ok) throw new Error(`check failed: ${result.failure.code}`);
  return { exported, envelope: result.envelope };
}

export async function planFor(
  target: CandleDatabase,
  envelope: BackupEnvelope,
  mode: RestoreMode = "merge",
  policy: ConflictPolicy = "keepDevice",
): Promise<RestorePlan> {
  return planRestore(envelope, await readDeviceData(target), {
    mode,
    policy,
    fileName: "backup.json",
  });
}
