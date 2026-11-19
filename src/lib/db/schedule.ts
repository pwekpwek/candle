import type { Batch, Formula, FormulaVersion } from "@/lib/types";
import type { CandleDatabase, CureScheduleItem, ScheduleRepo } from "./contract";
import { guard } from "./errors";
import { joinProductionPlans, productionPlanOrder } from "./production-plans";

/** Reads cure plans and production entries with what they link to, in one transaction. */
export function createScheduleRepo(db: CandleDatabase): ScheduleRepo {
  return {
    read: () =>
      guard(() =>
        db.transaction(
          "r",
          [db.curePlans, db.productionPlans, db.batches, db.formulaVersions, db.formulas],
          async () => {
            const plans = await db.curePlans.toArray();
            const batches = await db.batches.bulkGet(plans.map((plan) => plan.id));
            const batchById = new Map(
              batches.filter((b): b is Batch => b !== undefined).map((b) => [b.id, b]),
            );
            const linked = [...batchById.values()];
            const versions = await db.formulaVersions.bulkGet([
              ...new Set(linked.map((b) => b.versionId)),
            ]);
            const formulas = await db.formulas.bulkGet([...new Set(linked.map((b) => b.formulaId))]);
            const versionById = new Map(
              versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]),
            );
            const formulaById = new Map(
              formulas.filter((f): f is Formula => f !== undefined).map((f) => [f.id, f]),
            );
            const cure: CureScheduleItem[] = [];
            for (const plan of plans.sort((a, b) => a.id.localeCompare(b.id))) {
              const batch = batchById.get(plan.id);
              const version = batch && versionById.get(batch.versionId);
              const formula = batch && formulaById.get(batch.formulaId);
              if (batch && version && formula) cure.push({ plan, batch, formula, version });
            }

            const entries = (await db.productionPlans.toArray()).sort(productionPlanOrder);
            const production = await joinProductionPlans(db, entries);
            return { cure, production };
          },
        ),
      ),
  };
}
