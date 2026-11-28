import { LIMITS, formatMinimalGrams, formatRequestedPercent, parseFixed } from "@/lib/gramguard";
import { MESSAGES, messageForIssue } from "@/lib/messages";
import { moneyToInput, parseMoneyField } from "@/components/cost-items/money";
import type { MaterialInput } from "@/lib/db";
import type { Basis, Material, MaterialType } from "@/lib/types";

/** Every editable field as the maker typed it. Numbers stay text until saved. */
export type FormValues = {
  type: MaterialType;
  name: string;
  supplier: string;
  notes: string;
  maxFragrance: string;
  basis: Basis;
  wickSize: string;
  capacity: string;
  defaultFill: string;
  /** Default price in pesos as typed. Blank means no price. */
  price: string;
};

export type FieldKey =
  | "name"
  | "supplier"
  | "notes"
  | "maxFragrance"
  | "wickSize"
  | "capacity"
  | "defaultFill"
  | "price";

export type FormErrors = Partial<Record<FieldKey, string>>;

/** Top-to-bottom order of the fields, for focusing the first problem. */
export const FIELD_ORDER: readonly FieldKey[] = [
  "name",
  "supplier",
  "maxFragrance",
  "wickSize",
  "capacity",
  "defaultFill",
  "price",
  "notes",
];

const M = MESSAGES.materials;

const V01 = messageForIssue({ rule: "V-01", field: "material", severity: "error" });

export function emptyValues(type: MaterialType): FormValues {
  return {
    type,
    name: "",
    supplier: "",
    notes: "",
    maxFragrance: "",
    basis: "wax",
    wickSize: "",
    capacity: "",
    defaultFill: "",
    price: "",
  };
}

/** Stored values back into text, through the engine's formatters. */
export function valuesFromMaterial(material: Material): FormValues {
  const values = emptyValues(material.type);
  values.name = material.name;
  values.supplier = material.supplier ?? "";
  values.notes = material.notes ?? "";
  if (material.wax?.maxFragranceBp !== undefined) {
    values.maxFragrance = formatRequestedPercent(material.wax.maxFragranceBp);
  }
  values.basis = material.wax?.maxFragranceBasis ?? "wax";
  values.wickSize = material.wick?.size ?? "";
  if (material.vessel?.capacityMl !== undefined) {
    values.capacity = String(material.vessel.capacityMl);
  }
  if (material.vessel?.defaultFillMg !== undefined) {
    values.defaultFill = formatMinimalGrams(material.vessel.defaultFillMg);
  }
  values.price = moneyToInput(material.defaultPriceCentavos);
  return values;
}

/** V-02 style check shared by the editor and the picker's quick-add. */
export function validateName(text: string): string | undefined {
  const length = text.trim().length;
  if (length === 0) return M.nameRequired;
  if (length > LIMITS.maxNameLength) return M.nameTooLong;
  return undefined;
}

type Parsed = { value?: number; error?: string };

/** Blank is fine (optional). Otherwise at most `scale` decimals, from `min` to `max` inclusive (scaled values). */
function parseOptional(
  text: string,
  scale: number,
  min: number,
  max: number,
  rangeMessage: string,
  decimalsMessage: string,
): Parsed {
  const result = parseFixed(text, scale);
  if (!result.ok) {
    if (result.reason === "empty") return {};
    if (result.reason === "format") return { error: V01 };
    if (result.reason === "tooManyDecimals") return { error: decimalsMessage };
    return { error: rangeMessage };
  }
  if (result.value < min || result.value > max) return { error: rangeMessage };
  return { value: result.value };
}

const parsePercent = (text: string) =>
  parseOptional(text, 2, 0, LIMITS.maxFragranceBp, M.maxFragranceInvalid, M.decimalsPercent);
const parseCapacity = (text: string) =>
  parseOptional(text, 0, 1, LIMITS.maxWeightMg, M.capacityInvalid, M.capacityInvalid);
const parseFill = (text: string) =>
  parseOptional(text, 3, 1, LIMITS.maxWeightMg, M.fillInvalid, M.decimalsGrams);

const parsePrice = (text: string) =>
  parseMoneyField(text, {
    invalid: M.priceInvalid,
    decimals: M.priceDecimals,
    range: M.priceRange,
  });

/** The message for one field, or undefined when it is fine. */
export function validateField(values: FormValues, key: FieldKey): string | undefined {
  switch (key) {
    case "name":
      return validateName(values.name);
    case "maxFragrance":
      return values.type === "wax" ? parsePercent(values.maxFragrance).error : undefined;
    case "capacity":
      return values.type === "vessel" ? parseCapacity(values.capacity).error : undefined;
    case "defaultFill":
      return values.type === "vessel" ? parseFill(values.defaultFill).error : undefined;
    case "price":
      return parsePrice(values.price).error;
    default:
      return undefined;
  }
}

export function validateAll(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  for (const key of FIELD_ORDER) {
    const message = validateField(values, key);
    if (message) errors[key] = message;
  }
  return errors;
}

/**
 * The full set of fields for the repository. `materials.update` replaces the
 * editable fields, so every field the form holds is sent, blank ones as
 * undefined (the repository drops those). Call only after `validateAll` is clean.
 */
export function toInput(values: FormValues): MaterialInput {
  const input: MaterialInput = {
    type: values.type,
    name: values.name,
    supplier: values.supplier,
    notes: values.notes,
  };
  const price = parsePrice(values.price).value;
  if (price !== undefined) input.defaultPriceCentavos = price;
  if (values.type === "wax") {
    const percent = parsePercent(values.maxFragrance).value;
    input.wax =
      percent === undefined
        ? {}
        : { maxFragranceBp: percent, maxFragranceBasis: values.basis };
  } else if (values.type === "wick") {
    input.wick = { size: values.wickSize };
  } else if (values.type === "vessel") {
    input.vessel = {
      capacityMl: parseCapacity(values.capacity).value,
      defaultFillMg: parseFill(values.defaultFill).value,
    };
  }
  return input;
}
