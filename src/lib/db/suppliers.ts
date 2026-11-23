import { SupplierSchema } from "@/lib/schemas";
import type { Batch, Supplier } from "@/lib/types";
import type { CandleDatabase, SupplierInput, SupplierListItem, SuppliersRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Trimmed, case-insensitive key for uniqueness checks (supplier names, lot codes). */
export function sameTextKey(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** Trims a string; a blank one becomes undefined. A non-string is left for the schema to refuse. */
export function cleanOptional(value: string | undefined): string | undefined {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function bySupplierName(a: Supplier, b: Supplier): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** True when any of the batch's recorded lots names this supplier. */
export function batchNamesSupplier(batch: Batch, supplierId: string): boolean {
  return (batch.lots ?? []).some((link) => link.supplierId === supplierId);
}

function editable(input: SupplierInput) {
  const notes = cleanOptional(input.notes);
  return {
    name: typeof input.name === "string" ? input.name.trim() : input.name,
    ...(notes !== undefined ? { notes } : {}),
  };
}

export function createSuppliersRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): SuppliersRepo {
  /** Refuses a name another supplier already has (trimmed, case-insensitive, archived included). */
  async function checkUnique(name: string, selfId: string | null): Promise<void> {
    const key = sameTextKey(name);
    const clash = await db.suppliers.filter((s) => s.id !== selfId && sameTextKey(s.name) === key).first();
    if (clash) throw new DataError("invalid", `A supplier named "${name}" already exists.`);
  }

  async function usage(id: string): Promise<{ lots: number; batches: number }> {
    const lots = await db.materialLots.where("supplierId").equals(id).count();
    const batches = await db.batches.filter((batch) => batchNamesSupplier(batch, id)).count();
    return { lots, batches };
  }

  return {
    list: (filter) =>
      guard(async () => {
        const all = await db.suppliers.toArray();
        return all.filter((s) => (filter?.includeArchived ? true : s.archivedAt === null)).sort(bySupplierName);
      }),

    listItems: () =>
      guard(() =>
        db.transaction("r", [db.suppliers, db.materialLots, db.batches], async () => {
          const [suppliers, lots, batches] = await Promise.all([
            db.suppliers.toArray(),
            db.materialLots.toArray(),
            db.batches.toArray(),
          ]);
          const lotCount = new Map<string, number>();
          for (const lot of lots) {
            if (lot.supplierId !== null) lotCount.set(lot.supplierId, (lotCount.get(lot.supplierId) ?? 0) + 1);
          }
          const batchCount = new Map<string, number>();
          for (const batch of batches) {
            const named = new Set((batch.lots ?? []).map((link) => link.supplierId).filter((id) => id !== null));
            for (const id of named) batchCount.set(id, (batchCount.get(id) ?? 0) + 1);
          }
          return suppliers.sort(bySupplierName).map(
            (supplier): SupplierListItem => ({
              supplier,
              lotCount: lotCount.get(supplier.id) ?? 0,
              batchCount: batchCount.get(supplier.id) ?? 0,
            }),
          );
        }),
      ),

    get: (id) => guard(() => db.suppliers.get(id)),

    create: (input) =>
      guard(() =>
        db.transaction("rw", db.suppliers, db.meta, async () => {
          const timestamp = now();
          const supplier = parseRecord(
            SupplierSchema,
            { id: newId(), ...editable(input), createdAt: timestamp, updatedAt: timestamp, archivedAt: null },
            "supplier",
          );
          await checkUnique(supplier.name, null);
          await db.suppliers.add(supplier);
          await bumpChangeCounter(db);
          return supplier;
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", db.suppliers, db.meta, async () => {
          const existing = await db.suppliers.get(id);
          if (!existing) throw notFound("Supplier", id);
          const supplier = parseRecord(
            SupplierSchema,
            {
              id: existing.id,
              ...editable(input),
              createdAt: existing.createdAt,
              updatedAt: now(),
              archivedAt: existing.archivedAt,
            },
            "supplier",
          );
          await checkUnique(supplier.name, id);
          await db.suppliers.put(supplier);
          await bumpChangeCounter(db);
          return supplier;
        }),
      ),

    setArchived: (id, archived) =>
      guard(() =>
        db.transaction("rw", db.suppliers, db.meta, async () => {
          const existing = await db.suppliers.get(id);
          if (!existing) throw notFound("Supplier", id);
          const timestamp = now();
          const supplier = parseRecord(
            SupplierSchema,
            { ...existing, archivedAt: archived ? timestamp : null, updatedAt: timestamp },
            "supplier",
          );
          await db.suppliers.put(supplier);
          await bumpChangeCounter(db);
          return supplier;
        }),
      ),

    usage: (id) => guard(() => db.transaction("r", [db.materialLots, db.batches], () => usage(id))),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", [db.suppliers, db.materialLots, db.batches, db.meta], async () => {
          if (!(await db.suppliers.get(id))) throw notFound("Supplier", id);
          const used = await usage(id);
          if (used.lots > 0 || used.batches > 0) {
            throw new DataError(
              "in-use",
              `Supplier ${id} is named by ${used.lots} lot(s) and ${used.batches} batch(es).`,
            );
          }
          await db.suppliers.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
