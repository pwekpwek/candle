import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import {
  applyRestore,
  canonicalJson,
  checkBackupText,
  deviceIdsOf,
  exportBackup,
  readDeviceData,
  sha256Hex,
} from "@/lib/backup";
import type { CheckFailure } from "@/lib/backup";
import { BackupEnvelopeSchema } from "@/lib/schemas";
import type { BackupEnvelope } from "@/lib/types";
import { id } from "../db/harness";
import { blankDevice, exportChecked, makeSource, newDevice, planFor } from "./apply-harness";

/**
 * Backup format 5 (v0.3): suppliers, lots, and lot links on batches are
 * exported, checked, planned and restored; formats 1 to 4 still read. See
 * docs/v0.3-lots.md, "Backup format 5". Example data is made up.
 */

const NOW = "2026-11-21T09:00:00.000Z";

/** A source device with two suppliers, three lots and two batches of one version with different lots. */
async function sourceWithLots() {
  const src = await makeSource();
  const { layer, lib } = src.device;
  const version = src.first.version;
  const wax = version.inputs.waxes[0]!.componentId;
  const oil = version.inputs.oils[0]!.componentId;
  const s1 = await layer.suppliers.create({ name: "Example Wax Co", notes: "Orders by email" });
  const s2 = await layer.suppliers.create({ name: "Second Example Supplier" });
  const waxA = await layer.materialLots.create({ materialId: lib.waxId, supplierId: s1.id, code: "WAX-TEST-1", receivedOn: "2026-10-01" });
  const waxB = await layer.materialLots.create({ materialId: lib.waxId, supplierId: s2.id, code: "WAX-TEST-2" });
  const oilA = await layer.materialLots.create({ materialId: lib.oilIds[0], supplierId: null, code: "OIL-TEST-1" });
  const { batch: a } = await layer.batches.create({
    batchId: id(),
    versionId: version.id,
    producedOn: "2026-11-10",
    label: "A",
    entries: [],
    lots: [
      { part: "row", componentId: wax, lotId: waxA.id },
      { part: "row", componentId: oil, lotId: oilA.id },
    ],
  });
  const { batch: b } = await layer.batches.create({
    batchId: id(),
    versionId: version.id,
    producedOn: "2026-11-11",
    label: "B",
    entries: [],
    lots: [{ part: "row", componentId: wax, lotId: waxB.id }],
  });
  return { ...src, s1, s2, waxA, waxB, oilA, a, b };
}

type Target = { db: Parameters<typeof readDeviceData>[0] };

async function check(text: string, target: Target) {
  return checkBackupText(text, Buffer.byteLength(text, "utf8"), deviceIdsOf(await readDeviceData(target.db)));
}

async function failureOf(text: string, target: Target): Promise<CheckFailure> {
  const result = await check(text, target);
  if (result.ok) throw new Error("expected a failure");
  return result.failure;
}

/** Re-serialises an edited envelope with counts and checksum over the stores it holds. */
async function rebuild(env: BackupEnvelope): Promise<string> {
  const data = env.data as unknown as Record<string, unknown[]>;
  const counts: Record<string, number> = {};
  for (const [store, rows] of Object.entries(data)) counts[store] = rows.length;
  env.counts = counts as BackupEnvelope["counts"];
  env.checksum = { algorithm: "SHA-256", value: await sha256Hex(canonicalJson(data)) };
  return JSON.stringify(env);
}

/** The same data as a v0.3 lots (format 5) file would hold it: no investigations, investigation photos or corrective experiments. */
function asFormat5(env: BackupEnvelope): BackupEnvelope {
  const copy = structuredClone(env);
  copy.formatVersion = 5;
  copy.schemaVersion = 5;
  const loose = copy.data as unknown as Record<string, unknown>;
  delete loose.investigations;
  delete loose.investigationPhotos;
  delete loose.correctiveExperiments;
  return copy;
}

/** The same data as a v0.2 BurnMatrix (format 4) file would hold it: no suppliers, lots or batch lot links. */
function asFormat4(env: BackupEnvelope): BackupEnvelope {
  const copy = structuredClone(env);
  copy.formatVersion = 4;
  copy.schemaVersion = 4;
  copy.appVersion = "0.2.0";
  const loose = copy.data as unknown as Record<string, unknown>;
  delete loose.suppliers;
  delete loose.materialLots;
  delete loose.investigations;
  delete loose.investigationPhotos;
  delete loose.correctiveExperiments;
  copy.data.batches = env.data.batches.map((batch) => {
    const plain = { ...batch };
    delete plain.lots;
    return plain;
  });
  return copy;
}

describe("backup format 6 export (lots since format 5)", () => {
  it("exports suppliers, lots and batch lot links with format 6, schema 6, app 0.3.0 and a checksum over all fourteen stores", async () => {
    const src = await sourceWithLots();
    const exported = await exportBackup(src.device.db, { now: () => NOW });
    const env = exported.envelope;
    expect(env).toMatchObject({ formatVersion: 6, schemaVersion: 6, appVersion: "0.3.0" });
    expect(BackupEnvelopeSchema.safeParse(env).success).toBe(true);
    expect(Object.keys(env.data)).toEqual([
      "materials",
      "formulas",
      "formulaVersions",
      "measurements",
      "batches",
      "curePlans",
      "productionPlans",
      "burnSessions",
      "burnPhotos",
      "suppliers",
      "materialLots",
      "investigations",
      "investigationPhotos",
      "correctiveExperiments",
    ]);
    expect(env.counts).toMatchObject({ suppliers: 2, materialLots: 3, batches: 2 });
    expect(env.data.suppliers.map((s) => s.id)).toEqual([src.s1.id, src.s2.id].sort());
    expect(env.checksum.value).toBe(await sha256Hex(canonicalJson(env.data)));
    const batchA = env.data.batches.find((batch) => batch.id === src.a.id)!;
    expect(batchA.lots).toEqual(src.a.lots);
  });
});

describe("restore of format 5", () => {
  it("restores into an empty device with every supplier, lot and link equal, and a second restore changes nothing", async () => {
    const src = await sourceWithLots();
    const target = blankDevice(src.device.lib);
    const { envelope } = await exportChecked(src.device.db, target.db, NOW);
    const plan = await planFor(target.db, envelope);
    expect(plan.added).toMatchObject({ suppliers: 2, materialLots: 3, batches: 2 });
    const result = await applyRestore(target.db, plan, { now: () => NOW });
    expect(result.ok).toBe(true);

    const source = await readDeviceData(src.device.db);
    const restored = await readDeviceData(target.db);
    expect(restored.suppliers).toEqual(source.suppliers);
    expect(restored.materialLots).toEqual(source.materialLots);
    expect(restored.batches).toEqual(source.batches);

    // The restored data works: the trace read joins the lots, and a used lot cannot be deleted.
    const trace = await target.layer.batchTrace.read();
    expect(trace.items.find((i) => i.batch.id === src.a.id)!.lots.map((l) => l.lot?.code)).toEqual(["WAX-TEST-1", "OIL-TEST-1"]);
    await expect(target.layer.materialLots.delete(src.waxA.id)).rejects.toMatchObject({ code: "in-use" });

    const again = await planFor(target.db, (await exportChecked(src.device.db, target.db, NOW)).envelope);
    expect(again.added).toMatchObject({ suppliers: 0, materialLots: 0, batches: 0 });
    expect(again.tally.suppliers).toEqual({ new: 0, identical: 2, conflict: 0 });
    expect(again.tally.materialLots).toEqual({ new: 0, identical: 3, conflict: 0 });
  });

  it("classifies an edited supplier or lot as a conflict that follows the keep or replace choice", async () => {
    const src = await sourceWithLots();
    const target = blankDevice(src.device.lib);
    const first = await exportChecked(src.device.db, target.db, NOW);
    expect((await applyRestore(target.db, await planFor(target.db, first.envelope))).ok).toBe(true);
    await target.layer.suppliers.update(src.s1.id, { name: "Example Wax Co (device)" });
    await target.layer.materialLots.update(src.oilA.id, { materialId: src.oilA.materialId, supplierId: null, code: "OIL-TEST-1-DEVICE" });

    const { envelope } = await exportChecked(src.device.db, target.db, NOW);
    const keep = await planFor(target.db, envelope, "merge", "keepDevice");
    expect(keep.tally.suppliers.conflict).toBe(1);
    expect(keep.tally.materialLots.conflict).toBe(1);
    expect(keep.kept).toMatchObject({ suppliers: 1, materialLots: 1 });
    expect(keep.puts.suppliers).toEqual([]);

    const use = await planFor(target.db, envelope, "merge", "useBackup");
    expect(use.replaced).toMatchObject({ suppliers: 1, materialLots: 1 });
    expect((await applyRestore(target.db, use)).ok).toBe(true);
    expect((await target.layer.suppliers.get(src.s1.id))!.name).toBe("Example Wax Co");
    expect((await target.layer.materialLots.get(src.oilA.id))!.code).toBe("OIL-TEST-1");
  });

  it("replace clears suppliers and lots and writes the file's", async () => {
    const src = await sourceWithLots();
    const target = await newDevice();
    await target.layer.suppliers.create({ name: "Only On Device Example" });
    const safetyBackup = await exportBackup(target.db, { now: () => NOW });
    const { envelope } = await exportChecked(src.device.db, target.db, NOW);
    const plan = await planFor(target.db, envelope, "replace");
    expect((await applyRestore(target.db, plan, { safetyBackup })).ok).toBe(true);
    expect((await target.layer.suppliers.list({ includeArchived: true })).map((s) => s.name)).toEqual([
      "Example Wax Co",
      "Second Example Supplier",
    ]);
    expect(await target.db.materialLots.count()).toBe(3);
  });
});

describe("format 5 checks", () => {
  it("refuses a lot whose material is nowhere, a lot whose supplier is nowhere, and a batch whose lot is nowhere", async () => {
    const src = await sourceWithLots();
    const env = (await exportBackup(src.device.db, { now: () => NOW })).envelope;

    const noMaterial = structuredClone(env);
    noMaterial.data.materials = noMaterial.data.materials.filter((m) => m.id !== src.device.lib.oilIds[0]);
    // The formula versions use that oil too, but a missing library material is informational for versions.
    expect(await failureOf(await rebuild(noMaterial), blankDevice(src.device.lib))).toMatchObject({
      code: "orphans",
      materialLots: 1,
      batchLots: 0,
    });

    const noSupplier = structuredClone(env);
    noSupplier.data.suppliers = noSupplier.data.suppliers.filter((s) => s.id !== src.s2.id);
    expect(await failureOf(await rebuild(noSupplier), blankDevice(src.device.lib))).toMatchObject({
      code: "orphans",
      materialLots: 1,
      batchLots: 0,
    });

    const noLot = structuredClone(env);
    noLot.data.materialLots = noLot.data.materialLots.filter((l) => l.id !== src.waxB.id);
    expect(await failureOf(await rebuild(noLot), blankDevice(src.device.lib))).toMatchObject({
      code: "orphans",
      materialLots: 0,
      batchLots: 1,
    });

    // Ids already on the device satisfy the checks.
    expect((await check(await rebuild(noLot), src.device)).ok).toBe(true);
    expect((await check(await rebuild(noSupplier), src.device)).ok).toBe(true);
  });

  it("does not check a batch snapshot's supplier id (it is soft; the name is snapshotted)", async () => {
    const src = await sourceWithLots();
    const env = (await exportBackup(src.device.db, { now: () => NOW })).envelope;
    const batch = env.data.batches.find((b) => b.id === src.b.id)!;
    batch.lots![0]!.supplierId = id();
    expect((await check(await rebuild(env), blankDevice(src.device.lib))).ok).toBe(true);
  });

  it("refuses bad lot records and malformed batch lot links as invalid", async () => {
    const src = await sourceWithLots();
    const env = (await exportBackup(src.device.db, { now: () => NOW })).envelope;
    const cases: ((e: BackupEnvelope) => void)[] = [
      (e) => (e.data.materialLots[0]!.code = "  "),
      (e) => (e.data.suppliers[0]!.name = ""),
      (e) => (e.data.materialLots[0]!.receivedOn = "2026-13-01"),
      (e) => delete (e.data.batches.find((b) => b.id === src.a.id)!.lots![0] as { componentId?: string }).componentId,
      (e) => (e.data.batches.find((b) => b.id === src.a.id)!.lots = []),
      (e) => {
        const lots = e.data.batches.find((b) => b.id === src.a.id)!.lots!;
        lots.push({ ...lots[0]! });
      },
      (e) => ((e.data.batches.find((b) => b.id === src.b.id)!.lots![0] as unknown as Record<string, unknown>).colour = "red"),
    ];
    for (const edit of cases) {
      const copy = structuredClone(env);
      edit(copy);
      expect(await failureOf(await rebuild(copy), blankDevice(src.device.lib))).toMatchObject({ code: "invalid" });
    }
  });

  it("refuses a format 5 file without suppliers as damaged, reads a format 5 file, and refuses a format 7 file as newer", async () => {
    const src = await sourceWithLots();
    const env = (await exportBackup(src.device.db, { now: () => NOW })).envelope;
    const without = asFormat5(env);
    delete (without.data as unknown as Record<string, unknown>).suppliers;
    expect(await failureOf(await rebuild(without), blankDevice(src.device.lib))).toMatchObject({ code: "invalid" });
    const format5 = await check(await rebuild(asFormat5(env)), blankDevice(src.device.lib));
    expect(format5.ok).toBe(true);
    if (format5.ok) expect(format5.envelope.formatVersion).toBe(5);
    const newer = structuredClone(env);
    newer.formatVersion = 7;
    expect(await failureOf(await rebuild(newer), blankDevice(src.device.lib))).toEqual({ code: "newer" });
  });
});

describe("format 4 files", () => {
  it("are read: checksum over their nine stores, then empty suppliers and lots added in memory, and restored", async () => {
    const src = await sourceWithLots();
    const env = asFormat4((await exportBackup(src.device.db, { now: () => NOW })).envelope);
    const text = await rebuild(env);
    const target = blankDevice(src.device.lib);
    const result = await check(text, target);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelope.formatVersion).toBe(4);
    expect(result.envelope.counts).toMatchObject({ suppliers: 0, materialLots: 0, batches: 2 });
    expect(result.envelope.data.suppliers).toEqual([]);
    expect(result.envelope.data.materialLots).toEqual([]);
    const plan = await planFor(target.db, result.envelope);
    expect((await applyRestore(target.db, plan)).ok).toBe(true);
    const restored = await readDeviceData(target.db);
    expect(restored.batches.every((batch) => batch.lots === undefined)).toBe(true);
    expect(restored.batches.length).toBe(2);
  });

  it("refuse a format 4 file whose batch carries lot links, or that holds suppliers", async () => {
    const src = await sourceWithLots();
    const full = (await exportBackup(src.device.db, { now: () => NOW })).envelope;
    const withLinks = asFormat4(full);
    withLinks.data.batches = full.data.batches;
    expect(await failureOf(await rebuild(withLinks), blankDevice(src.device.lib))).toMatchObject({ code: "invalid" });

    const withSuppliers = asFormat4(full) as BackupEnvelope & { data: Record<string, unknown> };
    withSuppliers.data.suppliers = full.data.suppliers;
    expect(await failureOf(await rebuild(withSuppliers), blankDevice(src.device.lib))).toMatchObject({ code: "invalid" });
  });
});
