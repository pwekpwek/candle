import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import { counterOf, id, makeLibrary, newFormulaRequest, setup, we5Input } from "./harness";

/** v0.3 lots and suppliers: docs/v0.3-lots.md. Example data is made up. */

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

/** A WE-5 formula (1 wax, 3 oils, wick, vessel) saved through the real version save. */
async function saved() {
  const ctx = setup();
  const lib = await makeLibrary(ctx.layer);
  const result = await ctx.layer.versions.save(newFormulaRequest(we5Input(lib)));
  return {
    ...ctx,
    lib,
    ...result,
    wax: result.version.inputs.waxes[0].componentId,
    o1: result.version.inputs.oils[0].componentId,
    o2: result.version.inputs.oils[1].componentId,
  };
}

describe("suppliers", () => {
  it("creates, trims, lists by name, edits, archives and bumps the counter once per write", async () => {
    const { layer } = setup();
    const before = await counterOf(layer);
    const b = await layer.suppliers.create({ name: "  Example Wax Co  ", notes: "  call first  " });
    const a = await layer.suppliers.create({ name: "another example supplier", notes: "   " });
    expect(b).toMatchObject({ name: "Example Wax Co", notes: "call first", archivedAt: null });
    expect("notes" in a).toBe(false);
    expect((await layer.suppliers.list()).map((s) => s.name)).toEqual([
      "another example supplier",
      "Example Wax Co",
    ]);

    const edited = await layer.suppliers.update(b.id, { name: "Example Wax Company" });
    expect(edited).toMatchObject({ id: b.id, name: "Example Wax Company", createdAt: b.createdAt });
    expect("notes" in edited).toBe(false);

    const archived = await layer.suppliers.setArchived(a.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect((await layer.suppliers.list()).map((s) => s.id)).toEqual([b.id]);
    expect((await layer.suppliers.list({ includeArchived: true })).length).toBe(2);
    expect(await counterOf(layer)).toBe(before + 4);
  });

  it("refuses a blank, too long or duplicate name (case-insensitive, archived included)", async () => {
    const { layer } = setup();
    const s = await layer.suppliers.create({ name: "Example Wax Co" });
    await layer.suppliers.setArchived(s.id, true);
    expect(await code(layer.suppliers.create({ name: "   " }))).toBe("invalid");
    expect(await code(layer.suppliers.create({ name: "x".repeat(81) }))).toBe("invalid");
    expect(await code(layer.suppliers.create({ name: " example WAX co " }))).toBe("invalid");
    const other = await layer.suppliers.create({ name: "Other Example" });
    expect(await code(layer.suppliers.update(other.id, { name: "EXAMPLE WAX CO" }))).toBe("invalid");
    // Renaming to its own name in another case is fine.
    expect((await layer.suppliers.update(other.id, { name: "other example" })).name).toBe("other example");
    expect(await code(layer.suppliers.update(id(), { name: "Nobody" }))).toBe("not-found");
  });

  it("deletes an unused supplier, refuses one a lot or a batch snapshot names", async () => {
    const { layer, version, wax, lib } = await saved();
    const unused = await layer.suppliers.create({ name: "Unused Example" });
    const used = await layer.suppliers.create({ name: "Used Example" });
    const moved = await layer.suppliers.create({ name: "Moved Example" });
    const lot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: moved.id, code: "LOT-TEST-001" });
    await layer.materialLots.create({ materialId: lib.waxId, supplierId: used.id, code: "LOT-TEST-002" });
    await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      entries: [],
      lots: [{ part: "row", componentId: wax, lotId: lot.id }],
    });
    // The lot moves to another supplier; the batch snapshot still names `moved`.
    await layer.materialLots.update(lot.id, { materialId: lib.waxId, supplierId: used.id, code: "LOT-TEST-001" });

    expect(await layer.suppliers.usage(used.id)).toEqual({ lots: 2, batches: 0 });
    expect(await layer.suppliers.usage(moved.id)).toEqual({ lots: 0, batches: 1 });
    const items = await layer.suppliers.listItems();
    expect(items.map((i) => [i.supplier.name, i.lotCount, i.batchCount])).toEqual([
      ["Moved Example", 0, 1],
      ["Unused Example", 0, 0],
      ["Used Example", 2, 0],
    ]);

    expect(await code(layer.suppliers.delete(used.id))).toBe("in-use");
    expect(await code(layer.suppliers.delete(moved.id))).toBe("in-use");
    const counter = await counterOf(layer);
    await layer.suppliers.delete(unused.id);
    expect(await layer.suppliers.get(unused.id)).toBeUndefined();
    expect(await counterOf(layer)).toBe(counter + 1);
    expect(await code(layer.suppliers.delete(unused.id))).toBe("not-found");
  });
});

describe("material lots", () => {
  it("creates a lot for a material, optionally with a supplier and a received date, and lists newest received first", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const supplier = await layer.suppliers.create({ name: "Example Wax Co" });
    const before = await counterOf(layer);
    const a = await layer.materialLots.create({
      materialId: lib.waxId,
      supplierId: supplier.id,
      code: "  LOT-TEST-001 ",
      receivedOn: "2026-10-01",
      notes: " first delivery ",
    });
    const b = await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "LOT-TEST-002", receivedOn: "" });
    const c = await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "LOT-TEST-003", receivedOn: "2026-11-01" });
    const oil = await layer.materialLots.create({ materialId: lib.oilIds[0], supplierId: null, code: "OIL-TEST-1" });
    expect(a).toMatchObject({ code: "LOT-TEST-001", receivedOn: "2026-10-01", notes: "first delivery", supplierId: supplier.id, archivedAt: null });
    expect("receivedOn" in b).toBe(false);
    expect(await counterOf(layer)).toBe(before + 4);

    expect((await layer.materialLots.list({ materialId: lib.waxId })).map((l) => l.id)).toEqual([c.id, a.id, b.id]);
    expect((await layer.materialLots.list({ supplierId: supplier.id })).map((l) => l.id)).toEqual([a.id]);
    expect((await layer.materialLots.list()).length).toBe(4);

    const items = await layer.materialLots.listItems();
    const itemA = items.find((i) => i.lot.id === a.id)!;
    expect(itemA.material?.id).toBe(lib.waxId);
    expect(itemA.supplier?.id).toBe(supplier.id);
    expect(itemA.batchCount).toBe(0);
    expect(items.find((i) => i.lot.id === oil.id)!.supplier).toBeNull();
  });

  it("refuses a missing or archived material or supplier, a bad code or date, and a duplicate code for the same material and supplier", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const s1 = await layer.suppliers.create({ name: "Example One" });
    const s2 = await layer.suppliers.create({ name: "Example Two" });
    const gone = await layer.suppliers.create({ name: "Example Archived" });
    await layer.suppliers.setArchived(gone.id, true);
    await layer.materials.setArchived(lib.oilIds[2], true);

    expect(await code(layer.materialLots.create({ materialId: id(), supplierId: null, code: "X" }))).toBe("not-found");
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: id(), code: "X" }))).toBe("not-found");
    expect(await code(layer.materialLots.create({ materialId: lib.oilIds[2], supplierId: null, code: "X" }))).toBe("invalid");
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: gone.id, code: "X" }))).toBe("invalid");
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "  " }))).toBe("invalid");
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "x".repeat(61) }))).toBe("invalid");
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "X", receivedOn: "2026-02-30" }))).toBe("invalid");
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "X", notes: "n".repeat(2001) }))).toBe("invalid");

    await layer.materialLots.create({ materialId: lib.waxId, supplierId: s1.id, code: "LOT-A" });
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: s1.id, code: " lot-a " }))).toBe("invalid");
    // Same code is fine from another supplier, without a supplier, or for another material.
    await layer.materialLots.create({ materialId: lib.waxId, supplierId: s2.id, code: "LOT-A" });
    await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "LOT-A" });
    await layer.materialLots.create({ materialId: lib.oilIds[0], supplierId: s1.id, code: "LOT-A" });
    expect(await code(layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "lot-a" }))).toBe("invalid");
  });

  it("edits a lot but never its material, keeps an archived stored supplier, and refuses a new archived one", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const s1 = await layer.suppliers.create({ name: "Example One" });
    const s2 = await layer.suppliers.create({ name: "Example Two" });
    const lot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: s1.id, code: "LOT-A" });
    await layer.suppliers.setArchived(s1.id, true);
    await layer.suppliers.setArchived(s2.id, true);

    const edited = await layer.materialLots.update(lot.id, {
      materialId: lib.waxId,
      supplierId: s1.id,
      code: "LOT-A2",
      receivedOn: "2026-09-09",
    });
    expect(edited).toMatchObject({ id: lot.id, code: "LOT-A2", supplierId: s1.id, receivedOn: "2026-09-09", createdAt: lot.createdAt });
    expect(await code(layer.materialLots.update(lot.id, { materialId: lib.waxId, supplierId: s2.id, code: "LOT-A2" }))).toBe("invalid");
    expect(await code(layer.materialLots.update(lot.id, { materialId: lib.oilIds[0], supplierId: s1.id, code: "LOT-A2" }))).toBe("invalid");
    expect(await code(layer.materialLots.update(id(), { materialId: lib.waxId, supplierId: null, code: "Z" }))).toBe("not-found");

    const archived = await layer.materialLots.setArchived(lot.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect(await layer.materialLots.list()).toEqual([]);
    expect((await layer.materialLots.setArchived(lot.id, false)).archivedAt).toBeNull();
  });

  it("deletes an unused lot and refuses one a batch links", async () => {
    const { layer, version, wax, lib } = await saved();
    const used = await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "LOT-USED" });
    const unused = await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "LOT-FREE" });
    await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      entries: [],
      lots: [{ part: "row", componentId: wax, lotId: used.id }],
    });
    expect(await layer.materialLots.usage(used.id)).toEqual({ batches: 1 });
    expect(await code(layer.materialLots.delete(used.id))).toBe("in-use");
    expect(await layer.materialLots.get(used.id)).toBeDefined();
    await layer.materialLots.delete(unused.id);
    expect(await layer.materialLots.get(unused.id)).toBeUndefined();
    expect(await code(layer.materialLots.delete(unused.id))).toBe("not-found");
  });
});

describe("lots on batches", () => {
  async function withLots() {
    const ctx = await saved();
    const { layer, lib } = ctx;
    const supplier = await layer.suppliers.create({ name: "Example Wax Co" });
    const waxLot1 = await layer.materialLots.create({ materialId: lib.waxId, supplierId: supplier.id, code: "WAX-TEST-1" });
    const waxLot2 = await layer.materialLots.create({ materialId: lib.waxId, supplierId: null, code: "WAX-TEST-2" });
    const oilLot = await layer.materialLots.create({ materialId: lib.oilIds[0], supplierId: supplier.id, code: "OIL-TEST-1" });
    const wickLot = await layer.materialLots.create({ materialId: lib.wickId, supplierId: null, code: "WICK-TEST-1" });
    const vesselLot = await layer.materialLots.create({ materialId: lib.vesselId, supplierId: null, code: "TIN-TEST-1" });
    return { ...ctx, supplier, waxLot1, waxLot2, oilLot, wickLot, vesselLot };
  }

  it("records lots per component with a snapshot, in the version's order, and one counter bump", async () => {
    const { layer, version, wax, o1, supplier, waxLot1, oilLot, wickLot, vesselLot } = await withLots();
    const counter = await counterOf(layer);
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      entries: [],
      lots: [
        { part: "vessel", lotId: vesselLot.id },
        { part: "wick", lotId: wickLot.id },
        { part: "row", componentId: o1, lotId: oilLot.id },
        { part: "row", componentId: wax, lotId: waxLot1.id },
      ],
    });
    expect(batch.lots).toEqual([
      { part: "row", componentId: wax, lotId: waxLot1.id, lotCode: "WAX-TEST-1", supplierId: supplier.id, supplierName: "Example Wax Co" },
      { part: "row", componentId: o1, lotId: oilLot.id, lotCode: "OIL-TEST-1", supplierId: supplier.id, supplierName: "Example Wax Co" },
      { part: "wick", lotId: wickLot.id, lotCode: "WICK-TEST-1", supplierId: null },
      { part: "vessel", lotId: vesselLot.id, lotCode: "TIN-TEST-1", supplierId: null },
    ]);
    expect(await counterOf(layer)).toBe(counter + 1);

    const plain = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [] });
    expect("lots" in plain.batch).toBe(false);
    const empty = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [], lots: [] });
    expect("lots" in empty.batch).toBe(false);
  });

  it("refuses a lot of another material, a component not in the version, two lots on one component, a missing or archived lot, and a malformed link", async () => {
    const { layer, db, version, wax, o1, o2, waxLot1, waxLot2, oilLot, wickLot } = await withLots();
    const create = (lots: Parameters<typeof layer.batches.create>[0]["lots"]) =>
      layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [], lots });
    expect(await code(create([{ part: "row", componentId: wax, lotId: oilLot.id }]))).toBe("invalid");
    expect(await code(create([{ part: "row", componentId: o2, lotId: oilLot.id }]))).toBe("invalid");
    expect(await code(create([{ part: "wick", lotId: waxLot1.id }]))).toBe("invalid");
    expect(await code(create([{ part: "row", componentId: "not-a-row", lotId: waxLot1.id }]))).toBe("invalid");
    expect(
      await code(create([
        { part: "row", componentId: wax, lotId: waxLot1.id },
        { part: "row", componentId: wax, lotId: waxLot2.id },
      ])),
    ).toBe("invalid");
    expect(await code(create([{ part: "row", componentId: wax, lotId: id() }]))).toBe("not-found");
    expect(await code(create([{ part: "row", lotId: waxLot1.id }]))).toBe("invalid");
    expect(await code(create([{ part: "wick", componentId: wax, lotId: wickLot.id }]))).toBe("invalid");
    await layer.materialLots.setArchived(waxLot2.id, true);
    expect(await code(create([{ part: "row", componentId: wax, lotId: waxLot2.id }]))).toBe("invalid");
    expect(await db.batches.count()).toBe(0);
    void o1;
  });

  it("a version without wick or vessel refuses those lots", async () => {
    const ctx = setup();
    const lib = await makeLibrary(ctx.layer);
    const { version } = await ctx.layer.versions.save(
      newFormulaRequest(we5Input(lib, { wickId: null, vesselId: null, sizing: { mode: "total", amountMg: 500000 } })),
    );
    const wickLot = await ctx.layer.materialLots.create({ materialId: lib.wickId, supplierId: null, code: "W" });
    expect(
      await code(
        ctx.layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-16", entries: [], lots: [{ part: "wick", lotId: wickLot.id }] }),
      ),
    ).toBe("invalid");
  });

  it("keeps snapshots when the lot or supplier is edited, keeps an archived linked lot on save, and takes a fresh snapshot for a changed lot", async () => {
    const { layer, version, wax, o1, supplier, waxLot1, waxLot2, oilLot } = await withLots();
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-16",
      entries: [],
      lots: [
        { part: "row", componentId: wax, lotId: waxLot1.id },
        { part: "row", componentId: o1, lotId: oilLot.id },
      ],
    });
    await layer.materialLots.update(waxLot1.id, { materialId: waxLot1.materialId, supplierId: null, code: "WAX-TEST-1-FIXED" });
    await layer.suppliers.update(supplier.id, { name: "Example Wax Company" });
    await layer.materialLots.setArchived(waxLot1.id, true);

    // Batch edits without `lots` keep the links exactly.
    const kept = await layer.batches.update(batch.id, { producedOn: "2026-11-15", entries: [], label: "LV-01" });
    expect(kept.lots).toEqual(batch.lots);

    // Sending the same lots again keeps the stored snapshots, archived lot included.
    const again = await layer.batches.update(batch.id, {
      producedOn: "2026-11-15",
      entries: [],
      lots: [
        { part: "row", componentId: wax, lotId: waxLot1.id },
        { part: "row", componentId: o1, lotId: oilLot.id },
      ],
    });
    expect(again.lots).toEqual(batch.lots);
    expect(again.lots![0]).toMatchObject({ lotCode: "WAX-TEST-1", supplierName: "Example Wax Co" });

    // Changing the wax lot takes a fresh snapshot; the oil link keeps its old supplier name.
    const changed = await layer.batches.update(batch.id, {
      producedOn: "2026-11-15",
      entries: [],
      lots: [
        { part: "row", componentId: o1, lotId: oilLot.id },
        { part: "row", componentId: wax, lotId: waxLot2.id },
      ],
    });
    expect(changed.lots).toEqual([
      { part: "row", componentId: wax, lotId: waxLot2.id, lotCode: "WAX-TEST-2", supplierId: null },
      { part: "row", componentId: o1, lotId: oilLot.id, lotCode: "OIL-TEST-1", supplierId: supplier.id, supplierName: "Example Wax Co" },
    ]);

    // Clearing the oil lot and re-linking it takes a fresh snapshot with the new name.
    await layer.batches.update(batch.id, { producedOn: "2026-11-15", entries: [], lots: [] });
    expect("lots" in (await layer.batches.get(batch.id))!.batch).toBe(false);
    const relinked = await layer.batches.update(batch.id, {
      producedOn: "2026-11-15",
      entries: [],
      lots: [{ part: "row", componentId: o1, lotId: oilLot.id }],
    });
    expect(relinked.lots![0]).toMatchObject({ supplierName: "Example Wax Company" });

    // An archived lot cannot be newly linked, even where it was before the clear.
    expect(
      await code(layer.batches.update(batch.id, { producedOn: "2026-11-15", entries: [], lots: [{ part: "row", componentId: wax, lotId: waxLot1.id }] })),
    ).toBe("invalid");
  });

  it("two batches from one formula keep their own lots and suppliers (acceptance)", async () => {
    const { layer, version, wax, supplier, waxLot1, waxLot2 } = await withLots();
    const other = await layer.suppliers.create({ name: "Second Example Supplier" });
    const waxLot3 = await layer.materialLots.create({ materialId: waxLot1.materialId, supplierId: other.id, code: "WAX-TEST-3" });
    const a = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-10", label: "A", entries: [], lots: [{ part: "row", componentId: wax, lotId: waxLot1.id }] });
    const b = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-11", label: "B", entries: [], lots: [{ part: "row", componentId: wax, lotId: waxLot3.id }] });
    await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-12", label: "C", entries: [], lots: [{ part: "row", componentId: wax, lotId: waxLot2.id }] });

    const trace = await layer.batchTrace.read();
    expect(trace.items.map((i) => i.batch.label)).toEqual(["C", "B", "A"]);
    const byLabel = new Map(trace.items.map((i) => [i.batch.label, i]));
    expect(byLabel.get("A")!.lots.map((l) => [l.link.lotCode, l.link.supplierName, l.supplier?.id])).toEqual([["WAX-TEST-1", "Example Wax Co", supplier.id]]);
    expect(byLabel.get("B")!.lots.map((l) => [l.link.lotCode, l.link.supplierName, l.supplier?.id])).toEqual([["WAX-TEST-3", "Second Example Supplier", other.id]]);
    expect(byLabel.get("C")!.lots[0].supplier).toBeNull();
    expect(a.batch.formulaId).toBe(b.batch.formulaId);
    expect(await layer.materialLots.usage(waxLot1.id)).toEqual({ batches: 1 });
  });
});

describe("batchTrace.read", () => {
  it("joins formula, version, cure plan, burn test count, and current lot and supplier; lists filter options", async () => {
    const { layer, version, formula, wax, lib } = await saved();
    const supplier = await layer.suppliers.create({ name: "Example Wax Co" });
    const lot = await layer.materialLots.create({ materialId: lib.waxId, supplierId: supplier.id, code: "WAX-TEST-1" });
    const { batch } = await layer.batches.create({
      batchId: id(),
      versionId: version.id,
      producedOn: "2026-11-10",
      entries: [],
      lots: [{ part: "row", componentId: wax, lotId: lot.id }],
    });
    const { batch: bare } = await layer.batches.create({ batchId: id(), versionId: version.id, producedOn: "2026-11-09", entries: [] });
    await layer.curePlans.save(batch.id, [{ kind: "cureEnd", offsetDays: 14 }]);
    await layer.burnSessions.create({
      sessionId: id(),
      batchId: batch.id,
      testedOn: "2026-11-12",
      milestoneId: null,
      candles: [{ label: "Candle 1", wick: { text: "Test wick" }, burns: [] }],
    });
    await layer.materialLots.update(lot.id, { materialId: lib.waxId, supplierId: supplier.id, code: "WAX-TEST-1B" });

    const trace = await layer.batchTrace.read();
    expect(trace.items.map((i) => i.batch.id)).toEqual([batch.id, bare.id]);
    const [first, second] = trace.items;
    expect(first).toMatchObject({ hasCurePlan: true, burnTestCount: 1 });
    expect(first.formula.id).toBe(formula.id);
    expect(first.version.id).toBe(version.id);
    expect(first.lots[0].link.lotCode).toBe("WAX-TEST-1");
    expect(first.lots[0].lot?.code).toBe("WAX-TEST-1B");
    expect(first.lots[0].supplier?.name).toBe("Example Wax Co");
    expect(second).toMatchObject({ hasCurePlan: false, burnTestCount: 0, lots: [] });
    expect(trace.formulas.map((f) => f.id)).toEqual([formula.id]);
    expect(trace.lots.map((l) => l.id)).toEqual([lot.id]);
    expect(trace.suppliers.map((s) => s.id)).toEqual([supplier.id]);
    expect(trace.materials.length).toBe(6);
  });
});
