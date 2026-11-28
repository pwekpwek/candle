import { CostItemSchema } from "@/lib/schemas";
import type { CostItem } from "@/lib/types";
import type { CandleDatabase, CostItemInput, CostItemsRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";
import { cleanOptional, sameTextKey } from "./suppliers";

/** By name, case-insensitive, then id. */
export function costItemOrder(a: CostItem, b: CostItem): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

function editable(input: CostItemInput) {
  const notes = cleanOptional(input.notes);
  return {
    name: typeof input.name === "string" ? input.name.trim() : input.name,
    unitCentavos: input.unitCentavos,
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** Sheets with at least one line picked from this item. Only Dexie operations are awaited. */
export function countSheetsUsingItem(db: CandleDatabase, itemId: string): Promise<number> {
  return db.costSheets.filter((sheet) => sheet.items.some((line) => line.itemId === itemId)).count();
}

/** Packaging and other items (v0.3 TrueCandle Cost, docs/v0.3-cost.md). */
export function createCostItemsRepo(db: CandleDatabase, now: () => string, newId: () => string): CostItemsRepo {
  /** Refuses a name another item already has (trimmed, case-insensitive, archived included). */
  async function checkUnique(name: string, selfId: string | null): Promise<void> {
    const key = sameTextKey(name);
    const clash = await db.costItems.filter((item) => item.id !== selfId && sameTextKey(item.name) === key).first();
    if (clash) throw new DataError("invalid", `An item named "${name}" already exists.`);
  }

  return {
    list: (filter) =>
      guard(async () => {
        const all = await db.costItems.toArray();
        return all.filter((item) => (filter?.includeArchived ? true : item.archivedAt === null)).sort(costItemOrder);
      }),

    get: (id) => guard(() => db.costItems.get(id)),

    create: (input) =>
      guard(() =>
        db.transaction("rw", db.costItems, db.meta, async () => {
          const timestamp = now();
          const item = parseRecord(
            CostItemSchema,
            { id: newId(), ...editable(input), createdAt: timestamp, updatedAt: timestamp, archivedAt: null },
            "item",
          );
          await checkUnique(item.name, null);
          await db.costItems.add(item);
          await bumpChangeCounter(db);
          return item;
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", db.costItems, db.meta, async () => {
          const existing = await db.costItems.get(id);
          if (!existing) throw notFound("Item", id);
          const item = parseRecord(
            CostItemSchema,
            {
              id: existing.id,
              ...editable(input),
              createdAt: existing.createdAt,
              updatedAt: now(),
              archivedAt: existing.archivedAt,
            },
            "item",
          );
          await checkUnique(item.name, id);
          await db.costItems.put(item);
          await bumpChangeCounter(db);
          return item;
        }),
      ),

    setArchived: (id, archived) =>
      guard(() =>
        db.transaction("rw", db.costItems, db.meta, async () => {
          const existing = await db.costItems.get(id);
          if (!existing) throw notFound("Item", id);
          const timestamp = now();
          const item = parseRecord(
            CostItemSchema,
            { ...existing, archivedAt: archived ? timestamp : null, updatedAt: timestamp },
            "item",
          );
          await db.costItems.put(item);
          await bumpChangeCounter(db);
          return item;
        }),
      ),

    usage: (id) => guard(async () => ({ sheets: await countSheetsUsingItem(db, id) })),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", db.costItems, db.meta, async () => {
          if (!(await db.costItems.get(id))) throw notFound("Item", id);
          // Sheets keep their own copy of the name and price (docs/v0.3-cost.md).
          await db.costItems.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
