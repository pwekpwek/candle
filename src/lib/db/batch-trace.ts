import type { Batch, Formula, FormulaVersion, Material } from "@/lib/types";
import type { BatchTraceItem, BatchTraceRepo, CandleDatabase } from "./contract";
import { guard } from "./errors";
import { lotOrder } from "./material-lots";
import { bySupplierName } from "./suppliers";

/** Latest production date first, then newest created, then id (same as `batches.list`). */
function batchOrder(a: Batch, b: Batch): number {
  return (
    b.producedOn.localeCompare(a.producedOn) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function byName(a: { name: string; id: string }, b: { name: string; id: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

/** v0.3: everything the Batches list, its search, filters and CSV need, in one read transaction. */
export function createBatchTraceRepo(db: CandleDatabase): BatchTraceRepo {
  return {
    read: () =>
      guard(() =>
        db.transaction(
          "r",
          [
            db.batches,
            db.formulas,
            db.formulaVersions,
            db.curePlans,
            db.burnSessions,
            db.materialLots,
            db.suppliers,
            db.materials,
          ],
          async () => {
            const batches = (await db.batches.toArray()).sort(batchOrder);
            const versionIds = [...new Set(batches.map((batch) => batch.versionId))];
            const [formulas, versions, planIds, sessions, lots, suppliers, materials] = await Promise.all([
              db.formulas.toArray(),
              db.formulaVersions.bulkGet(versionIds),
              db.curePlans.toCollection().primaryKeys(),
              db.burnSessions.toArray(),
              db.materialLots.toArray(),
              db.suppliers.toArray(),
              db.materials.toArray(),
            ]);
            const formulaById = new Map(formulas.map((formula) => [formula.id, formula]));
            const versionById = new Map(
              versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]),
            );
            const planned = new Set<string>(planIds as string[]);
            const burnCount = new Map<string, number>();
            for (const session of sessions) {
              burnCount.set(session.batchId, (burnCount.get(session.batchId) ?? 0) + 1);
            }
            const lotById = new Map(lots.map((lot) => [lot.id, lot]));
            const supplierById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

            const items: BatchTraceItem[] = [];
            for (const batch of batches) {
              const formula = formulaById.get(batch.formulaId);
              const version = versionById.get(batch.versionId);
              // Only damaged data lacks these (formula delete is refused, restore checks links).
              if (!formula || !version) continue;
              items.push({
                batch,
                formula,
                version,
                hasCurePlan: planned.has(batch.id),
                burnTestCount: burnCount.get(batch.id) ?? 0,
                lots: (batch.lots ?? []).map((link) => {
                  const lot = lotById.get(link.lotId) ?? null;
                  const supplier =
                    lot === null || lot.supplierId === null ? null : (supplierById.get(lot.supplierId) ?? null);
                  return { link, lot, supplier };
                }),
              });
            }
            return {
              items,
              formulas: [...formulas].sort(byName) as Formula[],
              lots: [...lots].sort(lotOrder),
              suppliers: [...suppliers].sort(bySupplierName),
              materials: [...materials].sort(byName) as Material[],
            };
          },
        ),
      ),
  };
}
