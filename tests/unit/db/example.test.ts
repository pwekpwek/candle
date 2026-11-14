import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { counterOf, setup } from "./harness";

function rowIds() {
  let n = 0;
  return () => `row-${++n}`;
}

describe("example.prepare", () => {
  it("creates the four materials once and returns the WE-5 fields", async () => {
    const { layer } = setup();
    const fields = await layer.example.prepare(rowIds());

    const all = await layer.materials.list();
    expect(all.map((m) => m.name)).toEqual([
      "Cedarwood (example)",
      "Lavender (example)",
      "Soy wax (example)",
      "Vanilla (example)",
    ]);
    const byName = new Map(all.map((m) => [m.name, m]));
    expect(byName.get("Soy wax (example)")?.type).toBe("wax");
    expect(byName.get("Lavender (example)")?.type).toBe("fragranceOil");

    expect(fields).toEqual({
      name: "Lavender Vanilla Cedar (example)",
      sizingMode: "vessels",
      amount: "",
      vesselCount: "6",
      fillWeight: "180",
      fragrancePct: "8",
      basis: "wax",
      precisionMg: 100,
      waxes: [{ rowId: "row-1", materialId: byName.get("Soy wax (example)")?.id, parts: "" }],
      oils: [
        { rowId: "row-2", materialId: byName.get("Lavender (example)")?.id, parts: "3" },
        { rowId: "row-3", materialId: byName.get("Vanilla (example)")?.id, parts: "2" },
        { rowId: "row-4", materialId: byName.get("Cedarwood (example)")?.id, parts: "1" },
      ],
      wickId: null,
      vesselId: null,
      notes: "",
      changeNote: "",
    });
    expect((await layer.meta.get()).exampleOffered).toBe(true);
    expect(await counterOf(layer)).toBe(1);
  });

  it("reuses the materials the second time", async () => {
    const { layer, db } = setup();
    const first = await layer.example.prepare(rowIds());
    const counterAfterFirst = await counterOf(layer);
    const second = await layer.example.prepare(rowIds());
    expect(await db.materials.count()).toBe(4);
    expect(second.waxes[0].materialId).toBe(first.waxes[0].materialId);
    expect(second.oils.map((o) => o.materialId)).toEqual(first.oils.map((o) => o.materialId));
    expect(await counterOf(layer)).toBe(counterAfterFirst);
  });

  it("reuses an existing unarchived namesake of the right type", async () => {
    const { layer, db } = setup();
    const mine = await layer.materials.create({ type: "fragranceOil", name: "Lavender (example)" });
    const fields = await layer.example.prepare(rowIds());
    expect(fields.oils[0].materialId).toBe(mine.id);
    expect(await db.materials.count()).toBe(4);
  });

  it("does not reuse an archived namesake or one of the wrong type", async () => {
    const { layer, db } = setup();
    const archived = await layer.materials.create({ type: "wax", name: "Soy wax (example)" });
    await layer.materials.setArchived(archived.id, true);
    const wrongType = await layer.materials.create({ type: "wick", name: "Vanilla (example)" });
    const fields = await layer.example.prepare(rowIds());
    expect(fields.waxes[0].materialId).not.toBe(archived.id);
    expect(fields.oils[1].materialId).not.toBe(wrongType.id);
    expect(await db.materials.count()).toBe(2 + 4);
  });
});
