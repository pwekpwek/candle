import { CurePlanSchema } from "@/lib/schemas";
import type { CureMilestone, CurePlan } from "@/lib/types";
import type { CandleDatabase, CureMilestoneInput, CurePlansRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

function optionalText(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Builds the stored milestones from the editor's input. Known ids keep their
 * stored `doneOn`; new milestones get a fresh id and start open.
 */
function buildMilestones(
  input: readonly CureMilestoneInput[],
  existing: CurePlan | undefined,
  newId: () => string,
): CureMilestone[] {
  const stored = new Map((existing?.milestones ?? []).map((m) => [m.id, m]));
  const seen = new Set<string>();
  return input.map((row) => {
    let id: string;
    let doneOn: string | null = null;
    if (row.id !== undefined) {
      const before = stored.get(row.id);
      if (!before) throw new DataError("invalid", `Milestone ${row.id} is not in this plan.`);
      if (seen.has(row.id)) throw new DataError("invalid", `Milestone ${row.id} is listed twice.`);
      id = row.id;
      doneOn = before.doneOn;
    } else {
      id = newId();
    }
    seen.add(id);
    const label = optionalText(row.label);
    return {
      id,
      kind: row.kind,
      ...(label !== undefined ? { label } : {}),
      offsetDays: row.offsetDays,
      doneOn,
    };
  });
}

export function createCurePlansRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): CurePlansRepo {
  return {
    get: (batchId) => guard(() => db.curePlans.get(batchId)),

    save: (batchId, milestones) =>
      guard(() =>
        db.transaction("rw", [db.curePlans, db.batches, db.meta], async () => {
          if (!(await db.batches.get(batchId))) throw notFound("Batch", batchId);
          const existing = await db.curePlans.get(batchId);
          const timestamp = now();
          const plan = parseRecord(
            CurePlanSchema,
            {
              id: batchId,
              milestones: buildMilestones(milestones ?? [], existing, newId),
              createdAt: existing?.createdAt ?? timestamp,
              updatedAt: timestamp,
            },
            "cure plan",
          );
          await db.curePlans.put(plan);
          await bumpChangeCounter(db);
          return plan;
        }),
      ),

    setMilestoneDone: (batchId, milestoneId, doneOn) =>
      guard(() =>
        db.transaction("rw", [db.curePlans, db.meta], async () => {
          const existing = await db.curePlans.get(batchId);
          if (!existing) throw notFound("Cure plan", batchId);
          const target = existing.milestones.find((m) => m.id === milestoneId);
          if (!target) throw notFound("Milestone", milestoneId);
          if (target.doneOn === doneOn) return existing;
          const plan = parseRecord(
            CurePlanSchema,
            {
              ...existing,
              milestones: existing.milestones.map((m) =>
                m.id === milestoneId ? { ...m, doneOn } : m,
              ),
              updatedAt: now(),
            },
            "cure plan",
          );
          await db.curePlans.put(plan);
          await bumpChangeCounter(db);
          return plan;
        }),
      ),

    delete: (batchId) =>
      guard(() =>
        db.transaction("rw", [db.curePlans, db.meta], async () => {
          if (!(await db.curePlans.get(batchId))) throw notFound("Cure plan", batchId);
          await db.curePlans.delete(batchId);
          await bumpChangeCounter(db);
        }),
      ),
  };
}
