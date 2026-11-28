import { describe, expect, it } from "vitest";
import { calculateCost, formatPeso } from "@/lib/cost";
import type { CostSheetInput, DataLayer } from "@/lib/db";
import type { CostSheet, FormulaVersion } from "@/lib/types";
import { counterOf, id, makeLibrary, newFormulaRequest, setup, we5Input } from "./harness";
import type { Library } from "./harness";

/**
 * v0.3 TrueCandle Cost data layer (docs/v0.3-cost.md): prices on materials and
 * lots, candle counts on batches, packaging items, cost sheets (snapshots,
 * editing rules, copy and update) and the delete guards. Generated data only.
 */

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ code });
}

async function formulaWithLibrary(layer: DataLayer) {
  const lib = await makeLibrary(layer);
  const { version } = await layer.versions.save(newFormulaRequest(we5Input(lib)));
  return { lib, version };
}

function inputOf(sheet: CostSheet, overrides: Partial<CostSheetInput> = {}): CostSheetInput {
  return {
    ...(sheet.title !== undefined ? { title: sheet.title } : {}),
    candlesMade: sheet.candlesMade,
    sellable: sheet.sellable,
    materials: sheet.materials.map((line) => ({
      key: line.key,
      ...(line.quantity.unit === "piece" ? { perCandle: line.quantity.perCandle } : {}),
      price: line.price,
    })),
    items: sheet.items.map((line) => ({ ...line })),
    labourHoursX100: sheet.labourHoursX100,
    labourRateCentavos: sheet.labourRateCentavos,
    overhead: sheet.overhead,
    testingCentavos: sheet.testingCentavos,
    pricesIncludeVat: sheet.pricesIncludeVat,
    wholesale: sheet.wholesale,
    retail: sheet.retail,
    ...(sheet.notes !== undefined ? { notes: sheet.notes } : {}),
    ...overrides,
  };
}

const rowKey = (version: FormulaVersion, index: number) =>
  `row:${[...version.inputs.waxes, ...version.inputs.oils][index]!.componentId}`;

describe("prices on materials and lots", () => {
  it("saves and clears a material's default price", async () => {
    const { layer } = setup();
    const wax = await layer.materials.create({ type: "wax", name: "Demo wax", defaultPriceCentavos: 18_000 });
    expect(wax.defaultPriceCentavos).toBe(18_000);
    const cleared = await layer.materials.update(wax.id, { type: "wax", name: "Demo wax" });
    expect(cleared.defaultPriceCentavos).toBeUndefined();
    await expectCode(layer.materials.create({ type: "wick", name: "W", defaultPriceCentavos: -1 }), "invalid");
    await expectCode(layer.materials.create({ type: "wick", name: "W", defaultPriceCentavos: 1.5 }), "invalid");
    await expectCode(layer.materials.create({ type: "wick", name: "W", defaultPriceCentavos: 1_000_000_001 }), "invalid");
  });

  it("saves a lot's purchase, checks the quantity against the material's type, and clears it", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const lot = await layer.materialLots.create({
      materialId: lib.waxId,
      supplierId: null,
      code: "DEMO-1",
      purchase: { paidCentavos: 435_000, quantity: 20_000_000 },
    });
    expect(lot.purchase).toEqual({ paidCentavos: 435_000, quantity: 20_000_000 });
    // A wick lot counts pieces: at most 1,000,000.
    await expectCode(
      layer.materialLots.create({ materialId: lib.wickId, supplierId: null, code: "W1", purchase: { paidCentavos: 1, quantity: 1_000_001 } }),
      "invalid",
    );
    await expectCode(
      layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "W2", purchase: { paidCentavos: 1, quantity: 0 } }),
      "invalid",
    );
    const wickLot = await layer.materialLots.create({
      materialId: lib.wickId,
      supplierId: null,
      code: "W3",
      purchase: { paidCentavos: 45_000, quantity: 100 },
    });
    await expectCode(
      layer.materialLots.update(wickLot.id, { materialId: lib.wickId, supplierId: null, code: "W3", purchase: { paidCentavos: 1, quantity: 2_000_000 } }),
      "invalid",
    );
    const cleared = await layer.materialLots.update(lot.id, { materialId: lib.waxId, supplierId: null, code: "DEMO-1" });
    expect(cleared.purchase).toBeUndefined();
  });
});

describe("candle counts on batches", () => {
  it("records, keeps, clears and validates candles made and sellable", async () => {
    const { layer } = setup();
    const { version } = await formulaWithLibrary(layer);
    const { batch } = await layer.batches.create({
      batchId: id(), versionId: version.id, producedOn: "2026-11-20", entries: [], candlesMade: 12, sellable: 10,
    });
    expect([batch.candlesMade, batch.sellable]).toEqual([12, 10]);
    // Absent keeps.
    const kept = await layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [] });
    expect([kept.candlesMade, kept.sellable]).toEqual([12, 10]);
    // Sellable above made, sellable without made, clearing made while sellable stays.
    await expectCode(layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [], sellable: 13 }), "invalid");
    await expectCode(layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [], candlesMade: null }), "invalid");
    await expectCode(
      layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-20", entries: [], sellable: 1 }),
      "invalid",
    );
    await expectCode(layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [], candlesMade: 0 }), "invalid");
    // Null clears.
    const cleared = await layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [], candlesMade: null, sellable: null });
    expect(cleared.candlesMade).toBeUndefined();
    expect(cleared.sellable).toBeUndefined();
    expect("candlesMade" in cleared).toBe(false);
  });
});

describe("packaging and other items", () => {
  it("creates, refuses a duplicate name, updates, archives and deletes while sheets keep their copy", async () => {
    const { layer } = setup();
    const before = await counterOf(layer);
    const label = await layer.costItems.create({ name: "  Label  ", unitCentavos: 675, notes: "  " });
    expect(label).toMatchObject({ name: "Label", unitCentavos: 675, archivedAt: null });
    expect("notes" in label).toBe(false);
    expect(await counterOf(layer)).toBe(before + 1);
    await expectCode(layer.costItems.create({ name: "label", unitCentavos: 1 }), "invalid");
    await expectCode(layer.costItems.create({ name: "", unitCentavos: 1 }), "invalid");
    await expectCode(layer.costItems.create({ name: "Box", unitCentavos: -5 }), "invalid");
    const box = await layer.costItems.create({ name: "Box", unitCentavos: 1_800 });
    await layer.costItems.setArchived(box.id, true);
    expect((await layer.costItems.list()).map((i) => i.name)).toEqual(["Label"]);
    expect((await layer.costItems.list({ includeArchived: true })).map((i) => i.name)).toEqual(["Box", "Label"]);

    const { version } = await formulaWithLibrary(layer);
    const { sheet } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: version.id }, candlesMade: 6 });
    const withItem = await layer.costSheets.update(
      sheet.id,
      inputOf(sheet, { items: [{ itemId: label.id, name: "Label", unitCentavos: 675, per: "sellable", quantity: 1 }] }),
    );
    expect(await layer.costItems.usage(label.id)).toEqual({ sheets: 1 });
    await layer.costItems.update(label.id, { name: "Label v2", unitCentavos: 700 });
    await layer.costItems.delete(label.id);
    expect(await layer.costItems.get(label.id)).toBeUndefined();
    const after = await layer.costSheets.get(sheet.id);
    expect(after?.sheet.items).toEqual(withItem.items);
    expect(after?.sheet.items[0]).toMatchObject({ itemId: label.id, name: "Label", unitCentavos: 675 });
    await expectCode(layer.costItems.delete(label.id), "not-found");
  });
});

describe("cost sheets", () => {
  it("builds a version sheet from planned weights and material prices, in the version's order", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    await layer.materials.update(lib.waxId, { type: "wax", name: "Soy wax", defaultPriceCentavos: 18_000 });
    await layer.materials.update(lib.vesselId, { type: "vessel", name: "Tin 180", defaultPriceCentavos: 3_850 });
    const { version } = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const before = await counterOf(layer);
    const sheetId = id();
    await expectCode(layer.costSheets.create({ sheetId, basis: { kind: "version", versionId: version.id } }), "invalid");
    const { sheet, created } = await layer.costSheets.create({
      sheetId, basis: { kind: "version", versionId: version.id }, title: "  First costing ", candlesMade: 6,
    });
    expect(created).toBe(true);
    expect(await counterOf(layer)).toBe(before + 1);
    expect(sheet).toMatchObject({
      title: "First costing", basis: "version", formulaId: version.formulaId, versionId: version.id, batchId: null,
      candlesMade: 6, sellable: 6, items: [], labourHoursX100: 0, overhead: { mode: "fixed", centavos: 0 },
      pricesIncludeVat: false, wholesale: null, retail: null, copiedFromId: null,
    });
    expect(sheet.materials.map((line) => line.key)).toEqual([rowKey(version, 0), rowKey(version, 1), rowKey(version, 2), rowKey(version, 3), "wick", "vessel"]);
    const targets = new Map(version.targets.components.map((t) => [`row:${t.componentId}`, t.targetMg]));
    for (const line of sheet.materials.slice(0, 4)) {
      expect(line.quantity).toEqual({ unit: "mg", mg: targets.get(line.key), from: "planned" });
    }
    expect(sheet.materials[0]!.price).toEqual({ source: "material", unitCentavos: 18_000 });
    expect(sheet.materials[1]!.price).toEqual({ source: "none" });
    expect(sheet.materials[4]).toMatchObject({ materialType: "wick", quantity: { unit: "piece", perCandle: 1 }, price: { source: "none" } });
    expect(sheet.materials[5]!.price).toEqual({ source: "material", unitCentavos: 3_850 });

    // Idempotent: the same id writes nothing.
    const again = await layer.costSheets.create({ sheetId, basis: { kind: "version", versionId: version.id }, candlesMade: 99 });
    expect(again).toEqual({ sheet, created: false });
    expect(await counterOf(layer)).toBe(before + 1);
    await expectCode(layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: id() }, candlesMade: 1 }), "not-found");
    await expectCode(
      layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: version.id }, candlesMade: 5, sellable: 6 }),
      "invalid",
    );
  });

  it("builds a batch sheet from measured weights, the batch's priced lots and its counts; later edits never change it", async () => {
    const { layer } = setup();
    const { lib, version } = await formulaWithLibrary(layer);
    await layer.materials.update(lib.waxId, { type: "wax", name: "Soy wax", defaultPriceCentavos: 99_999 });
    await layer.materials.update(lib.oilIds[0], { type: "fragranceOil", name: "Lavender", defaultPriceCentavos: 185_000 });
    const waxLot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "SOY-DEMO-01", purchase: { paidCentavos: 435_000, quantity: 20_000_000 } });
    const unpricedOilLot = await layer.materialLots.create({ materialId: lib.oilIds[0], supplierId: null, code: "LAV-1" });
    const wickLot = await layer.materialLots.create({ materialId: lib.wickId, supplierId: null, code: "WICK-DEMO-7", purchase: { paidCentavos: 45_000, quantity: 100 } });
    const wax = version.inputs.waxes[0]!.componentId;
    const oil1 = version.inputs.oils[0]!.componentId;
    const noCounts = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-20", entries: [] });
    await expectCode(layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: noCounts.batch.id } }), "invalid");

    const { batch } = await layer.batches.create({
      batchId: id(), versionId: version.id, producedOn: "2026-11-20", candlesMade: 12, sellable: 10,
      entries: [{ componentId: wax, actualMg: 1_630_500 }, { componentId: oil1, actualMg: 130_440 }],
      lots: [
        { part: "row", componentId: wax, lotId: waxLot.id },
        { part: "row", componentId: oil1, lotId: unpricedOilLot.id },
        { part: "wick", lotId: wickLot.id },
      ],
    });
    const { sheet } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id } });
    expect(sheet).toMatchObject({ basis: "batch", batchId: batch.id, versionId: version.id, candlesMade: 12, sellable: 10 });
    expect(sheet.materials[0]).toMatchObject({
      quantity: { unit: "mg", mg: 1_630_500, from: "measured" },
      price: { source: "lot", lotId: waxLot.id, lotCode: "SOY-DEMO-01", paidCentavos: 435_000, quantity: 20_000_000 },
    });
    // A lot without a purchase falls back to the material's price.
    expect(sheet.materials[1]).toMatchObject({ quantity: { mg: 130_440, from: "measured" }, price: { source: "material", unitCentavos: 185_000 } });
    // Not measured: the planned weight, said so.
    expect(sheet.materials[2]!.quantity).toMatchObject({ unit: "mg", from: "planned" });
    expect(sheet.materials[4]!.price).toMatchObject({ source: "lot", lotCode: "WICK-DEMO-7", quantity: 100 });

    // Prices and the batch change later; the saved sheet does not.
    await layer.materials.update(lib.oilIds[0], { type: "fragranceOil", name: "Lavender", defaultPriceCentavos: 1 });
    await layer.materialLots.update(waxLot.id, { materialId: lib.waxId, supplierId: null, code: "SOY-RENAMED", purchase: { paidCentavos: 1, quantity: 1 } });
    await layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [], candlesMade: 20, sellable: 20 });
    expect((await layer.costSheets.get(sheet.id))?.sheet).toEqual(sheet);
    // Counts given on the request win over the batch's.
    const { sheet: own } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id }, candlesMade: 5 });
    expect([own.candlesMade, own.sellable]).toEqual([5, 5]);
  });

  it("edits only what may change", async () => {
    const { layer } = setup();
    const { version } = await formulaWithLibrary(layer);
    const { sheet } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: version.id }, candlesMade: 6 });
    const before = await counterOf(layer);
    const typed = inputOf(sheet, {
      title: " Edited ",
      notes: " some notes ",
      sellable: 5,
      materials: sheet.materials.map((line) => ({
        key: line.key,
        ...(line.key === "wick" ? { perCandle: 2 } : {}),
        price: line.key === "vessel" ? { source: "sheet", unitCentavos: 4_000 } : line.price,
      })),
      items: [{ itemId: null, name: " Ribbon ", unitCentavos: 250, per: "batch", quantity: 3 }],
      labourHoursX100: 350,
      labourRateCentavos: 9_500,
      overhead: { mode: "percent", bp: 1_250 },
      testingCentavos: 15_000,
      pricesIncludeVat: true,
      wholesale: { mode: "margin", marginBp: 4_000 },
      retail: { mode: "price", priceCentavos: 45_000 },
    });
    const saved = await layer.costSheets.update(sheet.id, typed);
    expect(await counterOf(layer)).toBe(before + 1);
    expect(saved).toMatchObject({ title: "Edited", notes: "some notes", sellable: 5, labourHoursX100: 350, pricesIncludeVat: true, createdAt: sheet.createdAt });
    expect(saved.materials.find((l) => l.key === "wick")!.quantity).toEqual({ unit: "piece", perCandle: 2 });
    expect(saved.materials.find((l) => l.key === "vessel")!.price).toEqual({ source: "sheet", unitCentavos: 4_000 });
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]).toMatchObject({ itemId: null, name: "Ribbon", per: "batch", quantity: 3 });
    // A kept item line keeps its id.
    const kept = await layer.costSheets.update(sheet.id, inputOf(saved, { items: [{ ...saved.items[0]!, quantity: 4 }] }));
    expect(kept.items[0]!.id).toBe(saved.items[0]!.id);

    // Refused: a weight change, a line price other than typed/none, a missing or extra key,
    // an unknown item line id, an unknown list item, sellable above made, a 100% margin.
    const weightKey = rowKey(version, 0);
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, {
      materials: inputOf(kept).materials.map((l) => (l.key === weightKey ? { ...l, perCandle: 3 } : l)),
    })), "invalid");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, {
      materials: inputOf(kept).materials.map((l) => (l.key === weightKey ? { ...l, price: { source: "material", unitCentavos: 1 } } : l)),
    })), "invalid");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, { materials: inputOf(kept).materials.slice(1) })), "invalid");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, {
      materials: [...inputOf(kept).materials, { key: "row:extra", price: { source: "none" } }],
    })), "invalid");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, {
      items: [{ id: id(), itemId: null, name: "X", unitCentavos: 1, per: "batch", quantity: 1 }],
    })), "not-found");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, {
      items: [{ itemId: id(), name: "X", unitCentavos: 1, per: "batch", quantity: 1 }],
    })), "not-found");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, { sellable: 7 })), "invalid");
    await expectCode(layer.costSheets.update(sheet.id, inputOf(kept, { wholesale: { mode: "margin", marginBp: 10_000 } })), "invalid");
    await expectCode(layer.costSheets.update(id(), inputOf(kept)), "not-found");
    expect((await layer.costSheets.get(sheet.id))?.sheet).toEqual(kept);

    // No price is allowed; going back to the original snapshot price is "unchanged" only while it is stored.
    const none = await layer.costSheets.update(sheet.id, inputOf(kept, {
      materials: inputOf(kept).materials.map((l) => (l.key === "vessel" ? { ...l, price: { source: "none" } } : l)),
    }));
    expect(none.materials.find((l) => l.key === "vessel")!.price).toEqual({ source: "none" });
  });

  it("copy and update refreshes quantities, counts and prices, keeps typed prices, and links back", async () => {
    const { layer } = setup();
    const { lib, version } = await formulaWithLibrary(layer);
    await layer.materials.update(lib.waxId, { type: "wax", name: "Soy wax", defaultPriceCentavos: 18_000 });
    const box = await layer.costItems.create({ name: "Box", unitCentavos: 1_800 });
    const wax = version.inputs.waxes[0]!.componentId;
    const { batch } = await layer.batches.create({
      batchId: id(), versionId: version.id, producedOn: "2026-11-20", entries: [{ componentId: wax, actualMg: 1_000_000 }], candlesMade: 6, sellable: 6,
    });
    const { sheet } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id } });
    const edited = await layer.costSheets.update(sheet.id, inputOf(sheet, {
      materials: inputOf(sheet).materials.map((l) => (l.key === "vessel" ? { ...l, perCandle: 2, price: { source: "sheet", unitCentavos: 5_000 } } : l)),
      items: [
        { itemId: box.id, name: "Box", unitCentavos: 1_800, per: "sellable", quantity: 1 },
        { itemId: null, name: "Tape", unitCentavos: 100, per: "batch", quantity: 1 },
      ],
      labourHoursX100: 200,
      retail: { mode: "price", priceCentavos: 30_000 },
    }));

    // Things change after the first costing.
    await layer.materials.update(lib.waxId, { type: "wax", name: "Soy wax", defaultPriceCentavos: 20_000 });
    await layer.materials.update(lib.vesselId, { type: "vessel", name: "Tin 180", defaultPriceCentavos: 3_000 });
    await layer.costItems.update(box.id, { name: "Box", unitCentavos: 2_000 });
    await layer.batches.update(batch.id, { producedOn: "2026-11-20", entries: [{ componentId: wax, actualMg: 1_100_000 }], candlesMade: 7, sellable: 5 });

    const copyId = id();
    const before = await counterOf(layer);
    const { sheet: copy, created } = await layer.costSheets.copy({ sheetId: copyId, fromId: sheet.id });
    expect(created).toBe(true);
    expect(await counterOf(layer)).toBe(before + 1);
    expect(copy).toMatchObject({ id: copyId, copiedFromId: sheet.id, basis: "batch", batchId: batch.id, candlesMade: 7, sellable: 5, labourHoursX100: 200, retail: { mode: "price", priceCentavos: 30_000 } });
    expect(copy.materials[0]).toMatchObject({ quantity: { mg: 1_100_000, from: "measured" }, price: { source: "material", unitCentavos: 20_000 } });
    const vessel = copy.materials.find((l) => l.key === "vessel")!;
    expect(vessel).toMatchObject({ quantity: { perCandle: 2 }, price: { source: "sheet", unitCentavos: 5_000 } });
    expect(copy.items.map((l) => l.unitCentavos)).toEqual([2_000, 100]);
    // The original is untouched.
    expect((await layer.costSheets.get(sheet.id))?.sheet).toEqual(edited);
    expect((await layer.costSheets.get(copyId))?.copiedFrom?.id).toBe(sheet.id);
    // Idempotent.
    expect(await layer.costSheets.copy({ sheetId: copyId, fromId: sheet.id })).toEqual({ sheet: copy, created: false });
    // The copied-from sheet can be deleted; the copy then reads copiedFrom null.
    await layer.costSheets.delete(sheet.id);
    const detail = await layer.costSheets.get(copyId);
    expect(detail?.sheet.copiedFromId).toBe(sheet.id);
    expect(detail?.copiedFrom).toBeNull();
    await expectCode(layer.costSheets.copy({ sheetId: id(), fromId: sheet.id }), "not-found");
    await expectCode(layer.costSheets.delete(sheet.id), "not-found");
  });

  it("lists by formula and by batch, newest first, with their links", async () => {
    const { layer } = setup();
    const { version } = await formulaWithLibrary(layer);
    const { version: other } = await layer.versions.save(newFormulaRequest(we5Input(await makeLibrary(layer), { name: "Other" })));
    const { batch } = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-20", entries: [], candlesMade: 3 });
    const a = (await layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: version.id }, candlesMade: 1 })).sheet;
    const b = (await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id } })).sheet;
    const c = (await layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: other.id }, candlesMade: 1 })).sheet;
    expect((await layer.costSheets.list()).map((i) => i.sheet.id)).toEqual([c.id, b.id, a.id]);
    expect((await layer.costSheets.list({ formulaId: version.formulaId })).map((i) => i.sheet.id)).toEqual([b.id, a.id]);
    const byBatch = await layer.costSheets.list({ batchId: batch.id });
    expect(byBatch.map((i) => i.sheet.id)).toEqual([b.id]);
    expect(byBatch[0]).toMatchObject({ batch: { id: batch.id }, version: { id: version.id }, formula: { id: version.formulaId } });
    expect((await layer.costSheets.list()).find((i) => i.sheet.id === a.id)?.batch).toBeNull();
    expect(await layer.costSheets.get(id())).toBeUndefined();
  });

  it("refuses to delete a batch or formula a sheet is based on, until the sheet is deleted", async () => {
    const { layer } = setup();
    const { version } = await formulaWithLibrary(layer);
    const { batch } = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-20", entries: [], candlesMade: 3 });
    const batchSheet = (await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id } })).sheet;
    expect(await layer.batches.deletionImpact(batch.id)).toMatchObject({ costSheets: 1 });
    await expectCode(layer.batches.delete(batch.id), "in-use");
    await layer.costSheets.delete(batchSheet.id);
    expect(await layer.batches.deletionImpact(batch.id)).toMatchObject({ costSheets: 0 });
    await layer.batches.delete(batch.id);

    const versionSheet = (await layer.costSheets.create({ sheetId: id(), basis: { kind: "version", versionId: version.id }, candlesMade: 6 })).sheet;
    expect(await layer.formulas.deletionImpact(version.formulaId)).toMatchObject({ batches: 0, costSheets: 1 });
    await expectCode(layer.formulas.deletePermanently(version.formulaId), "in-use");
    expect(await layer.formulas.get(version.formulaId)).toBeDefined();
    await layer.costSheets.delete(versionSheet.id);
    await layer.formulas.deletePermanently(version.formulaId);
    expect(await layer.formulas.get(version.formulaId)).toBeUndefined();
  });
});

describe("WB-1 through the data layer", () => {
  /** WB-1's formula: one wax, two oils, a wick and a vessel, with WB-1's prices. */
  async function wb1(layer: DataLayer) {
    const lib: Library = await makeLibrary(layer);
    await layer.materials.update(lib.oilIds[0], { type: "fragranceOil", name: "Fragrance oil A", defaultPriceCentavos: 185_000 });
    await layer.materials.update(lib.vesselId, { type: "vessel", name: "Vessel", defaultPriceCentavos: 3_850 });
    const { version } = await layer.versions.save(
      newFormulaRequest(we5Input(lib, {
        oils: [
          { rowId: "row-o1", materialId: lib.oilIds[0], partsX100: 400 },
          { rowId: "row-o2", materialId: lib.oilIds[1], partsX100: 100 },
        ],
      })),
    );
    const supplier = await layer.suppliers.create({ name: "Demo Supplies" });
    const lot = (materialId: string, code: string, paidCentavos: number, quantity: number) =>
      layer.materialLots.create({ materialId, supplierId: supplier.id, code, purchase: { paidCentavos, quantity } });
    const waxLot = await lot(lib.waxId, "SOY-DEMO-01", 435_000, 20_000_000);
    const oilBLot = await lot(lib.oilIds[1], "FO-B-DEMO", 127_500, 500_000);
    const wickLot = await lot(lib.wickId, "WICK-DEMO-7", 45_000, 100);
    const [wax, oilA, oilB] = [version.inputs.waxes[0]!, version.inputs.oils[0]!, version.inputs.oils[1]!].map((c) => c.componentId);
    const { batch } = await layer.batches.create({
      batchId: id(), versionId: version.id, producedOn: "2026-11-26", label: "CL-2611-A", candlesMade: 12, sellable: 10,
      entries: [
        { componentId: wax!, actualMg: 1_630_500 },
        { componentId: oilA!, actualMg: 130_440 },
        { componentId: oilB!, actualMg: 32_610 },
      ],
      lots: [
        { part: "row", componentId: wax!, lotId: waxLot.id },
        { part: "row", componentId: oilB!, lotId: oilBLot.id },
        { part: "wick", lotId: wickLot.id },
      ],
    });
    return batch;
  }

  it("a batch sheet with WB-1's items, labour, overhead and scenarios reproduces WB-1 to the centavo", async () => {
    const { layer } = setup();
    const batch = await wb1(layer);
    const label = await layer.costItems.create({ name: "Label", unitCentavos: 675 });
    const box = await layer.costItems.create({ name: "Gift box", unitCentavos: 1_800 });
    const carton = await layer.costItems.create({ name: "Shipping carton", unitCentavos: 4_500 });
    const { sheet } = await layer.costSheets.create({ sheetId: id(), basis: { kind: "batch", batchId: batch.id } });
    expect(sheet.materials.map((l) => l.price.source)).toEqual(["lot", "material", "lot", "lot", "material"]);
    const saved = await layer.costSheets.update(sheet.id, inputOf(sheet, {
      items: [
        { itemId: label.id, name: "Label", unitCentavos: 675, per: "sellable", quantity: 1 },
        { itemId: box.id, name: "Gift box", unitCentavos: 1_800, per: "sellable", quantity: 1 },
        { itemId: carton.id, name: "Shipping carton", unitCentavos: 4_500, per: "batch", quantity: 1 },
      ],
      labourHoursX100: 350,
      labourRateCentavos: 9_500,
      overhead: { mode: "percent", bp: 1_250 },
      testingCentavos: 15_000,
      wholesale: { mode: "margin", marginBp: 4_000 },
      retail: { mode: "price", priceCentavos: 45_000 },
    }));
    const result = calculateCost(saved);
    expect(result.materialLines.map((l) => formatPeso(l.cost))).toEqual(["₱354.63", "₱241.31", "₱83.16", "₱54.00", "₱462.00"]);
    expect(formatPeso(result.materials)).toBe("₱1,195.10");
    expect(formatPeso(result.production)).toBe("₱1,763.55");
    expect(formatPeso(result.batchTotal)).toBe("₱2,161.05");
    expect(formatPeso(result.perSellable!)).toBe("₱216.11");
    expect(result.complete).toBe(true);
    if (!result.wholesale?.ok || !result.retail?.ok) throw new Error("scenarios not worked out");
    expect(formatPeso(result.wholesale.price)).toBe("₱360.18");
    expect(formatPeso(result.retail.profitPerCandle)).toBe("₱233.89");
  });
});
