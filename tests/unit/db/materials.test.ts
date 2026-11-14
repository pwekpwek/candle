import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import { counterOf, id, seedFormula, setup } from "./harness";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

describe("materials", () => {
  it("creates a material, trimming strings and omitting blank optionals", async () => {
    const { layer, db } = setup();
    const m = await layer.materials.create({
      type: "wick",
      name: "  CD 12  ",
      supplier: "   ",
      notes: " keep ",
      wick: { size: "  " },
    });
    expect(m.name).toBe("CD 12");
    expect(m.notes).toBe("keep");
    expect("supplier" in m).toBe(false);
    expect("wick" in m).toBe(false);
    expect(m.archivedAt).toBeNull();
    expect(m.createdAt).toBe(m.updatedAt);
    const stored = await db.materials.get(m.id);
    expect(stored).toEqual(m);
    expect(Object.keys(stored ?? {})).not.toContain("supplier");
  });

  it("keeps trimmed nested details and drops details of another type", async () => {
    const { layer } = setup();
    const wick = await layer.materials.create({
      type: "wick",
      name: "W",
      wick: { size: " 14 " },
      wax: { maxFragranceBp: 800 },
    });
    expect(wick.wick).toEqual({ size: "14" });
    expect("wax" in wick).toBe(false);

    const wax = await layer.materials.create({
      type: "wax",
      name: "Soy",
      wax: { maxFragranceBp: 1000, maxFragranceBasis: "wax" },
    });
    expect(wax.wax).toEqual({ maxFragranceBp: 1000, maxFragranceBasis: "wax" });

    const oil = await layer.materials.create({
      type: "fragranceOil",
      name: "Oil",
      wax: { maxFragranceBp: 800 },
    });
    expect("wax" in oil).toBe(false);

    const vessel = await layer.materials.create({
      type: "vessel",
      name: "Tin",
      vessel: { capacityMl: 200, defaultFillMg: 180000 },
    });
    expect(vessel.vessel).toEqual({ capacityMl: 200, defaultFillMg: 180000 });

    const emptyWax = await layer.materials.create({ type: "wax", name: "Plain", wax: {} });
    expect("wax" in emptyWax).toBe(false);
  });

  it("gets a material and returns undefined for an unknown id", async () => {
    const { layer } = setup();
    const m = await layer.materials.create({ type: "wax", name: "Soy" });
    expect(await layer.materials.get(m.id)).toEqual(m);
    expect(await layer.materials.get(id())).toBeUndefined();
  });

  it("lists by name case-insensitively, hides archived, filters by type", async () => {
    const { layer } = setup();
    const b = await layer.materials.create({ type: "wax", name: "banana wax" });
    const a = await layer.materials.create({ type: "fragranceOil", name: "Apple" });
    const c = await layer.materials.create({ type: "fragranceOil", name: "Cherry" });
    const z = await layer.materials.create({ type: "wick", name: "Zed" });
    await layer.materials.setArchived(c.id, true);

    expect((await layer.materials.list()).map((m) => m.id)).toEqual([a.id, b.id, z.id]);
    expect((await layer.materials.list({ includeArchived: true })).map((m) => m.id)).toEqual([
      a.id,
      b.id,
      c.id,
      z.id,
    ]);
    expect(
      (await layer.materials.list({ type: "fragranceOil", includeArchived: true })).map(
        (m) => m.id,
      ),
    ).toEqual([a.id, c.id]);
    expect((await layer.materials.list({ type: "fragranceOil" })).map((m) => m.id)).toEqual([a.id]);
  });

  it("updates editable fields and keeps id, type, createdAt, archivedAt", async () => {
    const { layer } = setup();
    const created = await layer.materials.create({
      type: "wax",
      name: "Soy",
      supplier: "A",
      wax: { maxFragranceBp: 800 },
    });
    const archived = await layer.materials.setArchived(created.id, true);
    const updated = await layer.materials.update(created.id, {
      type: "wax",
      name: " Soy 2 ",
      notes: "n",
    });
    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("Soy 2");
    expect(updated.notes).toBe("n");
    expect("supplier" in updated).toBe(false);
    expect("wax" in updated).toBe(false);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.archivedAt).toBe(archived.archivedAt);
    expect(updated.updatedAt > archived.updatedAt).toBe(true);
    expect(await layer.materials.get(created.id)).toEqual(updated);
  });

  it("refuses a type change and an unknown id", async () => {
    const { layer } = setup();
    const m = await layer.materials.create({ type: "wax", name: "Soy" });
    expect(await code(layer.materials.update(m.id, { type: "wick", name: "Soy" }))).toBe(
      "invalid",
    );
    expect((await layer.materials.get(m.id))?.type).toBe("wax");
    expect(await code(layer.materials.update(id(), { type: "wax", name: "X" }))).toBe(
      "not-found",
    );
    expect(await code(layer.materials.setArchived(id(), true))).toBe("not-found");
  });

  it("archives and unarchives", async () => {
    const { layer } = setup();
    const m = await layer.materials.create({ type: "wax", name: "Soy" });
    const archived = await layer.materials.setArchived(m.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt).toBe(archived.updatedAt);
    const back = await layer.materials.setArchived(m.id, false);
    expect(back.archivedAt).toBeNull();
    expect(back.updatedAt > archived.updatedAt).toBe(true);
  });

  it("refuses invalid input and writes nothing", async () => {
    const { layer, db } = setup();
    expect(await code(layer.materials.create({ type: "wax", name: "   " }))).toBe("invalid");
    expect(await code(layer.materials.create({ type: "wax", name: "x".repeat(81) }))).toBe(
      "invalid",
    );
    expect(
      await code(
        layer.materials.create({ type: "wax", name: "Soy", wax: { maxFragranceBp: 99999 } }),
      ),
    ).toBe("invalid");
    expect(
      await code(layer.materials.create({ type: "vessel", name: "V", vessel: { capacityMl: -1 } })),
    ).toBe("invalid");
    expect(await db.materials.count()).toBe(0);
    expect(await counterOf(layer)).toBe(0);
  });

  describe("usageCounts", () => {
    it("counts distinct formulas across wax, oil, wick and vessel links", async () => {
      const { layer, db } = setup();
      const wax = id();
      const oil = id();
      const wick = id();
      const vessel = id();
      const unused = await layer.materials.create({ type: "wax", name: "Unused" });

      // Formula 1 has three versions that all use the same wax and oil.
      await seedFormula(db, 3, { waxId: wax, oilId: oil });
      // Formula 2 uses the wax, a wick and a vessel.
      await seedFormula(db, 1, { waxId: wax, wickId: wick, vesselId: vessel });
      // Formula 3 uses only the wick.
      await seedFormula(db, 2, { wickId: wick });

      const counts = await layer.materials.usageCounts();
      expect(counts.get(wax)).toBe(2);
      expect(counts.get(oil)).toBe(1);
      expect(counts.get(wick)).toBe(2);
      expect(counts.get(vessel)).toBe(1);
      expect(counts.has(unused.id)).toBe(false);
    });

    it("is empty when nothing is saved", async () => {
      const { layer } = setup();
      expect((await layer.materials.usageCounts()).size).toBe(0);
    });
  });
});
