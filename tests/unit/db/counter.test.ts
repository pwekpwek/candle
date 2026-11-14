import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { EditorFields } from "@/lib/gramguard/contract";
import { counterOf, makeMeasurement, seedFormula, setup } from "./harness";

const fields: EditorFields = {
  name: "x",
  sizingMode: "total",
  amount: "",
  vesselCount: "",
  fillWeight: "",
  fragrancePct: "",
  basis: "wax",
  precisionMg: 100,
  waxes: [],
  oils: [],
  wickId: null,
  vesselId: null,
  notes: "",
  changeNote: "",
};

describe("change counter (DATA-13)", () => {
  it("adds 1 per material and formula write", async () => {
    const { layer, db } = setup();
    const seeded = await seedFormula(db, 1);
    expect(await counterOf(layer)).toBe(0);

    const m = await layer.materials.create({ type: "wax", name: "Soy" });
    expect(await counterOf(layer)).toBe(1);
    await layer.materials.update(m.id, { type: "wax", name: "Soy 2" });
    expect(await counterOf(layer)).toBe(2);
    await layer.materials.setArchived(m.id, true);
    expect(await counterOf(layer)).toBe(3);

    await layer.formulas.updateDetails(seeded.formula.id, { name: "New" });
    expect(await counterOf(layer)).toBe(4);
    await layer.formulas.setArchived(seeded.formula.id, true);
    expect(await counterOf(layer)).toBe(5);
    await layer.formulas.deletePermanently(seeded.formula.id);
    expect(await counterOf(layer)).toBe(6);
  });

  it("is unchanged by reads, drafts and meta writes", async () => {
    const { layer, db } = setup();
    const seeded = await seedFormula(db, 1);
    await db.measurements.add(makeMeasurement(seeded.formula.id, seeded.versions[0].id));
    await layer.materials.list();
    await layer.materials.get("x");
    await layer.materials.usageCounts();
    await layer.formulas.list();
    await layer.formulas.get(seeded.formula.id);
    await layer.formulas.deletionImpact(seeded.formula.id);
    await layer.drafts.put("new", null, fields);
    await layer.drafts.get("new");
    await layer.drafts.delete("new");
    await layer.meta.get();
    await layer.meta.setExampleOffered();
    await layer.meta.requestPersistence();
    expect(await counterOf(layer)).toBe(0);
  });

  it("is unchanged when a write fails validation or the record is missing", async () => {
    const { layer, db } = setup();
    const seeded = await seedFormula(db, 1);
    const m = await layer.materials.create({ type: "wax", name: "Soy" });
    expect(await counterOf(layer)).toBe(1);

    await expect(layer.materials.create({ type: "wax", name: "" })).rejects.toMatchObject({
      code: "invalid",
    });
    await expect(
      layer.materials.update(m.id, { type: "wick", name: "Soy" }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(layer.formulas.updateDetails(seeded.formula.id, { name: " " })).rejects.toMatchObject(
      { code: "invalid" },
    );
    await expect(layer.materials.setArchived(crypto.randomUUID(), true)).rejects.toMatchObject({
      code: "not-found",
    });
    expect(await counterOf(layer)).toBe(1);
  });
});
