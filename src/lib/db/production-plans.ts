import { ProductionPlanSchema } from "@/lib/schemas";
import type { Batch, Formula, FormulaVersion, ProductionPlan } from "@/lib/types";
import type {
  CandleDatabase,
  ProductionPlanInput,
  ProductionPlanListItem,
  ProductionPlansRepo,
} from "./contract";
import { guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Earliest planned date first, then oldest created, then id (stable). */
export function productionPlanOrder(a: ProductionPlan, b: ProductionPlan): number {
  return (
    a.plannedOn.localeCompare(b.plannedOn) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

function editable(input: ProductionPlanInput) {
  const label = optionalText(input.label);
  const notes = optionalText(input.notes);
  return {
    plannedOn: input.plannedOn,
    ...(label !== undefined ? { label } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

/**
 * Joins entries with their formula, version and batch. Only Dexie operations
 * are awaited, so it can run inside a transaction over those four stores.
 * An entry whose formula or version is missing is left out (damaged data only:
 * deleting a formula deletes its entries, and a restore checks the links).
 */
export async function joinProductionPlans(
  db: CandleDatabase,
  plans: ProductionPlan[],
): Promise<ProductionPlanListItem[]> {
  const versionIds = [...new Set(plans.map((p) => p.versionId))];
  const formulaIds = [...new Set(plans.map((p) => p.formulaId))];
  const batchIds = [...new Set(plans.map((p) => p.batchId).filter((id): id is string => id !== null))];
  const versions = await db.formulaVersions.bulkGet(versionIds);
  const formulas = await db.formulas.bulkGet(formulaIds);
  const batches = await db.batches.bulkGet(batchIds);
  const versionById = new Map(
    versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]),
  );
  const formulaById = new Map(
    formulas.filter((f): f is Formula => f !== undefined).map((f) => [f.id, f]),
  );
  const batchById = new Map(
    batches.filter((b): b is Batch => b !== undefined).map((b) => [b.id, b]),
  );
  const items: ProductionPlanListItem[] = [];
  for (const plan of plans) {
    const version = versionById.get(plan.versionId);
    const formula = formulaById.get(plan.formulaId);
    if (!version || !formula) continue;
    const batch = plan.batchId === null ? null : (batchById.get(plan.batchId) ?? null);
    items.push({ plan, formula, version, batch });
  }
  return items;
}

export function createProductionPlansRepo(db: CandleDatabase, now: () => string): ProductionPlansRepo {
  const joinedStores = [db.productionPlans, db.formulaVersions, db.formulas, db.batches];

  return {
    list: () =>
      guard(() =>
        db.transaction("r", joinedStores, async () => {
          const plans = (await db.productionPlans.toArray()).sort(productionPlanOrder);
          return joinProductionPlans(db, plans);
        }),
      ),

    listByFormula: (formulaId) =>
      guard(async () => {
        const rows = await db.productionPlans.where("formulaId").equals(formulaId).toArray();
        return rows.sort(productionPlanOrder);
      }),

    get: (id) =>
      guard(() =>
        db.transaction("r", joinedStores, async () => {
          const plan = await db.productionPlans.get(id);
          if (!plan) return undefined;
          const [item] = await joinProductionPlans(db, [plan]);
          return item;
        }),
      ),

    create: (request) =>
      guard(() =>
        db.transaction("rw", [db.productionPlans, db.formulaVersions, db.formulas, db.meta], async () => {
          // Idempotent: a retry with the same id writes nothing.
          const already = await db.productionPlans.get(request.planId);
          if (already) return { plan: already, created: false };

          const version = await db.formulaVersions.get(request.versionId);
          if (!version) throw notFound("Version", request.versionId);
          if (!(await db.formulas.get(version.formulaId))) throw notFound("Formula", version.formulaId);

          const timestamp = now();
          const plan = parseRecord(
            ProductionPlanSchema,
            {
              id: request.planId,
              formulaId: version.formulaId,
              versionId: version.id,
              ...editable(request),
              batchId: null,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            "production plan",
          );
          await db.productionPlans.add(plan);
          await bumpChangeCounter(db);
          return { plan, created: true };
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", [db.productionPlans, db.meta], async () => {
          const existing = await db.productionPlans.get(id);
          if (!existing) throw notFound("Production plan", id);
          const plan = parseRecord(
            ProductionPlanSchema,
            {
              // Identity, source link and batch link are copied, never taken from input.
              id: existing.id,
              formulaId: existing.formulaId,
              versionId: existing.versionId,
              ...editable(input),
              batchId: existing.batchId,
              createdAt: existing.createdAt,
              updatedAt: now(),
            },
            "production plan",
          );
          await db.productionPlans.put(plan);
          await bumpChangeCounter(db);
          return plan;
        }),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", [db.productionPlans, db.meta], async () => {
          if (!(await db.productionPlans.get(id))) throw notFound("Production plan", id);
          await db.productionPlans.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
