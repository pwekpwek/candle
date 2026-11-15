import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { createDataLayer, DataError } from "@/lib/db";
import type { SaveVersionRequest } from "@/lib/db";
import { createMetaRepo } from "@/lib/db/meta";
import { createVersionsRepo } from "@/lib/db/versions";
import type { EditorFields } from "@/lib/gramguard/contract";
import {
  counterOf,
  id,
  makeClock,
  makeLibrary,
  newFormulaRequest,
  openTestDb,
  revisionRequest,
  setup,
  we5Input,
} from "./harness";

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(DataError);
    return (error as DataError).code;
  }
  return "no error";
}

const draftFields: EditorFields = {
  name: "draft",
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

async function snapshotRows(db: ReturnType<typeof setup>["db"]) {
  return JSON.stringify({
    formulas: await db.formulas.toArray(),
    versions: await db.formulaVersions.toArray(),
    drafts: await db.drafts.toArray(),
  });
}

describe("TEST-12 save, revise, write-once", () => {
  it("creates the formula and version 1 with the WE-5 targets", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const input = we5Input(lib, { notes: " note ", changeNote: "  " });
    const result = await layer.versions.save(newFormulaRequest(input));

    expect(result.created).toBe(true);
    expect(result.formula).toMatchObject({
      name: "Lavender Vanilla Cedar",
      latestVersionNumber: 1,
      archivedAt: null,
    });
    expect("notes" in result.formula).toBe(false);
    expect(result.formula.createdAt).toBe(result.formula.updatedAt);

    const v = result.version;
    expect(v).toMatchObject({
      number: 1,
      origin: "initial",
      parentVersionId: null,
      scale: null,
      calcVersion: 1,
    });
    expect("changeNote" in v).toBe(false);
    expect(v.inputs.notes).toBe("note");
    expect(v.targets.waxTotalMg).toBe(1000000);
    expect(v.targets.fragranceTotalMg).toBe(80000);
    expect(v.targets.totalMg).toBe(1080000);
    expect(v.targets.components.map((c) => c.targetMg)).toEqual([1000000, 40000, 26700, 13300]);
    const ids = [...v.inputs.waxes, ...v.inputs.oils].map((c) => c.componentId);
    expect(v.targets.components.map((c) => c.componentId)).toEqual(ids);
    expect(ids).not.toContain("row-wax");
    expect(v.inputs.waxes[0].snapshot).toEqual({
      type: "wax",
      name: "Soy wax",
      supplier: "Acme",
      wax: { maxFragranceBp: 1000, maxFragranceBasis: "wax" },
    });
    expect(v.inputs.wick?.snapshot).toEqual({
      type: "wick",
      name: "Wick A",
      wick: { size: "CD-8" },
    });
    expect(await layer.versions.get(v.id)).toEqual(v);
  });

  it("revising creates version 2 and leaves version 1 as it was", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const before = JSON.stringify(await db.formulaVersions.get(first.version.id));

    const second = await layer.versions.save(
      revisionRequest(
        first.formula.id,
        first.version.id,
        we5Input(lib, { name: "ignored", changeNote: " less oil ", fragranceBp: 600 }),
      ),
    );
    expect(second.version.number).toBe(2);
    expect(second.version.origin).toBe("revision");
    expect(second.version.parentVersionId).toBe(first.version.id);
    expect(second.version.changeNote).toBe("less oil");
    expect(second.formula).toMatchObject({
      name: "Lavender Vanilla Cedar",
      latestVersionNumber: 2,
      createdAt: first.formula.createdAt,
    });
    expect(second.formula.updatedAt > first.formula.updatedAt).toBe(true);
    expect(JSON.stringify(await db.formulaVersions.get(first.version.id))).toBe(before);

    const list = await layer.versions.listByFormula(first.formula.id);
    expect(list.map((x) => x.number)).toEqual([2, 1]);
    const old = new Set(first.version.inputs.oils.map((c) => c.componentId));
    expect(second.version.inputs.oils.some((c) => old.has(c.componentId))).toBe(false);
  });

  it("keeps formula notes and archived state when revising", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    await layer.formulas.updateDetails(first.formula.id, { name: "Renamed", notes: "keep" });
    const archived = await layer.formulas.setArchived(first.formula.id, true);
    const second = await layer.versions.save(
      revisionRequest(first.formula.id, first.version.id, we5Input(lib)),
    );
    expect(second.formula).toMatchObject({
      name: "Renamed",
      notes: "keep",
      archivedAt: archived.archivedAt,
    });
  });

  it("stores an unscented version with no oils", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const r = await layer.versions.save(
      newFormulaRequest(we5Input(lib, { fragranceBp: 0, oils: [], wickId: null, vesselId: null })),
    );
    expect(r.version.inputs.oils).toEqual([]);
    expect(r.version.inputs.wick).toBeNull();
    expect(r.version.targets.fragranceTotalMg).toBe(0);
  });
});

describe("TEST-13 snapshots", () => {
  it("does not change saved snapshots when the library changes; a revision picks the changes up", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const before = JSON.stringify(await db.formulaVersions.get(first.version.id));

    await layer.materials.update(lib.waxId, {
      type: "wax",
      name: "Soy wax v2",
      wax: { maxFragranceBp: 900, maxFragranceBasis: "total" },
    });
    await layer.materials.update(lib.oilIds[0], {
      type: "fragranceOil",
      name: "Lavender Fine",
      supplier: "S",
    });
    await layer.materials.setArchived(lib.oilIds[1], true);
    expect(JSON.stringify(await db.formulaVersions.get(first.version.id))).toBe(before);

    const second = await layer.versions.save(
      revisionRequest(first.formula.id, first.version.id, we5Input(lib)),
    );
    expect(second.version.inputs.waxes[0].snapshot).toEqual({
      type: "wax",
      name: "Soy wax v2",
      wax: { maxFragranceBp: 900, maxFragranceBasis: "total" },
    });
    expect(second.version.inputs.oils[0].snapshot).toEqual({
      type: "fragranceOil",
      name: "Lavender Fine",
      supplier: "S",
    });
    // Archived materials still count as existing.
    expect(second.version.inputs.oils[1].snapshot.name).toBe("Vanilla");
    expect(JSON.stringify(await db.formulaVersions.get(first.version.id))).toBe(before);
  });

  it("falls back to the parent's snapshot when a material left the library", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    for (const materialId of [lib.waxId, lib.oilIds[2], lib.wickId, lib.vesselId]) {
      await db.materials.delete(materialId);
    }
    const second = await layer.versions.save(
      revisionRequest(first.formula.id, first.version.id, we5Input(lib)),
    );
    expect(second.version.inputs.waxes[0].snapshot).toEqual(first.version.inputs.waxes[0].snapshot);
    expect(second.version.inputs.oils[2].snapshot).toEqual(first.version.inputs.oils[2].snapshot);
    expect(second.version.inputs.wick).toEqual(first.version.inputs.wick);
    expect(second.version.inputs.vessel).toEqual(first.version.inputs.vessel);
  });

  it("refuses a material found nowhere, and writes nothing", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const extra = await layer.materials.create({ type: "fragranceOil", name: "Extra" });
    await db.materials.delete(extra.id);
    const before = await snapshotRows(db);
    const counter = await counterOf(layer);

    const input = we5Input(lib);
    input.oils[0] = { ...input.oils[0], materialId: extra.id };
    expect(
      await code(layer.versions.save(revisionRequest(first.formula.id, first.version.id, input))),
    ).toBe("invalid");
    expect(await snapshotRows(db)).toBe(before);
    expect(await counterOf(layer)).toBe(counter);
  });

  it("refuses a material of the wrong type", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const bad = we5Input(lib, { waxes: [{ rowId: "r", materialId: lib.oilIds[0], partsX100: 100 }] });
    expect(await code(layer.versions.save(newFormulaRequest(bad)))).toBe("invalid");
    const badWick = we5Input(lib, { wickId: lib.vesselId });
    expect(await code(layer.versions.save(newFormulaRequest(badWick)))).toBe("invalid");
  });
});

describe("TEST-14 concurrent saves", () => {
  it("gives two saves started together consecutive numbers", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const [a, b] = await Promise.all([
      layer.versions.save(revisionRequest(first.formula.id, first.version.id, we5Input(lib))),
      layer.versions.save(revisionRequest(first.formula.id, first.version.id, we5Input(lib))),
    ]);
    expect([a.version.number, b.version.number].sort()).toEqual([2, 3]);
    expect((await db.formulas.get(first.formula.id))?.latestVersionNumber).toBe(3);
    expect((await layer.versions.listByFormula(first.formula.id)).map((v) => v.number)).toEqual([
      3, 2, 1,
    ]);
  });

  it("gives three at once consecutive numbers", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const results = await Promise.all(
      [0, 1, 2].map(() =>
        layer.versions.save(revisionRequest(first.formula.id, first.version.id, we5Input(lib))),
      ),
    );
    expect(results.map((r) => r.version.number).sort()).toEqual([2, 3, 4]);
    expect((await db.formulas.get(first.formula.id))?.latestVersionNumber).toBe(4);
    expect(await db.formulaVersions.where("formulaId").equals(first.formula.id).count()).toBe(4);
  });

  it("returns one version for two simultaneous saves with the same versionId", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const request = newFormulaRequest(we5Input(lib));
    const [a, b] = await Promise.all([layer.versions.save(request), layer.versions.save(request)]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(await db.formulaVersions.count()).toBe(1);
  });
});

describe("TEST-15 failed saves write nothing", () => {
  it("keeps rows, draft and counter untouched", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    await layer.drafts.put("new", null, draftFields);
    await layer.drafts.put(first.formula.id, first.version.id, draftFields);
    const before = await snapshotRows(db);
    const counter = await counterOf(layer);
    const fid = first.formula.id;
    const pid = first.version.id;

    const unknown = we5Input(lib);
    unknown.oils[1] = { ...unknown.oils[1], materialId: id() };
    const tooSmall = we5Input(lib, {
      sizing: { mode: "total", amountMg: 5000 },
      fragranceBp: 100,
      precisionMg: 1000,
    });
    const asNew = (r: SaveVersionRequest, expected: string): [SaveVersionRequest, string] => [
      { ...r, draftKey: "new" },
      expected,
    ];
    const asRevision = (o: Partial<SaveVersionRequest>, expected: string): [SaveVersionRequest, string] => [
      revisionRequest(fid, pid, we5Input(lib), { draftKey: fid, ...o }),
      expected,
    ];
    const cases: [SaveVersionRequest, string][] = [
      asNew(newFormulaRequest(unknown), "invalid"),
      asNew(newFormulaRequest(tooSmall), "calculation"),
      asNew(newFormulaRequest(we5Input(lib), { origin: "revision" }), "invalid"),
      asNew(newFormulaRequest(we5Input(lib), { parentVersionId: pid }), "invalid"),
      asNew(
        newFormulaRequest(we5Input(lib), { scale: { method: "multiplier", factorX10000: 20000 } }),
        "invalid",
      ),
      asNew(newFormulaRequest(we5Input(lib), { target: { kind: "new", formulaId: fid } }), "invalid"),
      asRevision({ origin: "initial" }, "invalid"),
      asRevision({ origin: "scaled" }, "invalid"),
      asRevision({ scale: { method: "amount", factorX10000: 1 } }, "invalid"),
      asRevision({ parentVersionId: null }, "invalid"),
      asRevision({ parentVersionId: id() }, "invalid"),
      [
        revisionRequest(id(), pid, we5Input(lib), { draftKey: fid }),
        "not-found",
      ],
    ];
    for (const [request, expected] of cases) {
      expect(await code(layer.versions.save(request))).toBe(expected);
    }
    expect(await snapshotRows(db)).toBe(before);
    expect(await counterOf(layer)).toBe(counter);
    expect(await layer.drafts.get("new")).toBeDefined();
    expect(await layer.drafts.get(fid)).toBeDefined();
  });

  it("refuses a parent that belongs to another formula", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const a = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const b = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const before = await snapshotRows(db);
    expect(
      await code(layer.versions.save(revisionRequest(a.formula.id, b.version.id, we5Input(lib)))),
    ).toBe("invalid");
    expect(await snapshotRows(db)).toBe(before);
  });

  it("refuses an unusable precision, writing nothing", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const before = await snapshotRows(db);
    const bad = we5Input(lib, { precisionMg: 7 as never });
    expect(["invalid", "calculation"]).toContain(await code(layer.versions.save(newFormulaRequest(bad))));
    expect(await snapshotRows(db)).toBe(before);
  });
});

describe("idempotency", () => {
  it("returns the existing version on a repeated versionId and writes nothing", async () => {
    const { layer, db } = setup();
    const lib = await makeLibrary(layer);
    const request = newFormulaRequest(we5Input(lib), { draftKey: "new" });
    const first = await layer.versions.save(request);
    const counter = await counterOf(layer);
    await layer.drafts.put("new", null, draftFields);
    const before = await snapshotRows(db);

    const again = await layer.versions.save(request);
    expect(again.created).toBe(false);
    expect(again.version).toEqual(first.version);
    expect(again.formula).toEqual(first.formula);
    expect(await db.formulaVersions.count()).toBe(1);
    expect(await counterOf(layer)).toBe(counter);
    expect(await snapshotRows(db)).toBe(before);
    expect(await layer.drafts.get("new")).toBeDefined();
  });

  it("bumps the change counter once per save", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const counter = await counterOf(layer);
    await layer.versions.save(newFormulaRequest(we5Input(lib)));
    expect(await counterOf(layer)).toBe(counter + 1);
  });
});

describe("scaled versions (DATA-10)", () => {
  it("stores the scale, the parent link, fresh ids and recomputed targets (WE-9a)", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib)));
    const scale = { method: "vesselCount" as const, factorX10000: 16667 };
    const scaled = await layer.versions.save(
      revisionRequest(
        first.formula.id,
        first.version.id,
        we5Input(lib, { sizing: { mode: "vessels", count: 10, fillMg: 180000 } }),
        { origin: "scaled", scale },
      ),
    );
    const v = scaled.version;
    expect(v).toMatchObject({ number: 2, origin: "scaled", scale, parentVersionId: first.version.id });
    expect(v.targets.waxTotalMg).toBe(1666700);
    expect(v.targets.components.map((c) => c.targetMg)).toEqual([1666700, 66700, 44400, 22200]);
    const old = new Set(
      [...first.version.inputs.waxes, ...first.version.inputs.oils].map((c) => c.componentId),
    );
    expect([...v.inputs.waxes, ...v.inputs.oils].some((c) => old.has(c.componentId))).toBe(false);
  });
});

describe("drafts and persistence", () => {
  it("deletes the new-formula draft and the formula draft on success", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    await layer.drafts.put("new", null, draftFields);
    const first = await layer.versions.save(newFormulaRequest(we5Input(lib), { draftKey: "new" }));
    expect(await layer.drafts.get("new")).toBeUndefined();

    await layer.drafts.put(first.formula.id, first.version.id, draftFields);
    await layer.versions.save(
      revisionRequest(first.formula.id, first.version.id, we5Input(lib), {
        draftKey: first.formula.id,
      }),
    );
    expect(await layer.drafts.get(first.formula.id)).toBeUndefined();
  });

  it("keeps drafts when draftKey is null", async () => {
    const { layer } = setup();
    const lib = await makeLibrary(layer);
    await layer.drafts.put("new", null, draftFields);
    await layer.versions.save(newFormulaRequest(we5Input(lib)));
    expect(await layer.drafts.get("new")).toBeDefined();
  });

  it("asks for persistence after a save, and a failure there does not fail the save", async () => {
    const db = openTestDb();
    const base = createDataLayer(db, { now: makeClock() });
    const lib = await makeLibrary(base);
    const requestPersistence = vi.fn().mockRejectedValue(new Error("boom"));
    const meta = { ...createMetaRepo(db), requestPersistence };
    const versions = createVersionsRepo(db, makeClock(), () => crypto.randomUUID(), meta);

    const request = newFormulaRequest(we5Input(lib));
    const result = await versions.save(request);
    expect(result.created).toBe(true);
    expect(requestPersistence).toHaveBeenCalledTimes(1);

    await versions.save(request); // repeat: nothing created, no new ask
    expect(requestPersistence).toHaveBeenCalledTimes(1);

    const throwsSync = vi.fn(() => {
      throw new Error("sync boom");
    });
    const versions2 = createVersionsRepo(db, makeClock(), () => crypto.randomUUID(), {
      ...meta,
      requestPersistence: throwsSync as never,
    });
    await expect(versions2.save(newFormulaRequest(we5Input(lib)))).resolves.toMatchObject({
      created: true,
    });
  });
});
