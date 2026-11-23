import { MESSAGES } from "@/lib/messages";
import { isLocalDate } from "@/lib/schedule";
import {
  MAX_LOT_CODE_LENGTH,
  MAX_SUPPLIER_NAME_LENGTH,
  MAX_TRACE_NOTES_LENGTH,
} from "@/lib/types";
import type { MaterialLotInput, SupplierInput } from "@/lib/db";

const S = MESSAGES.suppliers;
const L = MESSAGES.lots;

/** The same comparison the data layer uses: trimmed and case-insensitive. */
export function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// ───────────────────────────── Suppliers ─────────────────────────────

export type SupplierValues = { name: string; notes: string };
export type SupplierFieldKey = "name" | "notes";
export type SupplierErrors = Partial<Record<SupplierFieldKey, string>>;
export const SUPPLIER_FIELD_ORDER: readonly SupplierFieldKey[] = ["name", "notes"];

/** Other suppliers (archived included) to compare a name against. */
export type SupplierContext = {
  suppliers: readonly { id: string; name: string }[];
  /** The supplier being edited, left out of the duplicate check. */
  editingId: string | null;
};

export function emptySupplierValues(): SupplierValues {
  return { name: "", notes: "" };
}

export function supplierValuesFrom(supplier: { name: string; notes?: string }): SupplierValues {
  return { name: supplier.name, notes: supplier.notes ?? "" };
}

export function validateSupplierField(
  values: SupplierValues,
  key: SupplierFieldKey,
  ctx: SupplierContext,
): string | undefined {
  if (key === "name") {
    const name = values.name.trim();
    if (name.length === 0) return S.nameRequired;
    if (name.length > MAX_SUPPLIER_NAME_LENGTH) return S.nameTooLong;
    const wanted = normalize(name);
    const clash = ctx.suppliers.some((s) => s.id !== ctx.editingId && normalize(s.name) === wanted);
    return clash ? S.nameDuplicate : undefined;
  }
  return values.notes.trim().length > MAX_TRACE_NOTES_LENGTH ? S.notesTooLong : undefined;
}

export function validateSupplier(values: SupplierValues, ctx: SupplierContext): SupplierErrors {
  const errors: SupplierErrors = {};
  for (const key of SUPPLIER_FIELD_ORDER) {
    const message = validateSupplierField(values, key, ctx);
    if (message) errors[key] = message;
  }
  return errors;
}

/** Call only after `validateSupplier` is clean. */
export function toSupplierInput(values: SupplierValues): SupplierInput {
  return { name: values.name, notes: values.notes };
}

// ─────────────────────────────── Lots ───────────────────────────────

/** `supplierId` is "" for no supplier (a select value). */
export type LotValues = {
  materialId: string;
  supplierId: string;
  code: string;
  receivedOn: string;
  notes: string;
};
export type LotFieldKey = "materialId" | "code" | "receivedOn" | "notes";
export type LotErrors = Partial<Record<LotFieldKey, string>>;
export const LOT_FIELD_ORDER: readonly LotFieldKey[] = ["materialId", "code", "receivedOn", "notes"];

export type LotContext = {
  /** Every lot (archived included) to compare a code against. */
  lots: readonly { id: string; materialId: string; supplierId: string | null; code: string }[];
  /** The lot being edited, left out of the duplicate check. */
  editingId: string | null;
  /** Device-local today, YYYY-MM-DD. */
  today: string;
};

export function emptyLotValues(materialId: string): LotValues {
  return { materialId, supplierId: "", code: "", receivedOn: "", notes: "" };
}

export function lotValuesFrom(lot: {
  materialId: string;
  supplierId: string | null;
  code: string;
  receivedOn?: string;
  notes?: string;
}): LotValues {
  return {
    materialId: lot.materialId,
    supplierId: lot.supplierId ?? "",
    code: lot.code,
    receivedOn: lot.receivedOn ?? "",
    notes: lot.notes ?? "",
  };
}

/**
 * The material filter's `?material=` value, applied only when it names a
 * material the page knows. Anything else means "all materials" (the empty string).
 */
export function materialFromParam(param: string | null, knownIds: readonly string[]): string {
  return param !== null && knownIds.includes(param) ? param : "";
}

export function validateLotField(
  values: LotValues,
  key: LotFieldKey,
  ctx: LotContext,
): string | undefined {
  switch (key) {
    case "materialId":
      return values.materialId === "" ? L.materialRequired : undefined;
    case "code": {
      const code = values.code.trim();
      if (code.length === 0) return L.codeRequired;
      if (code.length > MAX_LOT_CODE_LENGTH) return L.codeTooLong;
      const supplier = values.supplierId === "" ? null : values.supplierId;
      const wanted = normalize(code);
      const clash = ctx.lots.some(
        (lot) =>
          lot.id !== ctx.editingId &&
          lot.materialId === values.materialId &&
          lot.supplierId === supplier &&
          normalize(lot.code) === wanted,
      );
      return clash ? L.codeDuplicate : undefined;
    }
    case "receivedOn": {
      const date = values.receivedOn.trim();
      if (date === "") return undefined;
      if (!isLocalDate(date)) return L.receivedInvalid;
      return date > ctx.today ? L.receivedFuture : undefined;
    }
    case "notes":
      return values.notes.trim().length > MAX_TRACE_NOTES_LENGTH ? L.notesTooLong : undefined;
  }
}

export function validateLot(values: LotValues, ctx: LotContext): LotErrors {
  const errors: LotErrors = {};
  for (const key of LOT_FIELD_ORDER) {
    const message = validateLotField(values, key, ctx);
    if (message) errors[key] = message;
  }
  return errors;
}

/** Call only after `validateLot` is clean. */
export function toLotInput(values: LotValues): MaterialLotInput {
  const receivedOn = values.receivedOn.trim();
  return {
    materialId: values.materialId,
    supplierId: values.supplierId === "" ? null : values.supplierId,
    code: values.code,
    receivedOn: receivedOn === "" ? undefined : receivedOn,
    notes: values.notes,
  };
}
