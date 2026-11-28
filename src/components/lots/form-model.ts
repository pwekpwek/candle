import { moneyToInput, parseMoneyField } from "@/components/cost-items/money";
import { LIMITS, formatMinimalGrams, parseFixed } from "@/lib/gramguard";
import { formatUnitPrice, fraction, parseWholeNumber } from "@/lib/cost";
import { MESSAGES } from "@/lib/messages";
import { isLocalDate } from "@/lib/schedule";
import {
  MAX_LOT_CODE_LENGTH,
  MAX_LOT_PIECES,
  MAX_SUPPLIER_NAME_LENGTH,
  MAX_TRACE_NOTES_LENGTH,
} from "@/lib/types";
import { priceUnitOf, type LotPurchase, type MaterialType } from "@/lib/types";
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
  /** Amount paid in pesos, as typed. Blank with a blank quantity means no purchase recorded. */
  paid: string;
  /** Quantity received as typed: kg or g (see `unit`) for wax and oil, pieces for wicks and vessels. */
  quantity: string;
  /** The unit of a weight quantity. Ignored for pieces. */
  unit: "kg" | "g";
};
export type LotFieldKey = "materialId" | "code" | "receivedOn" | "paid" | "quantity" | "notes";
export type LotErrors = Partial<Record<LotFieldKey, string>>;
export const LOT_FIELD_ORDER: readonly LotFieldKey[] = [
  "materialId",
  "code",
  "receivedOn",
  "paid",
  "quantity",
  "notes",
];

export type LotContext = {
  /** Every lot (archived included) to compare a code against. */
  lots: readonly { id: string; materialId: string; supplierId: string | null; code: string }[];
  /** The lot being edited, left out of the duplicate check. */
  editingId: string | null;
  /** Device-local today, YYYY-MM-DD. */
  today: string;
  /** Material id to type, to know whether the quantity is a weight or pieces. Unknown means a weight. */
  materialTypes?: Readonly<Record<string, MaterialType>>;
};

/** Pieces for wicks and vessels, a weight otherwise (also before a material is chosen). */
export function quantityKindOf(materialId: string, ctx?: Pick<LotContext, "materialTypes">): "piece" | "weight" {
  const type = ctx?.materialTypes?.[materialId];
  return type !== undefined && priceUnitOf(type) === "piece" ? "piece" : "weight";
}

export function emptyLotValues(materialId: string): LotValues {
  return {
    materialId,
    supplierId: "",
    code: "",
    receivedOn: "",
    notes: "",
    paid: "",
    quantity: "",
    unit: "kg",
  };
}

/** A stored purchase back into the text fields: whole kg when it divides exactly, else grams. */
function purchaseText(
  purchase: LotPurchase | undefined,
  materialType: MaterialType | undefined,
): Pick<LotValues, "paid" | "quantity" | "unit"> {
  if (!purchase) return { paid: "", quantity: "", unit: "kg" };
  const paid = moneyToInput(purchase.paidCentavos);
  if (materialType !== undefined && priceUnitOf(materialType) === "piece") {
    return { paid, quantity: String(purchase.quantity), unit: "kg" };
  }
  if (purchase.quantity % 1_000_000 === 0) {
    return { paid, quantity: String(purchase.quantity / 1_000_000), unit: "kg" };
  }
  return { paid, quantity: formatMinimalGrams(purchase.quantity), unit: "g" };
}

export function lotValuesFrom(lot: {
  materialId: string;
  supplierId: string | null;
  code: string;
  receivedOn?: string;
  notes?: string;
  purchase?: LotPurchase;
}, materialType?: MaterialType): LotValues {
  const purchase = purchaseText(lot.purchase, materialType);
  return {
    ...purchase,
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
    case "paid": {
      const paid = parsePaid(values.paid);
      if (paid.error) return paid.error;
      if (paid.blank && values.quantity.trim() !== "") return L.paidMissing;
      return undefined;
    }
    case "quantity": {
      const quantity = parseQuantity(values, ctx);
      if (quantity.error) return quantity.error;
      if (quantity.blank && values.paid.trim() !== "") return L.quantityMissing;
      return undefined;
    }
    case "notes":
      return values.notes.trim().length > MAX_TRACE_NOTES_LENGTH ? L.notesTooLong : undefined;
  }
}

const parsePaid = (text: string) =>
  parseMoneyField(text, { invalid: L.paidInvalid, decimals: L.paidDecimals, range: L.paidRange });

/** The quantity in milligrams (weights) or pieces. Kilograms and grams are exact through parseFixed. */
function parseQuantity(
  values: LotValues,
  ctx?: Pick<LotContext, "materialTypes">,
): { value?: number; error?: string; blank?: true } {
  if (values.quantity.trim() === "") return { blank: true };
  if (quantityKindOf(values.materialId, ctx) === "piece") {
    const pieces = parseWholeNumber(values.quantity, 1, MAX_LOT_PIECES);
    return pieces.ok ? { value: pieces.value } : { error: L.quantityPiecesInvalid };
  }
  const kg = values.unit === "kg";
  const parsed = parseFixed(values.quantity, kg ? 6 : 3);
  if (!parsed.ok) {
    if (parsed.reason === "format") return { error: L.quantityInvalid };
    if (parsed.reason === "tooManyDecimals") return { error: kg ? L.quantityKgDecimals : L.quantityGDecimals };
    return { error: L.quantityRange };
  }
  if (parsed.value < 1 || parsed.value > LIMITS.maxWeightMg) return { error: L.quantityRange };
  return { value: parsed.value };
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
export function toLotInput(values: LotValues, ctx?: Pick<LotContext, "materialTypes">): MaterialLotInput {
  const receivedOn = values.receivedOn.trim();
  const paid = parsePaid(values.paid).value;
  const quantity = parseQuantity(values, ctx).value;
  return {
    ...(paid !== undefined && quantity !== undefined
      ? { purchase: { paidCentavos: paid, quantity } }
      : {}),
    materialId: values.materialId,
    supplierId: values.supplierId === "" ? null : values.supplierId,
    code: values.code,
    receivedOn: receivedOn === "" ? undefined : receivedOn,
    notes: values.notes,
  };
}

/**
 * The lot's price per kg or each as shown ("₱217.50 per kg"), or null when no
 * purchase is recorded or the material is unknown. Built from integers: the
 * amount paid in centavos over the quantity, scaled to a kilogram for weights.
 */
export function lotPriceText(
  purchase: LotPurchase | undefined,
  materialType: MaterialType | undefined,
): string | null {
  if (!purchase || materialType === undefined || purchase.quantity < 1) return null;
  const paid = BigInt(purchase.paidCentavos);
  if (priceUnitOf(materialType) === "piece") {
    return formatUnitPrice(fraction(paid, BigInt(purchase.quantity)), "piece");
  }
  return formatUnitPrice(fraction(paid * BigInt(1_000_000), BigInt(purchase.quantity)), "kg");
}
