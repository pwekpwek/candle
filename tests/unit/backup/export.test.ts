import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { backupFileName, canonicalJson, exportBackup, sha256Hex } from "@/lib/backup";
import { META_KEYS } from "@/lib/db/meta";
import { BackupEnvelopeSchema } from "@/lib/schemas/backup";
import type { BackupData, Material } from "@/lib/types";
import { id, makeMeasurement, seedFormula, setup } from "../db/harness";

const T = "2026-11-10T06:00:00.000Z";
const NOW = "2026-11-14T06:05:12.000Z";

function material(overrides: Partial<Material>): Material {
  return { id: id(), type: "wax", name: "Soy", createdAt: T, updatedAt: T, archivedAt: null, ...overrides };
}

async function seed() {
  const ctx = setup();
  const { db } = ctx;
  const wax = material({ name: "Soy wax" });
  const oil = material({ type: "fragranceOil", name: "Cedar" });
  const old = material({ type: "wick", name: "Old wick", archivedAt: "2026-11-12T00:00:00.000Z" });
  await db.materials.bulkAdd([wax, oil, old]);
  const a = await seedFormula(db, 3, { waxId: wax.id, oilId: oil.id }, { name: "Alpha" });
  const b = await seedFormula(db, 1, {}, { name: "Beta", archivedAt: "2026-11-13T00:00:00.000Z" });
  const ms = [
    makeMeasurement(a.formula.id, a.versions[0].id),
    makeMeasurement(a.formula.id, a.versions[2].id),
  ];
  await db.measurements.bulkAdd(ms);
  await db.drafts.put({ key: "draft-secret-key", value: "DRAFT-SECRET-VALUE" } as never);
  await db.meta.bulkPut([
    { key: META_KEYS.changesSinceBackup, value: 7 },
    { key: META_KEYS.persistence, value: "granted" },
    { key: META_KEYS.exampleOffered, value: true },
  ]);
  return { ...ctx, wax, oil, old, a, b, ms };
}

describe("exportBackup", () => {
  it("produces an envelope that satisfies the schema, with matching counts", async () => {
    const { db } = await seed();
    const { envelope } = await exportBackup(db, { now: () => NOW });
    expect(BackupEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(envelope.exportedAt).toBe(NOW);
    expect(envelope.counts).toEqual({ materials: 3, formulas: 2, formulaVersions: 4, measurements: 2 });
    for (const store of ["materials", "formulas", "formulaVersions", "measurements"] as const) {
      expect(envelope.counts[store]).toBe(envelope.data[store].length);
      expect(envelope.counts[store]).toBe(await db[store].count());
    }
    expect(Object.keys(envelope)).toEqual([
      "format",
      "formatVersion",
      "schemaVersion",
      "appVersion",
      "exportedAt",
      "counts",
      "checksum",
      "data",
    ]);
  });

  it("sorts every array by id and carries every record unchanged, archived ones included", async () => {
    const { db, wax, oil, old, a, b, ms } = await seed();
    const { envelope } = await exportBackup(db, { now: () => NOW });
    for (const rows of Object.values(envelope.data)) {
      const ids = (rows as { id: string }[]).map((r) => r.id);
      expect(ids).toEqual([...ids].sort());
    }
    const find = <T extends { id: string }>(rows: T[], rec: T) => rows.find((r) => r.id === rec.id);
    for (const m of [wax, oil, old]) expect(find(envelope.data.materials, m)).toEqual(m);
    for (const f of [a.formula, b.formula]) expect(find(envelope.data.formulas, f)).toEqual(f);
    for (const v of [...a.versions, ...b.versions]) {
      expect(find(envelope.data.formulaVersions, v)).toEqual(v);
    }
    for (const m of ms) expect(find(envelope.data.measurements, m)).toEqual(m);
    expect(envelope.data.materials.some((m) => m.archivedAt)).toBe(true);
    expect(envelope.data.formulas.some((f) => f.archivedAt)).toBe(true);
  });

  it("leaves drafts and meta out of the file", async () => {
    const { db } = await seed();
    const { json } = await exportBackup(db, { now: () => NOW });
    for (const text of [
      "draft-secret-key",
      "DRAFT-SECRET-VALUE",
      "persistence",
      "exampleOffered",
      "changesSinceBackup",
    ]) {
      expect(json).not.toContain(text);
    }
  });

  it("checksums the canonical data section and formats the text", async () => {
    const { db } = await seed();
    const { envelope, json, fileName } = await exportBackup(db, { now: () => NOW });
    expect(envelope.checksum.algorithm).toBe("SHA-256");
    expect(envelope.checksum.value).toBe(await sha256Hex(canonicalJson(envelope.data)));
    expect(JSON.parse(json)).toEqual(envelope);
    expect(json).toBe(JSON.stringify(envelope, null, 2));
    expect(json.split("\n")[1]).toMatch(/^ {2}"format"/);
    expect(fileName).toBe(backupFileName(NOW));
    expect(fileName).toBe("candlelab-backup-20261114-060512.json");
  });

  it("changes the checksum when any value changes, not when keys are reordered", async () => {
    const { db } = await seed();
    const { envelope } = await exportBackup(db, { now: () => NOW });
    const hash = (d: BackupData) => sha256Hex(canonicalJson(d));
    const base = await hash(envelope.data);
    expect(base).toBe(envelope.checksum.value);

    const edited = structuredClone(envelope.data);
    edited.formulas[0].name += "!";
    expect(await hash(edited)).not.toBe(base);

    const edited2 = structuredClone(envelope.data);
    edited2.formulaVersions[0].inputs.fragranceBp += 1;
    expect(await hash(edited2)).not.toBe(base);

    const reordered = structuredClone(envelope.data);
    reordered.formulas = reordered.formulas.map(
      (f) => Object.fromEntries(Object.entries(f).reverse()) as typeof f,
    );
    expect(await hash(reordered)).toBe(base);
  });

  it("sets the backup meta and resets the change counter", async () => {
    const { db, layer } = await seed();
    expect((await layer.meta.get()).changesSinceBackup).toBe(7);
    await exportBackup(db, { now: () => NOW });
    const meta = await layer.meta.get();
    expect(meta.lastBackupAt).toBe(NOW);
    expect(meta.lastBackupCounts).toEqual({ formulas: 2, formulaVersions: 4 });
    expect(meta.changesSinceBackup).toBe(0);
    expect(meta.persistence).toBe("granted");
  });

  it("exports an empty database and still sets the meta", async () => {
    const { db, layer } = setup();
    const { envelope } = await exportBackup(db, { now: () => NOW });
    expect(BackupEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(envelope.counts).toEqual({ materials: 0, formulas: 0, formulaVersions: 0, measurements: 0 });
    expect(envelope.checksum.value).toBe(await sha256Hex(canonicalJson(envelope.data)));
    const meta = await layer.meta.get();
    expect(meta.lastBackupAt).toBe(NOW);
    expect(meta.lastBackupCounts).toEqual({ formulas: 0, formulaVersions: 0 });
    expect(meta.changesSinceBackup).toBe(0);
  });

  it("gives identical data and checksum when exported twice with no changes", async () => {
    const { db } = await seed();
    const first = await exportBackup(db, { now: () => NOW });
    const second = await exportBackup(db, { now: () => "2026-11-14T06:09:00.000Z" });
    expect(second.envelope.data).toEqual(first.envelope.data);
    expect(second.envelope.checksum).toEqual(first.envelope.checksum);
  });

  it("defaults the clock to the current time", async () => {
    const { db } = setup();
    const { envelope } = await exportBackup(db);
    expect(Number.isNaN(Date.parse(envelope.exportedAt))).toBe(false);
  });
});
