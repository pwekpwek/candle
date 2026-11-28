import { MESSAGES } from "@/lib/messages";
import { MAX_COST_ITEM_NAME_LENGTH, MAX_COST_NOTES_LENGTH } from "@/lib/types";
import type { CostItem } from "@/lib/types";
import type { CostItemInput } from "@/lib/db";
import { moneyToInput, parseMoneyField } from "./money";

const C = MESSAGES.costItems;

/** Every field as typed. */
export type ItemValues = { name: string; price: string; notes: string };
export type ItemFieldKey = "name" | "price" | "notes";
export type ItemErrors = Partial<Record<ItemFieldKey, string>>;
export const ITEM_FIELD_ORDER: readonly ItemFieldKey[] = ["name", "price", "notes"];

export type ItemContext = {
  /** Every item (archived included) to compare a name against. */
  items: readonly { id: string; name: string }[];
  /** The item being edited, left out of the duplicate check. */
  editingId: string | null;
};

const normalize = (text: string) => text.trim().toLowerCase();

export const emptyItemValues = (): ItemValues => ({ name: "", price: "", notes: "" });

export function itemValuesFrom(item: CostItem): ItemValues {
  return { name: item.name, price: moneyToInput(item.unitCentavos), notes: item.notes ?? "" };
}

const parsePrice = (text: string) =>
  parseMoneyField(text, { invalid: C.priceInvalid, decimals: C.priceDecimals, range: C.priceRange });

export function validateItemField(
  values: ItemValues,
  key: ItemFieldKey,
  ctx: ItemContext,
): string | undefined {
  switch (key) {
    case "name": {
      const name = values.name.trim();
      if (name.length === 0) return C.nameRequired;
      if (name.length > MAX_COST_ITEM_NAME_LENGTH) return C.nameTooLong;
      const wanted = normalize(name);
      return ctx.items.some((i) => i.id !== ctx.editingId && normalize(i.name) === wanted)
        ? C.nameDuplicate
        : undefined;
    }
    case "price": {
      const price = parsePrice(values.price);
      return price.blank ? C.priceRequired : price.error;
    }
    case "notes":
      return values.notes.trim().length > MAX_COST_NOTES_LENGTH ? C.notesTooLong : undefined;
  }
}

export function validateItem(values: ItemValues, ctx: ItemContext): ItemErrors {
  const errors: ItemErrors = {};
  for (const key of ITEM_FIELD_ORDER) {
    const message = validateItemField(values, key, ctx);
    if (message) errors[key] = message;
  }
  return errors;
}

/** Call only after `validateItem` is clean. */
export function toItemInput(values: ItemValues): CostItemInput {
  return {
    name: values.name,
    unitCentavos: parsePrice(values.price).value ?? 0,
    notes: values.notes,
  };
}
