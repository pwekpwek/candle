import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { DataError } from "@/lib/db";
import type { EditorFields } from "@/lib/gramguard/contract";
import { counterOf, id, makeMeasurement, seedFormula, setup } from "./harness";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

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

describe("formulas", () => {
  it("lists newest updatedAt first, each with its latest version", async () => {
    const { layer, db } = setup();
    const old = await seedFormula(db, 2, {}, { name: "Old", updatedAt: "2026-11-01T00:00:00.000Z" });
    const mid = await seedFormula(
      db,
      1,
      {},
      { name: "Mid", updatedAt: "2026-11-05T00:00:00.000Z", archivedAt: "2026-11-06T00:00:00.000Z" },
    );
    const fresh = await seedFormula(db, 3, {}, { name: "Fresh", updatedAt: "2026-11-09T00:00:00.000Z" });

    const items = await layer.formulas.list();
    expect(items.map((i) => i.formula.name)).toEqual(["Fresh", "Mid", "Old"]);
    expect(items[0].latestVersion.id).toBe(fresh.versions[2].id);
    expect(items[0].latestVersion.number).toBe(3);
    expect(items[1].latestVersion.id).toBe(mid.versions[0].id);
    expect(items[2].latestVersion.id).toBe(old.versions[1].id);
  });

  it("leaves out a formula whose latest version row is missing", async () => {
    const { layer, db } = setup();
    const ok = await seedFormula(db, 1);
    const broken = await seedFormula(db, 1);
    await db.formulas.update(broken.formula.id, { latestVersionNumber: 2 });
    expect((await layer.formulas.list()).map((i) => i.formula.id)).toEqual([ok.formula.id]);
  });

  it("gets a formula", async () => {
    const { layer, db } = setup();
    const { formula } = await seedFormula(db, 1);
    expect(await layer.formulas.get(formula.id)).toEqual(formula);
    expect(await layer.formulas.get(id())).toBeUndefined();
  });

  it("updates details without creating a version", async () => {
    const { layer, db } = setup();
    const { formula } = await seedFormula(db, 2, {}, { notes: "old notes" });
    const updated = await layer.formulas.updateDetails(formula.id, {
      name: "  Renamed  ",
      notes: " new ",
    });
    expect(updated.name).toBe("Renamed");
    expect(updated.notes).toBe("new");
    expect(updated.updatedAt > formula.updatedAt).toBe(true);
    expect(updated.latestVersionNumber).toBe(2);
    expect(await db.formulaVersions.count()).toBe(2);
  });

  it("removes the notes key when notes are blank or missing", async () => {
    const { layer, db } = setup();
    const { formula } = await seedFormula(db, 1, {}, { notes: "old notes" });
    const blank = await layer.formulas.updateDetails(formula.id, { name: "A", notes: "   " });
    expect("notes" in blank).toBe(false);
    expect("notes" in ((await db.formulas.get(formula.id)) ?? {})).toBe(false);
    const again = await layer.formulas.updateDetails(formula.id, { name: "B" });
    expect("notes" in again).toBe(false);
  });

  it("refuses names that break V-02 and unknown ids", async () => {
    const { layer, db } = setup();
    const { formula } = await seedFormula(db, 1);
    expect(await code(layer.formulas.updateDetails(formula.id, { name: "   " }))).toBe("invalid");
    expect(await code(layer.formulas.updateDetails(formula.id, { name: "n".repeat(81) }))).toBe(
      "invalid",
    );
    expect((await db.formulas.get(formula.id))?.name).toBe(formula.name);
    expect(await code(layer.formulas.updateDetails(id(), { name: "ok" }))).toBe("not-found");
    expect(await counterOf(layer)).toBe(0);
    // 80 characters after trimming is fine.
    const ok = await layer.formulas.updateDetails(formula.id, { name: ` ${"n".repeat(80)} ` });
    expect(ok.name).toHaveLength(80);
  });

  it("archives and unarchives", async () => {
    const { layer, db } = setup();
    const { formula } = await seedFormula(db, 1);
    const archived = await layer.formulas.setArchived(formula.id, true);
    expect(archived.archivedAt).not.toBeNull();
    expect(archived.archivedAt).toBe(archived.updatedAt);
    const back = await layer.formulas.setArchived(formula.id, false);
    expect(back.archivedAt).toBeNull();
    expect(await code(layer.formulas.setArchived(id(), true))).toBe("not-found");
  });

  it("reports deletion impact", async () => {
    const { layer, db } = setup();
    const { formula, versions } = await seedFormula(db, 3);
    await db.measurements.bulkAdd([
      makeMeasurement(formula.id, versions[0].id),
      makeMeasurement(formula.id, versions[1].id),
    ]);
    expect(await layer.formulas.deletionImpact(formula.id)).toEqual({
      versions: 3,
      measurements: 2,
      batches: 0,
      productionPlans: 0,
      costSheets: 0,
    });
    expect(await layer.formulas.deletionImpact(id())).toEqual({
      versions: 0,
      measurements: 0,
      batches: 0,
      productionPlans: 0,
      costSheets: 0,
    });
  });

  it("deletes formula, versions, measurements and draft together, leaving others alone", async () => {
    const { layer, db } = setup();
    const target = await seedFormula(db, 2);
    const other = await seedFormula(db, 2);
    await db.measurements.bulkAdd([
      makeMeasurement(target.formula.id, target.versions[0].id),
      makeMeasurement(other.formula.id, other.versions[0].id),
    ]);
    await layer.drafts.put(target.formula.id, target.versions[1].id, fields);
    await layer.drafts.put(other.formula.id, other.versions[1].id, fields);
    await layer.drafts.put("new", null, fields);
    const before = await counterOf(layer);

    await layer.formulas.deletePermanently(target.formula.id);

    expect(await db.formulas.get(target.formula.id)).toBeUndefined();
    expect(await db.formulaVersions.where("formulaId").equals(target.formula.id).count()).toBe(0);
    expect(await db.measurements.where("formulaId").equals(target.formula.id).count()).toBe(0);
    expect(await layer.drafts.get(target.formula.id)).toBeUndefined();

    expect(await db.formulas.get(other.formula.id)).toEqual(other.formula);
    expect(await db.formulaVersions.where("formulaId").equals(other.formula.id).count()).toBe(2);
    expect(await db.measurements.where("formulaId").equals(other.formula.id).count()).toBe(1);
    expect(await layer.drafts.get(other.formula.id)).toBeDefined();
    expect(await layer.drafts.get("new")).toBeDefined();
    expect(await counterOf(layer)).toBe(before + 1);
  });

  it("throws not-found when deleting a missing formula and changes nothing", async () => {
    const { layer, db } = setup();
    await seedFormula(db, 1);
    expect(await code(layer.formulas.deletePermanently(id()))).toBe("not-found");
    expect(await db.formulas.count()).toBe(1);
    expect(await counterOf(layer)).toBe(0);
  });
});
