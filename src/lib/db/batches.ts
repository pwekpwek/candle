import { BatchSchema, ProductionPlanSchema } from "@/lib/schemas";
import type { Batch, FormulaVersion, MeasurementEntry } from "@/lib/types";
import type { BatchInput, BatchListItem, BatchesRepo, CandleDatabase } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Latest production date first, then newest created, then id (stable). */
function batchOrder(a: Batch, b: Batch): number {
  return (
    b.producedOn.localeCompare(a.producedOn) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/** Entries must name the version's wax and oil rows, each at most once. */
function checkEntries(version: FormulaVersion, entries: readonly MeasurementEntry[]): MeasurementEntry[] {
  const known = new Set(
    [...version.inputs.waxes, ...version.inputs.oils].map((row) => row.componentId),
  );
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!known.has(entry.componentId)) {
      throw new DataError("invalid", `Component ${entry.componentId} is not in version ${version.id}.`);
    }
    if (seen.has(entry.componentId)) {
      throw new DataError("invalid", `Component ${entry.componentId} is measured twice.`);
    }
    seen.add(entry.componentId);
  }
  return entries.map((entry) => ({ componentId: entry.componentId, actualMg: entry.actualMg }));
}

/** The editable part of a batch record, trimmed, with blank optional text left out. */
function editable(version: FormulaVersion, input: BatchInput) {
  const label = optionalText(input.label);
  const notes = optionalText(input.notes);
  return {
    producedOn: input.producedOn,
    ...(label !== undefined ? { label } : {}),
    entries: checkEntries(version, input.entries ?? []),
    ...(notes !== undefined ? { notes } : {}),
  };
}

export function createBatchesRepo(db: CandleDatabase, now: () => string): BatchesRepo {
  /** Joins batches with their formula and version. A batch whose source is missing is left out. */
  async function withSources(batches: Batch[]): Promise<BatchListItem[]> {
    const versionIds = [...new Set(batches.map((batch) => batch.versionId))];
    const formulaIds = [...new Set(batches.map((batch) => batch.formulaId))];
    const [versions, formulas] = await Promise.all([
      db.formulaVersions.bulkGet(versionIds),
      db.formulas.bulkGet(formulaIds),
    ]);
    const versionById = new Map(
      versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]),
    );
    const formulaById = new Map(
      formulas.filter((f) => f !== undefined).map((f) => [f!.id, f!]),
    );
    const items: BatchListItem[] = [];
    for (const batch of batches) {
      const version = versionById.get(batch.versionId);
      const formula = formulaById.get(batch.formulaId);
      // Deleting a formula with batches is refused and a restore checks the
      // links, so this only happens with damaged data. Leave it out rather
      // than hand the screen a hole.
      if (version && formula) items.push({ batch, formula, version });
    }
    return items;
  }

  return {
    list: () =>
      guard(() =>
        db.transaction("r", [db.batches, db.formulaVersions, db.formulas], async () => {
          const batches = (await db.batches.toArray()).sort(batchOrder);
          return withSources(batches);
        }),
      ),

    listByFormula: (formulaId) =>
      guard(async () => {
        const rows = await db.batches.where("formulaId").equals(formulaId).toArray();
        return rows.sort(batchOrder);
      }),

    get: (id) =>
      guard(() =>
        db.transaction("r", [db.batches, db.formulaVersions, db.formulas], async () => {
          const batch = await db.batches.get(id);
          if (!batch) return undefined;
          const [item] = await withSources([batch]);
          return item;
        }),
      ),

    create: (request) =>
      guard(() =>
        db.transaction("rw", [db.batches, db.formulaVersions, db.formulas, db.productionPlans, db.meta], async () => {
          // Idempotent: a retry with the same id writes nothing.
          const already = await db.batches.get(request.batchId);
          if (already) return { batch: already, created: false };

          const version = await db.formulaVersions.get(request.versionId);
          if (!version) throw notFound("Version", request.versionId);
          if (!(await db.formulas.get(version.formulaId))) throw notFound("Formula", version.formulaId);

          // CurePilot: a batch made from a planned production entry links it.
          const planId = request.productionPlanId;
          const entry = planId === undefined ? undefined : await db.productionPlans.get(planId);
          if (planId !== undefined && !entry) throw notFound("Production plan", planId);
          if (entry && entry.versionId !== version.id) {
            throw new DataError("invalid", `Production plan ${entry.id} is for another version.`);
          }
          if (entry && entry.batchId !== null) {
            throw new DataError("invalid", `Production plan ${entry.id} already has a batch.`);
          }

          const timestamp = now();
          const batch = parseRecord(
            BatchSchema,
            {
              id: request.batchId,
              formulaId: version.formulaId,
              versionId: version.id,
              ...editable(version, request),
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            "batch",
          );
          await db.batches.add(batch);
          if (entry) {
            const linked = parseRecord(
              ProductionPlanSchema,
              { ...entry, batchId: batch.id, updatedAt: timestamp },
              "production plan",
            );
            await db.productionPlans.put(linked);
          }
          await bumpChangeCounter(db);
          return { batch, created: true };
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", [db.batches, db.formulaVersions, db.meta], async () => {
          const existing = await db.batches.get(id);
          if (!existing) throw notFound("Batch", id);
          const version = await db.formulaVersions.get(existing.versionId);
          if (!version) throw notFound("Version", existing.versionId);
          const batch = parseRecord(
            BatchSchema,
            {
              // The source link and identity are copied, never taken from input.
              id: existing.id,
              formulaId: existing.formulaId,
              versionId: existing.versionId,
              ...editable(version, input),
              createdAt: existing.createdAt,
              updatedAt: now(),
            },
            "batch",
          );
          await db.batches.put(batch);
          await bumpChangeCounter(db);
          return batch;
        }),
      ),

    deletionImpact: (id) =>
      guard(() =>
        db.transaction("r", [db.curePlans, db.productionPlans, db.burnSessions], async () => {
          const plan = await db.curePlans.get(id);
          return {
            milestones: plan?.milestones.length ?? 0,
            productionPlans: await db.productionPlans.where("batchId").equals(id).count(),
            burnSessions: await db.burnSessions.where("batchId").equals(id).count(),
          };
        }),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", [db.batches, db.curePlans, db.productionPlans, db.burnSessions, db.meta], async () => {
          if (!(await db.batches.get(id))) throw notFound("Batch", id);
          // BurnMatrix: burn tests are observations of the batch; they are
          // never deleted with it (docs/v0.2-burnmatrix.md, Archive and delete).
          const sessions = await db.burnSessions.where("batchId").equals(id).count();
          if (sessions > 0) {
            throw new DataError("in-use", `Batch ${id} has ${sessions} burn test(s).`);
          }
          // CurePilot: the batch's cure plan goes with it, and an entry that
          // made it becomes open again (docs/v0.2-curepilot.md, Archive and delete).
          await db.curePlans.delete(id);
          const entries = await db.productionPlans.where("batchId").equals(id).toArray();
          const timestamp = now();
          for (const entry of entries) {
            await db.productionPlans.put(
              parseRecord(
                ProductionPlanSchema,
                { ...entry, batchId: null, updatedAt: timestamp },
                "production plan",
              ),
            );
          }
          await db.batches.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
