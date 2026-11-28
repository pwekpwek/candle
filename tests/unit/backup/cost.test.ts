import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { applyRestore, canonicalJson, checkBackupText, deviceIdsOf, exportBackup, planRestore, readDeviceData } from "@/lib/backup";
import type { IntegrityProblem, RestoreMode } from "@/lib/backup";
import type { CandleDatabase } from "@/lib/db";
import type { BackupEnvelope, DataStoreName } from "@/lib/types";
import { id } from "../db/harness";
import { blankDevice } from "./apply-harness";
import { NOW, buildRich, drop, envelopeOf, exportOf, expectRefused, rebuild, safetyOf, snapshot } from "./integrity-harness";

/**
 * v0.3 TrueCandle Cost: backup format 7, older formats refusing the new
 * fields, and restore integrity for the cost sheet links (docs/v0.3-cost.md
 * "Backup format 7"). Generated data and made-up prices only.
 *
 * On top of the rich device (integrity-harness.ts):
 *   wax material price ₱180.00 per kg; waxLot purchase ₱4,350.00 for 20 kg
 *   K   counts 12 made, 10 sellable
 *   item  "Demo label" ₱6.75
 *   BS  batch sheet on K (v1), with the label line, labour and scenarios
 *   VS  version sheet on vB (formula F2), 6 candles
 */
async function buildCost() {
  const r = await buildRich();
  const { layer, lib } = r.device;
  await layer.materials.update(lib.waxId, { type: "wax", name: "Soy wax", defaultPriceCentavos: 18_000 });
  await layer.materialLots.update(r.waxLot.id, {
    materialId: lib.waxId,
    supplierId: r.s1.id,
    code: "WAX-T-1",
    receivedOn: "2026-10-01",
    purchase: { paidCentavos: 435_000, quantity: 20_000_000 },
  });
  await layer.batches.update(r.K.id, { producedOn: r.K.producedOn, entries: [], candlesMade: 12, sellable: 10 });
  const item = await layer.costItems.create({ name: "Demo label", unitCentavos: 675 });
  const { sheet: created } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: r.K.id }, title: "K costing" });
  const BS = await layer.costSheets.update(created.id, {
    title: "K costing",
    candlesMade: created.candlesMade,
    sellable: created.sellable,
    materials: created.materials.map((line) => ({
      key: line.key,
      ...(line.quantity.unit === "piece" ? { perCandle: line.quantity.perCandle } : {}),
      price: line.key === "vessel" ? { source: "sheet", unitCentavos: 3_850 } : line.price,
    })),
    items: [{ itemId: item.id, name: item.name, unitCentavos: item.unitCentavos, per: "sellable", quantity: 1 }],
    labourHoursX100: 350,
    labourRateCentavos: 9_500,
    overhead: { mode: "percent", bp: 1_250 },
    testingCentavos: 15_000,
    pricesIncludeVat: true,
    wholesale: { mode: "margin", marginBp: 4_000 },
    retail: { mode: "price", priceCentavos: 45_000 },
  });
  expect(BS.materials[0]!.price).toMatchObject({ source: "lot", lotId: r.waxLot.id });
  const { sheet: VS } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: r.vB.id }, candlesMade: 6 });
  return { ...r, item, BS, VS };
}
type Cost = Awaited<ReturnType<typeof buildCost>>;

function plan(envelope: BackupEnvelope, device: Awaited<ReturnType<typeof readDeviceData>>, mode: RestoreMode, policy: "keepDevice" | "useBackup" = "keepDevice") {
  return planRestore(envelope, device, { mode, policy, fileName: "edited.json" });
}

const sortProblems = (list: readonly IntegrityProblem[]) =>
  [...list].sort((a, b) => canonicalJson(a).localeCompare(canonicalJson(b)));

async function prune(db: CandleDatabase, rows: [DataStoreName, string][]) {
  for (const [store, recordId] of rows) await db.table(store).delete(recordId);
}

/** The envelope as an older format would have written it: without the cost stores. */
function asFormat6(env: BackupEnvelope): BackupEnvelope {
  const old = structuredClone(env);
  old.formatVersion = 6;
  old.schemaVersion = 6;
  for (const store of ["costItems", "costSheets"] as const) delete (old.data as unknown as Record<string, unknown>)[store];
  return old;
}

describe("backup format 7 export and round trip", () => {
  it("exports prices, candle counts, items and sheets, and restores them byte for byte by Replace and Merge", async () => {
    const c = await buildCost();
    const exported = await exportBackup(c.device.db, { now: () => NOW });
    const env = exported.envelope;
    expect(env.formatVersion).toBe(7);
    expect(env.schemaVersion).toBe(7);
    expect(env.counts).toMatchObject({ costItems: 1, costSheets: 2 });
    expect(env.data.materials.find((m) => m.id === c.device.lib.waxId)?.defaultPriceCentavos).toBe(18_000);
    expect(env.data.materialLots.find((l) => l.id === c.waxLot.id)?.purchase).toEqual({ paidCentavos: 435_000, quantity: 20_000_000 });
    expect(env.data.batches.find((b) => b.id === c.K.id)).toMatchObject({ candlesMade: 12, sellable: 10 });
    const source = canonicalJson(await readDeviceData(c.device.db));

    for (const mode of ["replace", "merge"] as const) {
      const target = blankDevice(c.device.lib);
      const checked = await envelopeOf(exported.json, target.db);
      const p = plan(checked, await readDeviceData(target.db), mode);
      expect(p.problems).toEqual([]);
      const options = mode === "replace" ? { safetyBackup: await safetyOf(target.db), now: () => NOW } : { now: () => NOW };
      expect((await applyRestore(target.db, p, options)).ok, mode).toBe(true);
      expect(canonicalJson(await readDeviceData(target.db)), mode).toBe(source);
      expect((await target.layer.costSheets.get(c.BS.id))?.sheet, mode).toEqual(c.BS);
      expect((await target.layer.costSheets.list({ batchId: c.K.id })).map((i) => i.sheet.id), mode).toEqual([c.BS.id]);
    }

    const again = plan(await envelopeOf(exported.json, c.device.db), await readDeviceData(c.device.db), "merge");
    expect(again.tally.costSheets).toEqual({ new: 0, identical: 2, conflict: 0 });
    expect(again.tally.costItems).toEqual({ new: 0, identical: 1, conflict: 0 });
  });

  it("an edited sheet is a conflict under Merge; keepDevice keeps the device's, useBackup takes the file's", async () => {
    const c = await buildCost();
    const env = await exportOf(c);
    env.data.costSheets.find((s) => s.id === c.VS.id)!.title = "Renamed in the file";
    const text = await rebuild(env);
    const keep = plan(await envelopeOf(text, c.device.db), await readDeviceData(c.device.db), "merge", "keepDevice");
    expect(keep.tally.costSheets).toEqual({ new: 0, identical: 1, conflict: 1 });
    expect((await applyRestore(c.device.db, keep, { now: () => NOW })).ok).toBe(true);
    expect((await c.device.layer.costSheets.get(c.VS.id))?.sheet.title).toBeUndefined();
    const use = plan(await envelopeOf(text, c.device.db), await readDeviceData(c.device.db), "merge", "useBackup");
    expect((await applyRestore(c.device.db, use, { now: () => NOW })).ok).toBe(true);
    expect((await c.device.layer.costSheets.get(c.VS.id))?.sheet.title).toBe("Renamed in the file");
  });
});

describe("older formats", () => {
  it("a format 6 file restores into a device with cost data: Merge keeps the sheets, Replace removes them", async () => {
    const c = await buildCost();
    const env = asFormat6(await exportOf(c));
    // A real format 6 file has no prices, purchases or counts.
    for (const m of env.data.materials) delete m.defaultPriceCentavos;
    for (const l of env.data.materialLots) delete l.purchase;
    for (const b of env.data.batches) {
      delete b.candlesMade;
      delete b.sellable;
    }
    const text = await rebuild(env);
    const checked = await envelopeOf(text, c.device.db);
    expect(checked.formatVersion).toBe(6);
    expect(checked.data.costSheets).toEqual([]);
    expect(checked.data.costItems).toEqual([]);

    // Merge: the file's copies of the wax, its lot and K differ (no price, purchase, counts) and the
    // device keeps its own; the sheets stay.
    const merge = plan(checked, await readDeviceData(c.device.db), "merge");
    expect(merge.problems).toEqual([]);
    expect(merge.tally.materials.conflict).toBe(1);
    expect((await applyRestore(c.device.db, merge, { now: () => NOW })).ok).toBe(true);
    expect(await c.device.db.costSheets.count()).toBe(2);

    // Replace keeps only the file (the maker confirmed Replace).
    const replace = plan(checked, await readDeviceData(c.device.db), "replace");
    expect(replace.problems).toEqual([]);
    expect(replace.expectedCounts).toMatchObject({ costItems: 0, costSheets: 0 });
    expect((await applyRestore(c.device.db, replace, { now: () => NOW, safetyBackup: await safetyOf(c.device.db) })).ok).toBe(true);
    expect(await c.device.db.costSheets.count()).toBe(0);
    expect((await c.device.db.batches.get(c.K.id))?.candlesMade).toBeUndefined();
  });

  for (const [what, edit, problem] of [
    ["a material price", (env: BackupEnvelope) => { env.data.materials[0]!.defaultPriceCentavos = 100; }, "unexpected field defaultPriceCentavos"],
    ["a lot purchase", (env: BackupEnvelope) => { env.data.materialLots[0]!.purchase = { paidCentavos: 1, quantity: 1 }; }, "unexpected field purchase"],
    ["batch candle counts", (env: BackupEnvelope) => { env.data.batches[0]!.candlesMade = 3; }, "unexpected field candlesMade"],
  ] as const) {
    it(`a format 6 file with ${what} is refused as damaged`, async () => {
      const c = await buildCost();
      const env = asFormat6(await exportOf(c));
      for (const m of env.data.materials) delete m.defaultPriceCentavos;
      for (const l of env.data.materialLots) delete l.purchase;
      for (const b of env.data.batches) {
        delete b.candlesMade;
        delete b.sellable;
      }
      edit(env);
      const text = await rebuild(env);
      const result = await checkBackupText(text, Buffer.byteLength(text), deviceIdsOf(await readDeviceData(c.device.db)));
      expect(result.ok).toBe(false);
      expect(!result.ok && result.failure).toMatchObject({ code: "invalid", count: 1, firstProblem: problem });
    });
  }

  it("a format 7 file with sellable above candles made, or a 100% margin, is refused as damaged", async () => {
    const c = await buildCost();
    for (const edit of [
      (env: BackupEnvelope) => { env.data.batches.find((b) => b.id === c.K.id)!.sellable = 13; },
      (env: BackupEnvelope) => { env.data.costSheets.find((s) => s.id === c.BS.id)!.wholesale = { mode: "margin", marginBp: 10_000 }; },
      (env: BackupEnvelope) => { env.data.costSheets.find((s) => s.id === c.VS.id)!.batchId = c.K.id; },
    ]) {
      const env = await exportOf(c);
      edit(env);
      const text = await rebuild(env);
      const result = await checkBackupText(text, Buffer.byteLength(text), deviceIdsOf(await readDeviceData(c.device.db)));
      expect(!result.ok && result.failure.code).toBe("invalid");
    }
  });

  it("counts cost sheets whose version or batch is neither in the file nor on the device", async () => {
    const c = await buildCost();
    const env = await exportOf(c);
    drop(env, "batches", c.K.id);
    const blank = blankDevice(c.device.lib);
    const text = await rebuild(env);
    const result = await checkBackupText(text, Buffer.byteLength(text), deviceIdsOf(await readDeviceData(blank.db)));
    expect(!result.ok && result.failure).toMatchObject({ code: "orphans", costSheets: 1 });
  });
});

type CostWithMeasurements = Cost & { measurementsOfVB: string[] };
type Case = {
  name: string;
  problems: (c: CostWithMeasurements) => IntegrityProblem[];
  drop: (c: CostWithMeasurements) => [DataStoreName, string][];
  prune: (c: CostWithMeasurements) => [DataStoreName, string][];
};

const DEVICE_ONLY_PARENTS: Case[] = [
  {
    name: "batch sheet -> batch",
    problems: (c) => [{ store: "costSheets", id: c.BS.id, reason: "batch-missing", missingId: c.K.id }],
    drop: (c) => [["batches", c.K.id]],
    prune: (c) => [["costSheets", c.BS.id]],
  },
  {
    name: "version sheet -> version",
    problems: (c) => [
      { store: "costSheets", id: c.VS.id, reason: "version-missing", missingId: c.vB.id },
      ...c.measurementsOfVB.map((m) => ({ store: "measurements" as const, id: m, reason: "version-missing" as const, missingId: c.vB.id })),
    ],
    drop: (c) => [["formulaVersions", c.vB.id]],
    prune: (c) => [["costSheets", c.VS.id], ...c.measurementsOfVB.map((m): [DataStoreName, string] => ["measurements", m])],
  },
];

async function withMeasurements(c: Cost): Promise<CostWithMeasurements> {
  const device = await readDeviceData(c.device.db);
  return { ...c, measurementsOfVB: device.measurements.filter((m) => m.versionId === c.vB.id).map((m) => m.id) };
}

describe("restore integrity: cost sheet parents only on the device", () => {
  for (const k of DEVICE_ONLY_PARENTS) {
    it(`${k.name}: Replace is refused and changes nothing; Merge uses the device's parent`, async () => {
      const c = await withMeasurements(await buildCost());
      const env = await exportOf(c);
      for (const [store, recordId] of k.drop(c)) drop(env, store, recordId);
      const text = await rebuild(env);

      const replace = plan(await envelopeOf(text, c.device.db), await readDeviceData(c.device.db), "replace");
      expect(sortProblems(replace.problems)).toEqual(sortProblems(k.problems(c)));
      await expectRefused(c.device.db, replace, { safetyBackup: await safetyOf(c.device.db) });

      await prune(c.device.db, k.prune(c));
      const before = await snapshot(c.device.db);
      const merge = plan(await envelopeOf(text, c.device.db), await readDeviceData(c.device.db), "merge");
      expect(merge.problems).toEqual([]);
      expect((await applyRestore(c.device.db, merge, { now: () => NOW })).ok).toBe(true);
      expect((await snapshot(c.device.db)).data).not.toBe(before.data);
      expect(await c.device.layer.costSheets.list()).toHaveLength(2);
    });
  }
});

describe("restore integrity: cost sheet ownership", () => {
  const EDITS: { name: string; edit: (c: Cost, env: BackupEnvelope) => { sheetId: string; problems: IntegrityProblem[] } }[] = [
    {
      name: "a version sheet whose version belongs to another formula",
      edit: (c, env) => {
        env.data.costSheets.find((s) => s.id === c.VS.id)!.formulaId = c.F1;
        return { sheetId: c.VS.id, problems: [{ store: "costSheets", id: c.VS.id, reason: "version-of-other-formula", missingId: c.vB.id }] };
      },
    },
    {
      name: "a batch sheet whose batch was made from another version",
      edit: (c, env) => {
        const sheet = env.data.costSheets.find((s) => s.id === c.BS.id)!;
        sheet.versionId = c.v2.id;
        // v2 is a revision with fresh component ids, so the wax and oil lines name components it does not have.
        const rowLines = sheet.materials.filter((l) => l.key.startsWith("row:"));
        return {
          sheetId: c.BS.id,
          problems: [
            { store: "costSheets", id: c.BS.id, reason: "batch-of-other-version", missingId: c.K.id },
            ...rowLines.map((l) => ({ store: "costSheets" as const, id: c.BS.id, reason: "component-missing" as const, missingId: l.key })),
          ],
        };
      },
    },
    {
      name: "a line naming a component the version does not have",
      edit: (c, env) => {
        const line = env.data.costSheets.find((s) => s.id === c.VS.id)!.materials[1]!;
        line.key = "row:not-a-component";
        return { sheetId: c.VS.id, problems: [{ store: "costSheets", id: c.VS.id, reason: "component-missing", missingId: "row:not-a-component" }] };
      },
    },
    {
      name: "a line naming another material than its component's",
      edit: (c, env) => {
        const other = id();
        env.data.costSheets.find((s) => s.id === c.BS.id)!.materials[0]!.materialId = other;
        return { sheetId: c.BS.id, problems: [{ store: "costSheets", id: c.BS.id, reason: "line-of-other-material", missingId: other }] };
      },
    },
  ];
  for (const e of EDITS) {
    it(`${e.name}: refused under Replace and under Merge`, async () => {
      const c = await buildCost();
      const env = await exportOf(c);
      const { sheetId, problems } = e.edit(c, env);
      const text = await rebuild(env);
      const replace = plan(await envelopeOf(text, c.device.db), await readDeviceData(c.device.db), "replace");
      expect(sortProblems(replace.problems)).toEqual(sortProblems(problems));
      await expectRefused(c.device.db, replace, { safetyBackup: await safetyOf(c.device.db) });

      await prune(c.device.db, [["costSheets", sheetId]]);
      const merge = plan(await envelopeOf(text, c.device.db), await readDeviceData(c.device.db), "merge");
      expect(sortProblems(merge.problems)).toEqual(sortProblems(problems));
      await expectRefused(c.device.db, merge);
    });
  }

  it("soft links stay unchecked: a deleted lot, a deleted item and a deleted copied-from sheet do not refuse a restore", async () => {
    const c = await buildCost();
    const { sheet: copy } = await c.device.layer.costSheets.copy({ sheetId: id(), fromId: c.VS.id });
    const env = await exportOf(c);
    drop(env, "costSheets", c.VS.id);
    drop(env, "costItems", c.item.id);
    // The lot BS priced from is gone too; K's own lot link is dropped with it so only the sheet's snapshot names it.
    drop(env, "materialLots", c.waxLot.id);
    const K = env.data.batches.find((b) => b.id === c.K.id)!;
    K.lots = K.lots!.filter((link) => link.lotId !== c.waxLot.id);
    const text = await rebuild(env);
    const target = blankDevice(c.device.lib);
    const replace = plan(await envelopeOf(text, target.db), await readDeviceData(target.db), "replace");
    expect(replace.problems).toEqual([]);
    expect((await applyRestore(target.db, replace, { now: () => NOW, safetyBackup: await safetyOf(target.db) })).ok).toBe(true);
    const detail = await target.layer.costSheets.get(copy.id);
    expect(detail?.copiedFrom).toBeNull();
    expect((await target.layer.costSheets.get(c.BS.id))?.sheet.materials[0]!.price).toMatchObject({ source: "lot", lotCode: "WAX-T-1" });
  });
});
