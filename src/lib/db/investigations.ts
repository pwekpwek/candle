import { InvestigationSchema } from "@/lib/schemas";
import { FIX_ISSUES } from "@/lib/types";
import type {
  Batch,
  BurnSession,
  ChecklistTick,
  CorrectiveExperiment,
  FixIssue,
  Formula,
  FormulaVersion,
  Hypothesis,
  Investigation,
} from "@/lib/types";
import type {
  BatchListItem,
  BurnSessionListItem,
  CandleDatabase,
  ChecklistTickInput,
  ComparisonBatch,
  ExperimentItem,
  FollowUpLink,
  HypothesisInput,
  InvestigationInput,
  InvestigationListItem,
  InvestigationsRepo,
} from "./contract";
import { experimentOrder } from "./corrective-experiments";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Latest observation first, then newest created, then id (stable). */
function investigationOrder(a: Investigation, b: Investigation): number {
  return (
    b.observedOn.localeCompare(a.observedOn) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** Oldest observation first, then oldest created, then id. */
function observedAscending(a: Investigation, b: Investigation): number {
  return (
    a.observedOn.localeCompare(b.observedOn) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** Latest test date first, then newest created, then id (as the burn-test repository). */
function sessionOrder(a: BurnSession, b: BurnSession): number {
  return (
    b.testedOn.localeCompare(a.testedOn) ||
    b.createdAt.localeCompare(a.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/** Unique known issues, in FIX_ISSUES order. Unknown or repeated issues are refused. */
function normaliseIssues(issues: unknown): FixIssue[] {
  if (!Array.isArray(issues)) throw new DataError("invalid", "Issues must be a list.");
  const seen = new Set<string>();
  for (const issue of issues) {
    if (typeof issue !== "string" || !(FIX_ISSUES as readonly string[]).includes(issue)) {
      throw new DataError("invalid", `Unknown issue ${String(issue)}.`);
    }
    if (seen.has(issue)) throw new DataError("invalid", `Issue ${issue} is listed twice.`);
    seen.add(issue);
  }
  return FIX_ISSUES.filter((issue) => seen.has(issue));
}

/**
 * Ticks to store: only items ticked or noted. A tick the investigation already
 * holds keeps its label snapshot, so a reworded item never changes history.
 */
function buildChecks(input: unknown, existing: Investigation | undefined): ChecklistTick[] {
  if (!Array.isArray(input)) throw new DataError("invalid", "Checks must be a list.");
  const stored = new Map((existing?.checks ?? []).map((tick) => [tick.itemId, tick]));
  const out: ChecklistTick[] = [];
  for (const row of input as ChecklistTickInput[]) {
    const note = optionalText(row?.note);
    if (row?.checked !== true && note === undefined) continue;
    const before = stored.get(row.itemId);
    out.push({
      itemId: row.itemId,
      issue: before?.issue ?? row.issue,
      label: before?.label ?? (typeof row.label === "string" ? row.label.trim() : row.label),
      checked: row.checked === true,
      ...(note !== undefined ? { note } : {}),
    });
  }
  return out;
}

/**
 * Hypotheses in the maker's order. A known id keeps its createdAt, and its
 * updatedAt unless the text, status or notes change. An unknown id is refused.
 */
function buildHypotheses(
  input: unknown,
  existing: Investigation | undefined,
  timestamp: string,
  newId: () => string,
): Hypothesis[] {
  if (!Array.isArray(input)) throw new DataError("invalid", "Hypotheses must be a list.");
  const stored = new Map((existing?.hypotheses ?? []).map((h) => [h.id, h]));
  return (input as HypothesisInput[]).map((row) => {
    const text = typeof row?.text === "string" ? row.text.trim() : row?.text;
    const notes = optionalText(row?.notes);
    if (row?.id !== undefined) {
      const before = stored.get(row.id);
      if (!before) throw new DataError("invalid", `Hypothesis ${row.id} is not in this investigation.`);
      const unchanged = before.text === text && before.status === row.status && before.notes === notes;
      return {
        id: before.id,
        text: text as string,
        status: row.status,
        ...(notes !== undefined ? { notes } : {}),
        createdAt: before.createdAt,
        updatedAt: unchanged ? before.updatedAt : timestamp,
      };
    }
    return {
      id: newId(),
      text: text as string,
      status: row?.status,
      ...(notes !== undefined ? { notes } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  });
}

/** An issue is never observed before its batch was made (same rule as burn tests). */
function checkObservedOn(observedOn: unknown, batch: Batch): void {
  if (typeof observedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(observedOn) && observedOn < batch.producedOn) {
    throw new DataError(
      "invalid",
      `Observed date ${observedOn} is before batch ${batch.id} was made (${batch.producedOn}).`,
    );
  }
}

/** The editable part of an investigation, ready for the schema. */
function editable(
  input: InvestigationInput,
  existing: Investigation | undefined,
  timestamp: string,
  newId: () => string,
) {
  const issues = normaliseIssues(input.issues);
  const otherIssue = issues.includes("other") ? optionalText(input.otherIssue) : undefined;
  const title = optionalText(input.title);
  const notes = optionalText(input.notes);
  return {
    observedOn: input.observedOn,
    ...(title !== undefined ? { title } : {}),
    issues,
    ...(otherIssue !== undefined ? { otherIssue } : {}),
    ...(notes !== undefined ? { notes } : {}),
    checks: buildChecks(input.checks, existing),
    hypotheses: buildHypotheses(input.hypotheses, existing, timestamp, newId),
  };
}

export function createInvestigationsRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): InvestigationsRepo {
  const readTables = () => [
    db.investigations,
    db.investigationPhotos,
    db.correctiveExperiments,
    db.batches,
    db.formulaVersions,
    db.formulas,
    db.burnSessions,
    db.burnPhotos,
  ];

  /** Batches joined with their formula and version; a batch whose source is missing is left out. */
  async function batchItems(ids: readonly string[]): Promise<Map<string, BatchListItem>> {
    const unique = [...new Set(ids)];
    const batches = (await db.batches.bulkGet(unique)).filter((b): b is Batch => b !== undefined);
    const [versions, formulas] = await Promise.all([
      db.formulaVersions.bulkGet([...new Set(batches.map((b) => b.versionId))]),
      db.formulas.bulkGet([...new Set(batches.map((b) => b.formulaId))]),
    ]);
    const versionById = new Map(
      versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]),
    );
    const formulaById = new Map(formulas.filter((f): f is Formula => f !== undefined).map((f) => [f.id, f]));
    const out = new Map<string, BatchListItem>();
    for (const batch of batches) {
      const version = versionById.get(batch.versionId);
      const formula = formulaById.get(batch.formulaId);
      if (version && formula) out.set(batch.id, { batch, formula, version });
    }
    return out;
  }

  async function listItems(investigations: Investigation[]): Promise<InvestigationListItem[]> {
    const items = await batchItems(investigations.map((inv) => inv.batchId));
    const out: InvestigationListItem[] = [];
    for (const investigation of investigations) {
      const item = items.get(investigation.batchId);
      if (!item) continue;
      const [photoCount, experimentCount] = await Promise.all([
        db.investigationPhotos.where("investigationId").equals(investigation.id).count(),
        db.correctiveExperiments.where("investigationId").equals(investigation.id).count(),
      ]);
      out.push({ investigation, ...item, photoCount, experimentCount });
    }
    return out;
  }

  /** Burn tests of a known batch as list items, in the order given. */
  async function sessionItems(sessions: BurnSession[], item: BatchListItem): Promise<BurnSessionListItem[]> {
    const out: BurnSessionListItem[] = [];
    for (const session of sessions) {
      const photoCount = await db.burnPhotos.where("sessionId").equals(session.id).count();
      out.push({ session, batch: item.batch, formula: item.formula, version: item.version, photoCount });
    }
    return out;
  }

  /** An experiment's listed burn tests that still exist and belong to its follow-up batch, in its order. */
  async function listedSessions(experiment: CorrectiveExperiment, followUp: BatchListItem) {
    const sessions = (await db.burnSessions.bulkGet(experiment.burnSessionIds)).filter(
      (s): s is BurnSession => s !== undefined && s.batchId === followUp.batch.id,
    );
    return sessionItems(sessions, followUp);
  }

  async function experimentItems(investigationId: string): Promise<ExperimentItem[]> {
    const experiments = (
      await db.correctiveExperiments.where("investigationId").equals(investigationId).toArray()
    ).sort(experimentOrder);
    const items = await batchItems(experiments.map((e) => e.followUpBatchId));
    const out: ExperimentItem[] = [];
    for (const experiment of experiments) {
      const followUp = items.get(experiment.followUpBatchId);
      if (!followUp) continue;
      out.push({ experiment, followUp, burnSessions: await listedSessions(experiment, followUp) });
    }
    return out;
  }

  async function investigationsOf(batchId: string): Promise<Investigation[]> {
    return (await db.investigations.where("batchId").equals(batchId).toArray()).sort(observedAscending);
  }

  return {
    list: (filter) =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const all = (await db.investigations.toArray()).sort(investigationOrder);
          const shown = filter?.includeArchived ? all : all.filter((inv) => inv.archivedAt === null);
          return listItems(shown);
        }),
      ),

    listByBatch: (batchId) =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const found = (await db.investigations.where("batchId").equals(batchId).toArray()).sort(investigationOrder);
          return listItems(found);
        }),
      ),

    get: (id) =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const investigation = await db.investigations.get(id);
          if (!investigation) return undefined;
          const [item] = await listItems([investigation]);
          if (!item) return undefined;
          return { ...item, experiments: await experimentItems(id) };
        }),
      ),

    create: (request) =>
      guard(() =>
        db.transaction("rw", [db.investigations, db.batches, db.meta], async () => {
          // Idempotent: a retry with the same id writes nothing.
          const already = await db.investigations.get(request.investigationId);
          if (already) return { investigation: already, created: false };
          const batch = await db.batches.get(request.batchId);
          if (!batch) throw notFound("Batch", request.batchId);
          checkObservedOn(request.observedOn, batch);
          const timestamp = now();
          const investigation = parseRecord(
            InvestigationSchema,
            {
              id: request.investigationId,
              batchId: batch.id,
              ...editable(request, undefined, timestamp, newId),
              archivedAt: null,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            "investigation",
          );
          await db.investigations.add(investigation);
          await bumpChangeCounter(db);
          return { investigation, created: true };
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", [db.investigations, db.batches, db.correctiveExperiments, db.meta], async () => {
          const existing = await db.investigations.get(id);
          if (!existing) throw notFound("Investigation", id);
          const batch = await db.batches.get(existing.batchId);
          if (!batch) throw notFound("Batch", existing.batchId);
          // A stored date is kept as it is (a restore can bring one in); only a
          // changed date must follow the rule.
          if (input.observedOn !== existing.observedOn) checkObservedOn(input.observedOn, batch);
          const timestamp = now();
          const fields = editable(input, existing, timestamp, newId);
          // A hypothesis an experiment names stays until that experiment is removed.
          const kept = new Set(fields.hypotheses.map((h) => h.id));
          const experiments = await db.correctiveExperiments.where("investigationId").equals(id).toArray();
          const named = experiments.filter((e) => !kept.has(e.hypothesisId));
          if (named.length > 0) {
            throw new DataError(
              "in-use",
              `Hypothesis ${named[0]!.hypothesisId} is tested by corrective experiment ${named[0]!.id}.`,
            );
          }
          const investigation = parseRecord(
            InvestigationSchema,
            {
              id: existing.id,
              batchId: existing.batchId,
              ...fields,
              archivedAt: existing.archivedAt,
              createdAt: existing.createdAt,
              updatedAt: timestamp,
            },
            "investigation",
          );
          await db.investigations.put(investigation);
          await bumpChangeCounter(db);
          return investigation;
        }),
      ),

    setArchived: (id, archived) =>
      guard(() =>
        db.transaction("rw", [db.investigations, db.meta], async () => {
          const existing = await db.investigations.get(id);
          if (!existing) throw notFound("Investigation", id);
          const timestamp = now();
          const investigation = parseRecord(
            InvestigationSchema,
            {
              ...existing,
              archivedAt: archived ? (existing.archivedAt ?? timestamp) : null,
              updatedAt: timestamp,
            },
            "investigation",
          );
          await db.investigations.put(investigation);
          await bumpChangeCounter(db);
          return investigation;
        }),
      ),

    deletionImpact: (id) =>
      guard(() =>
        db.transaction("r", [db.investigationPhotos, db.correctiveExperiments], async () => ({
          photos: await db.investigationPhotos.where("investigationId").equals(id).count(),
          experiments: await db.correctiveExperiments.where("investigationId").equals(id).count(),
        })),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction(
          "rw",
          [db.investigations, db.investigationPhotos, db.correctiveExperiments, db.meta],
          async () => {
            if (!(await db.investigations.get(id))) throw notFound("Investigation", id);
            // The maker confirmed both counts (deletionImpact). Batches and burn tests stay.
            await db.investigationPhotos.where("investigationId").equals(id).delete();
            await db.correctiveExperiments.where("investigationId").equals(id).delete();
            await db.investigations.delete(id);
            await bumpChangeCounter(db);
          },
        ),
      ),

    followUpLinks: (batchId) =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const experiments = (
            await db.correctiveExperiments.where("followUpBatchId").equals(batchId).toArray()
          ).sort(experimentOrder);
          const investigations = new Map(
            (await db.investigations.bulkGet([...new Set(experiments.map((e) => e.investigationId))]))
              .filter((inv): inv is Investigation => inv !== undefined)
              .map((inv) => [inv.id, inv]),
          );
          const originals = await batchItems([...investigations.values()].map((inv) => inv.batchId));
          const out: FollowUpLink[] = [];
          for (const experiment of experiments) {
            const investigation = investigations.get(experiment.investigationId);
            const original = investigation ? originals.get(investigation.batchId) : undefined;
            if (investigation && original) out.push({ experiment, investigation, original });
          }
          return out;
        }),
      ),

    comparison: (id) =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const investigation = await db.investigations.get(id);
          if (!investigation) return undefined;
          const originalItem = (await batchItems([investigation.batchId])).get(investigation.batchId);
          if (!originalItem) return undefined;
          const originalSessions = (
            await db.burnSessions.where("batchId").equals(investigation.batchId).toArray()
          ).sort(sessionOrder);
          const original: ComparisonBatch = {
            item: originalItem,
            burnSessions: await sessionItems(originalSessions, originalItem),
            investigations: await investigationsOf(investigation.batchId),
          };
          const experiments = (await experimentItems(id)).map(async ({ experiment, followUp, burnSessions }) => ({
            experiment,
            followUp: {
              item: followUp,
              burnSessions,
              investigations: await investigationsOf(followUp.batch.id),
            },
          }));
          return { investigation, original, experiments: await Promise.all(experiments) };
        }),
      ),
  };
}
