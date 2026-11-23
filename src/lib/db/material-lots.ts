import { MaterialLotSchema } from "@/lib/schemas";
import type { MaterialLot } from "@/lib/types";
import type { CandleDatabase, MaterialLotInput, MaterialLotListItem, MaterialLotsRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";
import { cleanOptional, sameTextKey } from "./suppliers";

/** Newest received first, unknown dates last, then code (case-insensitive), then id. */
export function lotOrder(a: MaterialLot, b: MaterialLot): number {
  if (a.receivedOn !== b.receivedOn) {
    if (a.receivedOn === undefined) return 1;
    if (b.receivedOn === undefined) return -1;
    return b.receivedOn.localeCompare(a.receivedOn);
  }
  return a.code.localeCompare(b.code, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** Batches that link this lot on any component. Only Dexie operations are awaited. */
export function countBatchesUsingLot(db: CandleDatabase, lotId: string): Promise<number> {
  return db.batches.filter((batch) => (batch.lots ?? []).some((link) => link.lotId === lotId)).count();
}

function editable(input: MaterialLotInput) {
  const receivedOn = cleanOptional(input.receivedOn);
  const notes = cleanOptional(input.notes);
  return {
    supplierId: input.supplierId,
    code: typeof input.code === "string" ? input.code.trim() : input.code,
    ...(receivedOn !== undefined ? { receivedOn } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

export function createMaterialLotsRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): MaterialLotsRepo {
  /**
   * The supplier must exist. A new choice must not be archived; the lot's
   * stored supplier may be (`keepId`).
   */
  async function checkSupplier(supplierId: string | null, keepId: string | null): Promise<void> {
    if (supplierId === null) return;
    const supplier = await db.suppliers.get(supplierId);
    if (!supplier) throw notFound("Supplier", supplierId);
    if (supplier.archivedAt !== null && supplierId !== keepId) {
      throw new DataError("invalid", `Supplier ${supplierId} is archived.`);
    }
  }

  /** No other lot of the same material and supplier has this code (trimmed, case-insensitive). */
  async function checkUnique(lot: MaterialLot): Promise<void> {
    const key = sameTextKey(lot.code);
    const clash = await db.materialLots
      .where("materialId")
      .equals(lot.materialId)
      .filter((other) => other.id !== lot.id && other.supplierId === lot.supplierId && sameTextKey(other.code) === key)
      .first();
    if (clash) {
      throw new DataError("invalid", `Material ${lot.materialId} already has lot "${lot.code}" from this supplier.`);
    }
  }

  return {
    list: (filter) =>
      guard(async () => {
        const all =
          filter?.materialId !== undefined
            ? await db.materialLots.where("materialId").equals(filter.materialId).toArray()
            : await db.materialLots.toArray();
        return all
          .filter((lot) => (filter?.includeArchived ? true : lot.archivedAt === null))
          .filter((lot) => (filter?.supplierId !== undefined ? lot.supplierId === filter.supplierId : true))
          .sort(lotOrder);
      }),

    listItems: () =>
      guard(() =>
        db.transaction("r", [db.materialLots, db.materials, db.suppliers, db.batches], async () => {
          const [lots, materials, suppliers, batches] = await Promise.all([
            db.materialLots.toArray(),
            db.materials.toArray(),
            db.suppliers.toArray(),
            db.batches.toArray(),
          ]);
          const materialById = new Map(materials.map((m) => [m.id, m]));
          const supplierById = new Map(suppliers.map((s) => [s.id, s]));
          const batchCount = new Map<string, number>();
          for (const batch of batches) {
            for (const lotId of new Set((batch.lots ?? []).map((link) => link.lotId))) {
              batchCount.set(lotId, (batchCount.get(lotId) ?? 0) + 1);
            }
          }
          return lots.sort(lotOrder).map(
            (lot): MaterialLotListItem => ({
              lot,
              material: materialById.get(lot.materialId) ?? null,
              supplier: lot.supplierId === null ? null : (supplierById.get(lot.supplierId) ?? null),
              batchCount: batchCount.get(lot.id) ?? 0,
            }),
          );
        }),
      ),

    get: (id) => guard(() => db.materialLots.get(id)),

    create: (input) =>
      guard(() =>
        db.transaction("rw", [db.materialLots, db.materials, db.suppliers, db.meta], async () => {
          const material = await db.materials.get(input.materialId);
          if (!material) throw notFound("Material", input.materialId);
          if (material.archivedAt !== null) {
            throw new DataError("invalid", `Material ${material.id} is archived.`);
          }
          await checkSupplier(input.supplierId, null);
          const timestamp = now();
          const lot = parseRecord(
            MaterialLotSchema,
            {
              id: newId(),
              materialId: material.id,
              ...editable(input),
              createdAt: timestamp,
              updatedAt: timestamp,
              archivedAt: null,
            },
            "lot",
          );
          await checkUnique(lot);
          await db.materialLots.add(lot);
          await bumpChangeCounter(db);
          return lot;
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", [db.materialLots, db.suppliers, db.meta], async () => {
          const existing = await db.materialLots.get(id);
          if (!existing) throw notFound("Lot", id);
          if (input.materialId !== existing.materialId) {
            throw new DataError("invalid", "A lot's material cannot change.");
          }
          await checkSupplier(input.supplierId, existing.supplierId);
          const lot = parseRecord(
            MaterialLotSchema,
            {
              id: existing.id,
              materialId: existing.materialId,
              ...editable(input),
              createdAt: existing.createdAt,
              updatedAt: now(),
              archivedAt: existing.archivedAt,
            },
            "lot",
          );
          await checkUnique(lot);
          await db.materialLots.put(lot);
          await bumpChangeCounter(db);
          return lot;
        }),
      ),

    setArchived: (id, archived) =>
      guard(() =>
        db.transaction("rw", db.materialLots, db.meta, async () => {
          const existing = await db.materialLots.get(id);
          if (!existing) throw notFound("Lot", id);
          const timestamp = now();
          const lot = parseRecord(
            MaterialLotSchema,
            { ...existing, archivedAt: archived ? timestamp : null, updatedAt: timestamp },
            "lot",
          );
          await db.materialLots.put(lot);
          await bumpChangeCounter(db);
          return lot;
        }),
      ),

    usage: (id) => guard(async () => ({ batches: await countBatchesUsingLot(db, id) })),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", [db.materialLots, db.batches, db.meta], async () => {
          if (!(await db.materialLots.get(id))) throw notFound("Lot", id);
          const batches = await countBatchesUsingLot(db, id);
          if (batches > 0) throw new DataError("in-use", `Lot ${id} is used by ${batches} batch(es).`);
          await db.materialLots.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
