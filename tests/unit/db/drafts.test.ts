import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createDataLayer } from "@/lib/db";
import type { EditorFields } from "@/lib/gramguard/contract";
import { counterOf, makeClock, openTestDb, setup, uniqueName } from "./harness";

const rawFields: EditorFields = {
  name: "  Half typed  ",
  sizingMode: "vessels",
  amount: "12,5kg",
  vesselCount: "six",
  fillWeight: "180 g ",
  fragrancePct: "8%%",
  basis: "total",
  precisionMg: 10,
  waxes: [{ rowId: "r1", materialId: null, parts: "abc" }],
  oils: [{ rowId: "r2", materialId: null, parts: "" }],
  wickId: null,
  vesselId: null,
  notes: "  line one\nline two  ",
  changeNote: "",
};

describe("drafts (TEST-16)", () => {
  it("round trips raw invalid text exactly", async () => {
    const { layer } = setup();
    const put = await layer.drafts.put("new", null, rawFields);
    expect(put.key).toBe("new");
    expect(put.baseVersionId).toBeNull();
    const got = await layer.drafts.get("new");
    expect(got).toEqual(put);
    expect(got?.fields).toEqual(rawFields);
  });

  it("returns undefined for a missing key", async () => {
    const { layer } = setup();
    expect(await layer.drafts.get("nope")).toBeUndefined();
  });

  it("survives a reload of the database", async () => {
    const name = uniqueName();
    const first = openTestDb(name);
    const layer1 = createDataLayer(first, { now: makeClock() });
    const baseVersionId = crypto.randomUUID();
    await layer1.drafts.put("formula-1", baseVersionId, rawFields);
    first.close();

    const second = openTestDb(name);
    const layer2 = createDataLayer(second);
    const got = await layer2.drafts.get("formula-1");
    expect(got?.baseVersionId).toBe(baseVersionId);
    expect(got?.fields).toEqual(rawFields);
  });

  it("is overwritten by a second put under the same key", async () => {
    const { layer, db } = setup();
    const first = await layer.drafts.put("new", null, rawFields);
    const second = await layer.drafts.put("new", "v1", { ...rawFields, name: "Second" });
    expect(second.updatedAt > first.updatedAt).toBe(true);
    expect(await db.drafts.count()).toBe(1);
    const got = await layer.drafts.get("new");
    expect(got?.fields.name).toBe("Second");
    expect(got?.baseVersionId).toBe("v1");
  });

  it("is removed by delete, and deleting a missing key is not an error", async () => {
    const { layer } = setup();
    await layer.drafts.put("new", null, rawFields);
    await layer.drafts.delete("new");
    expect(await layer.drafts.get("new")).toBeUndefined();
    await expect(layer.drafts.delete("new")).resolves.toBeUndefined();
    await expect(layer.drafts.delete("never-existed")).resolves.toBeUndefined();
  });

  it("does not count as a change", async () => {
    const { layer } = setup();
    await layer.drafts.put("new", null, rawFields);
    await layer.drafts.delete("new");
    expect(await counterOf(layer)).toBe(0);
  });
});
