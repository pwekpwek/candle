import { describe, expect, it } from "vitest";
import {
  emptyLotValues,
  lotValuesFrom,
  materialFromParam,
  toLotInput,
  toSupplierInput,
  validateLot,
  validateLotField,
  validateSupplier,
  type LotContext,
  type LotValues,
} from "@/components/lots/form-model";
import { supplierChoices } from "@/components/lots";
import { MESSAGES } from "@/lib/messages";
import type { Supplier } from "@/lib/types";

const L = MESSAGES.lots;
const S = MESSAGES.suppliers;

const ctx: LotContext = {
  lots: [{ id: "lot-1", materialId: "m1", supplierId: "s1", code: "LOT-TEST-001" }],
  editingId: null,
  today: "2026-11-20",
};

function values(extra: Partial<LotValues> = {}): LotValues {
  return { ...emptyLotValues("m1"), supplierId: "s1", code: "LOT-TEST-002", ...extra };
}

describe("supplier form model", () => {
  const others = [{ id: "a", name: "Example Supplier Co" }];

  it("requires a name and caps it at 80 characters", () => {
    expect(validateSupplier({ name: "   ", notes: "" }, { suppliers: others, editingId: null }).name).toBe(S.nameRequired);
    expect(validateSupplier({ name: "x".repeat(81), notes: "" }, { suppliers: others, editingId: null }).name).toBe(S.nameTooLong);
    expect(validateSupplier({ name: "x".repeat(80), notes: "" }, { suppliers: others, editingId: null })).toEqual({});
  });

  it("refuses a duplicate name, trimmed and case-insensitive, but not the supplier itself", () => {
    const dup = validateSupplier({ name: "  EXAMPLE supplier co ", notes: "" }, { suppliers: others, editingId: null });
    expect(dup.name).toBe(S.nameDuplicate);
    const own = validateSupplier({ name: "example supplier co", notes: "" }, { suppliers: others, editingId: "a" });
    expect(own).toEqual({});
  });

  it("caps notes at 2000 characters", () => {
    const c = { suppliers: [], editingId: null };
    expect(validateSupplier({ name: "A", notes: "n".repeat(2001) }, c).notes).toBe(S.notesTooLong);
    expect(validateSupplier({ name: "A", notes: "n".repeat(2000) }, c)).toEqual({});
  });

  it("sends the typed text for the data layer to trim", () => {
    expect(toSupplierInput({ name: " A ", notes: "" })).toEqual({ name: " A ", notes: "" });
  });
});

describe("lot form model", () => {
  it("requires a material and a code", () => {
    expect(validateLot(values({ materialId: "", code: "" }), ctx)).toEqual({
      materialId: L.materialRequired,
      code: L.codeRequired,
    });
  });

  it("caps the code at 60 characters after trimming", () => {
    expect(validateLotField(values({ code: "c".repeat(61) }), "code", ctx)).toBe(L.codeTooLong);
    expect(validateLotField(values({ code: `  ${"c".repeat(60)}  ` }), "code", ctx)).toBeUndefined();
  });

  it("refuses a duplicate code for the same material and supplier, ignoring case and spaces", () => {
    expect(validateLotField(values({ code: " lot-test-001 " }), "code", ctx)).toBe(L.codeDuplicate);
  });

  it("allows the same code under another supplier, no supplier or another material", () => {
    expect(validateLotField(values({ code: "LOT-TEST-001", supplierId: "s2" }), "code", ctx)).toBeUndefined();
    expect(validateLotField(values({ code: "LOT-TEST-001", supplierId: "" }), "code", ctx)).toBeUndefined();
    expect(validateLotField(values({ code: "LOT-TEST-001", materialId: "m2" }), "code", ctx)).toBeUndefined();
  });

  it("does not count the lot being edited as its own duplicate", () => {
    expect(
      validateLotField(values({ code: "LOT-TEST-001" }), "code", { ...ctx, editingId: "lot-1" }),
    ).toBeUndefined();
  });

  it("treats lots without a supplier as one group", () => {
    const c: LotContext = { ...ctx, lots: [{ id: "x", materialId: "m1", supplierId: null, code: "NS-1" }] };
    expect(validateLotField(values({ code: "ns-1", supplierId: "" }), "code", c)).toBe(L.codeDuplicate);
  });

  it("accepts a blank, past or current date and refuses a future or impossible one", () => {
    expect(validateLotField(values({ receivedOn: "" }), "receivedOn", ctx)).toBeUndefined();
    expect(validateLotField(values({ receivedOn: "2026-11-19" }), "receivedOn", ctx)).toBeUndefined();
    expect(validateLotField(values({ receivedOn: "2026-11-20" }), "receivedOn", ctx)).toBeUndefined();
    expect(validateLotField(values({ receivedOn: "2026-11-21" }), "receivedOn", ctx)).toBe(L.receivedFuture);
    expect(validateLotField(values({ receivedOn: "2026-02-30" }), "receivedOn", ctx)).toBe(L.receivedInvalid);
  });

  it("caps notes at 2000 characters", () => {
    expect(validateLotField(values({ notes: "n".repeat(2001) }), "notes", ctx)).toBe(L.notesTooLong);
  });

  it("maps form values to the repository input", () => {
    expect(toLotInput(values({ supplierId: "", receivedOn: "" }))).toEqual({
      materialId: "m1",
      supplierId: null,
      code: "LOT-TEST-002",
      receivedOn: undefined,
      notes: "",
    });
    expect(toLotInput(values({ receivedOn: "2026-11-01" })).receivedOn).toBe("2026-11-01");
  });

  it("round-trips a stored lot", () => {
    expect(
      lotValuesFrom({ materialId: "m1", supplierId: null, code: "A", receivedOn: "2026-11-01" }),
    ).toEqual({ materialId: "m1", supplierId: "", code: "A", receivedOn: "2026-11-01", notes: "" });
  });
});

describe("?material= preselect", () => {
  it("uses the id only when it names a known material", () => {
    expect(materialFromParam("m1", ["m1", "m2"])).toBe("m1");
    expect(materialFromParam("gone", ["m1", "m2"])).toBe("");
    expect(materialFromParam(null, ["m1"])).toBe("");
    expect(materialFromParam("", ["m1"])).toBe("");
  });
});

describe("supplier choices on a lot", () => {
  const make = (id: string, archivedAt: string | null): Supplier => ({
    id,
    name: `Supplier ${id}`,
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    archivedAt,
  });
  const all = [make("a", null), make("b", "2026-11-02T00:00:00.000Z"), make("c", "2026-11-02T00:00:00.000Z")];

  it("hides archived suppliers for a new choice", () => {
    expect(supplierChoices(all, null).map((s) => s.id)).toEqual(["a"]);
  });

  it("keeps the current supplier of a lot even when archived", () => {
    expect(supplierChoices(all, "b").map((s) => s.id)).toEqual(["a", "b"]);
  });
});
