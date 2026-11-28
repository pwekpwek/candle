import { CorrectiveExperimentSchema } from "@/lib/schemas";
import type { CorrectiveExperiment } from "@/lib/types";
import type { CandleDatabase, CorrectiveExperimentInput, CorrectiveExperimentsRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Oldest first, then id (stable). */
export function experimentOrder(a: CorrectiveExperiment, b: CorrectiveExperiment): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Every listed burn test must exist and be a burn test of the follow-up batch.
 * Duplicates and the count are the schema's job.
 */
async function checkSessions(db: CandleDatabase, ids: unknown, followUpBatchId: string): Promise<void> {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const session = await db.burnSessions.get(id);
    if (!session) throw notFound("Burn session", id);
    if (session.batchId !== followUpBatchId) {
      throw new DataError("invalid", `Burn test ${id} is not a burn test of follow-up batch ${followUpBatchId}.`);
    }
  }
}

function editable(input: CorrectiveExperimentInput) {
  const change = optionalText(input.change);
  const notes = optionalText(input.notes);
  return {
    burnSessionIds: Array.isArray(input.burnSessionIds) ? [...input.burnSessionIds] : input.burnSessionIds,
    ...(change !== undefined ? { change } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}

/** v0.3 CandleFix: corrective experiments (docs/v0.3-candlefix.md). */
export function createCorrectiveExperimentsRepo(db: CandleDatabase, now: () => string): CorrectiveExperimentsRepo {
  const writeTables = () => [db.correctiveExperiments, db.investigations, db.batches, db.burnSessions, db.meta];

  return {
    listByInvestigation: (investigationId) =>
      guard(async () =>
        (await db.correctiveExperiments.where("investigationId").equals(investigationId).toArray()).sort(
          experimentOrder,
        ),
      ),

    get: (id) => guard(() => db.correctiveExperiments.get(id)),

    create: (request) =>
      guard(() =>
        db.transaction("rw", writeTables(), async () => {
          // Idempotent: a retry with the same id writes nothing.
          const already = await db.correctiveExperiments.get(request.experimentId);
          if (already) return { experiment: already, created: false };
          const investigation = await db.investigations.get(request.investigationId);
          if (!investigation) throw notFound("Investigation", request.investigationId);
          if (!investigation.hypotheses.some((h) => h.id === request.hypothesisId)) {
            throw notFound("Hypothesis", request.hypothesisId);
          }
          if (!(await db.batches.get(request.followUpBatchId))) throw notFound("Batch", request.followUpBatchId);
          if (request.followUpBatchId === investigation.batchId) {
            throw new DataError("invalid", "The follow-up batch must be another batch than the one investigated.");
          }
          await checkSessions(db, request.burnSessionIds, request.followUpBatchId);
          const timestamp = now();
          const experiment = parseRecord(
            CorrectiveExperimentSchema,
            {
              id: request.experimentId,
              investigationId: investigation.id,
              hypothesisId: request.hypothesisId,
              followUpBatchId: request.followUpBatchId,
              ...editable(request),
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            "corrective experiment",
          );
          await db.correctiveExperiments.add(experiment);
          await bumpChangeCounter(db);
          return { experiment, created: true };
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", writeTables(), async () => {
          const existing = await db.correctiveExperiments.get(id);
          if (!existing) throw notFound("Corrective experiment", id);
          await checkSessions(db, input.burnSessionIds, existing.followUpBatchId);
          const experiment = parseRecord(
            CorrectiveExperimentSchema,
            {
              // The links are fixed at creation and copied, never taken from input.
              id: existing.id,
              investigationId: existing.investigationId,
              hypothesisId: existing.hypothesisId,
              followUpBatchId: existing.followUpBatchId,
              ...editable(input),
              createdAt: existing.createdAt,
              updatedAt: now(),
            },
            "corrective experiment",
          );
          await db.correctiveExperiments.put(experiment);
          await bumpChangeCounter(db);
          return experiment;
        }),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", [db.correctiveExperiments, db.meta], async () => {
          if (!(await db.correctiveExperiments.get(id))) throw notFound("Corrective experiment", id);
          await db.correctiveExperiments.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
