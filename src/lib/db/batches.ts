import { BatchSchema, ProductionPlanSchema, batchLotSlot } from "@/lib/schemas";
import type { Batch, BatchLot, FormulaVersion, MeasurementEntry } from "@/lib/types";
import type { BatchInput, BatchLotInput, BatchListItem, BatchesRepo, CandleDatabase } from "./contract";
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

/**
 * The editable part of a batch record, trimmed, with blank optional text left
 * out. `lots` is already resolved (`resolveLots`); empty leaves the field out.
 */
function editable(version: FormulaVersion, input: BatchInput, lots: readonly BatchLot[], stored?: Batch) {
  const label = optionalText(input.label);
  const notes = optionalText(input.notes);
  // v0.3 TrueCandle Cost: absent keeps the stored count, null clears it. The
  // schema refuses sellable without candles made, or above them.
  const candlesMade = input.candlesMade === undefined ? stored?.candlesMade : (input.candlesMade ?? undefined);
  const sellable = input.sellable === undefined ? stored?.sellable : (input.sellable ?? undefined);
  return {
    producedOn: input.producedOn,
    ...(label !== undefined ? { label } : {}),
    entries: checkEntries(version, input.entries ?? []),
    ...(lots.length > 0 ? { lots: [...lots] } : {}),
    ...(candlesMade !== undefined ? { candlesMade } : {}),
    ...(sellable !== undefined ? { sellable } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

type LotSlot = { key: string; part: BatchLot["part"]; componentId?: string; materialId: string };

/** The version's components a lot can be recorded for, in the version's order, with their material. */
function lotSlots(version: FormulaVersion): LotSlot[] {
  const { waxes, oils, wick, vessel } = version.inputs;
  const slots: LotSlot[] = [...waxes, ...oils].map((row) => ({
    key: batchLotSlot({ part: "row", componentId: row.componentId }),
    part: "row",
    componentId: row.componentId,
    materialId: row.materialId,
  }));
  if (wick) slots.push({ key: "wick", part: "wick", materialId: wick.materialId });
  if (vessel) slots.push({ key: "vessel", part: "vessel", materialId: vessel.materialId });
  return slots;
}

/**
 * v0.3: checks the lot links the form sent and snapshots them
 * (docs/v0.3-lots.md). A link whose lot is unchanged on that component keeps
 * the stored snapshot (`stored`); a new or changed one takes the lot's code
 * and supplier as they are now, and must not name an archived lot. Returned in
 * the version's order. Only Dexie operations are awaited.
 */
export async function resolveLots(
  db: CandleDatabase,
  version: FormulaVersion,
  input: readonly BatchLotInput[],
  stored: readonly BatchLot[],
): Promise<BatchLot[]> {
  const slots = lotSlots(version);
  const slotByKey = new Map(slots.map((slot) => [slot.key, slot]));
  const storedByKey = new Map(stored.map((link) => [batchLotSlot(link), link]));
  const chosen = new Map<string, BatchLot>();
  for (const link of input) {
    if ((link.part === "row") !== (link.componentId !== undefined)) {
      throw new DataError("invalid", "A lot on a wax or oil row names its component; a wick or vessel lot does not.");
    }
    const key = batchLotSlot(link);
    const slot = slotByKey.get(key);
    if (!slot) throw new DataError("invalid", `Component ${key} is not in version ${version.id}.`);
    if (chosen.has(key)) throw new DataError("invalid", `Component ${key} has two lots.`);
    const lot = await db.materialLots.get(link.lotId);
    if (!lot) throw notFound("Lot", link.lotId);
    if (lot.materialId !== slot.materialId) {
      throw new DataError("invalid", `Lot ${lot.id} is not a lot of the material used for ${key}.`);
    }
    const kept = storedByKey.get(key);
    if (kept && kept.lotId === lot.id) {
      chosen.set(key, kept);
      continue;
    }
    if (lot.archivedAt !== null) throw new DataError("invalid", `Lot ${lot.id} is archived.`);
    let supplierName: string | undefined;
    if (lot.supplierId !== null) {
      const supplier = await db.suppliers.get(lot.supplierId);
      if (!supplier) throw notFound("Supplier", lot.supplierId);
      supplierName = supplier.name;
    }
    chosen.set(key, {
      part: slot.part,
      ...(slot.componentId !== undefined ? { componentId: slot.componentId } : {}),
      lotId: lot.id,
      lotCode: lot.code,
      supplierId: lot.supplierId,
      ...(supplierName !== undefined ? { supplierName } : {}),
    });
  }
  return slots.map((slot) => chosen.get(slot.key)).filter((link): link is BatchLot => link !== undefined);
}

/**
 * The date of the batch's earliest burn test, or null without any. Only Dexie
 * operations are awaited, so it can run inside a transaction over burnSessions.
 */
export async function earliestTestedOn(db: CandleDatabase, batchId: string): Promise<string | null> {
  const sessions = await db.burnSessions.where("batchId").equals(batchId).toArray();
  let earliest: string | null = null;
  for (const session of sessions) {
    if (earliest === null || session.testedOn < earliest) earliest = session.testedOn;
  }
  return earliest;
}

/**
 * CandleFix: the batch's earliest investigation date, or null without any.
 * Only Dexie operations are awaited (safe inside a transaction over investigations).
 */
export async function earliestObservedOn(db: CandleDatabase, batchId: string): Promise<string | null> {
  const investigations = await db.investigations.where("batchId").equals(batchId).toArray();
  let earliest: string | null = null;
  for (const investigation of investigations) {
    if (earliest === null || investigation.observedOn < earliest) earliest = investigation.observedOn;
  }
  return earliest;
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
        db.transaction("rw", [db.batches, db.formulaVersions, db.formulas, db.productionPlans, db.materialLots, db.suppliers, db.meta], async () => {
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

          const lots = await resolveLots(db, version, request.lots ?? [], []);
          const timestamp = now();
          const batch = parseRecord(
            BatchSchema,
            {
              id: request.batchId,
              formulaId: version.formulaId,
              versionId: version.id,
              ...editable(version, request, lots),
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
        db.transaction(
          "rw",
          [db.batches, db.formulaVersions, db.burnSessions, db.investigations, db.materialLots, db.suppliers, db.meta],
          async () => {
          const existing = await db.batches.get(id);
          if (!existing) throw notFound("Batch", id);
          const version = await db.formulaVersions.get(existing.versionId);
          if (!version) throw notFound("Version", existing.versionId);
          // Integration QA: a burn test is never dated before its batch was
          // made, so the production date cannot move past the earliest test.
          // A date already stored is kept as it is (a restore can bring one
          // in, M-2), so other edits of such a batch still save.
          const earliest = await earliestTestedOn(db, id);
          if (earliest !== null && input.producedOn > earliest && input.producedOn !== existing.producedOn) {
            throw new DataError(
              "invalid",
              `Batch ${id} has a burn test dated ${earliest}; the production date cannot be later.`,
            );
          }
          // CandleFix: the same rule for investigations (an issue is never
          // observed before the batch was made).
          const observed = await earliestObservedOn(db, id);
          if (observed !== null && input.producedOn > observed && input.producedOn !== existing.producedOn) {
            throw new DataError(
              "invalid",
              `Batch ${id} has an investigation dated ${observed}; the production date cannot be later.`,
            );
          }
          // v0.3: no `lots` in the input keeps the stored links as they are.
          const stored = existing.lots ?? [];
          const lots = input.lots === undefined ? stored : await resolveLots(db, version, input.lots, stored);
          const batch = parseRecord(
            BatchSchema,
            {
              // The source link and identity are copied, never taken from input.
              id: existing.id,
              formulaId: existing.formulaId,
              versionId: existing.versionId,
              ...editable(version, input, lots, existing),
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
        db.transaction(
          "r",
          [db.curePlans, db.productionPlans, db.burnSessions, db.investigations, db.correctiveExperiments, db.costSheets],
          async () => {
            const plan = await db.curePlans.get(id);
            return {
              milestones: plan?.milestones.length ?? 0,
              productionPlans: await db.productionPlans.where("batchId").equals(id).count(),
              burnSessions: await db.burnSessions.where("batchId").equals(id).count(),
              investigations: await db.investigations.where("batchId").equals(id).count(),
              followUpExperiments: await db.correctiveExperiments.where("followUpBatchId").equals(id).count(),
              costSheets: await db.costSheets.where("batchId").equals(id).count(),
            };
          },
        ),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction(
          "rw",
          [db.batches, db.curePlans, db.productionPlans, db.burnSessions, db.investigations, db.correctiveExperiments, db.costSheets, db.meta],
          async () => {
          if (!(await db.batches.get(id))) throw notFound("Batch", id);
          // BurnMatrix: burn tests are observations of the batch; they are
          // never deleted with it (docs/v0.2-burnmatrix.md, Archive and delete).
          const sessions = await db.burnSessions.where("batchId").equals(id).count();
          if (sessions > 0) {
            throw new DataError("in-use", `Batch ${id} has ${sessions} burn test(s).`);
          }
          // CandleFix: investigations and experiments are history of the
          // batch; they are never deleted with it (docs/v0.3-candlefix.md).
          const investigations = await db.investigations.where("batchId").equals(id).count();
          if (investigations > 0) {
            throw new DataError("in-use", `Batch ${id} has ${investigations} investigation(s).`);
          }
          const followUps = await db.correctiveExperiments.where("followUpBatchId").equals(id).count();
          if (followUps > 0) {
            throw new DataError("in-use", `Batch ${id} is the follow-up of ${followUps} corrective experiment(s).`);
          }
          // TrueCandle Cost: a cost sheet is costed from the batch; it is never
          // deleted with it (docs/v0.3-cost.md, Archive and delete).
          const sheets = await db.costSheets.where("batchId").equals(id).count();
          if (sheets > 0) {
            throw new DataError("in-use", `Batch ${id} has ${sheets} cost sheet(s).`);
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
