import { BurnSessionSchema, CurePlanSchema } from "@/lib/schemas";
import type {
  Batch,
  BurnCandle,
  BurnRecord,
  BurnSession,
  BurnWick,
  CurePlan,
  Formula,
  FormulaVersion,
} from "@/lib/types";
import type {
  BurnCandleInput,
  BurnRecordInput,
  BurnSessionInput,
  BurnSessionListItem,
  BurnSessionsRepo,
  CandleDatabase,
} from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Latest test date first, then newest created, then id (stable). */
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

/** Copies the optional fields that are set, so absent stays absent. */
function present<T extends object>(fields: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

function buildBurns(
  input: readonly BurnRecordInput[],
  existing: BurnCandle | undefined,
  newId: () => string,
): BurnRecord[] {
  const known = new Set((existing?.burns ?? []).map((burn) => burn.id));
  const seen = new Set<string>();
  return input.map((row) => {
    let id: string;
    if (row.id !== undefined) {
      if (!known.has(row.id)) throw new DataError("invalid", `Burn ${row.id} is not on this candle.`);
      if (seen.has(row.id)) throw new DataError("invalid", `Burn ${row.id} is listed twice.`);
      id = row.id;
    } else {
      id = newId();
    }
    seen.add(id);
    return {
      id,
      durationMin: row.durationMin,
      ...present({
        weightBeforeMg: row.weightBeforeMg,
        weightAfterMg: row.weightAfterMg,
        meltPoolDiameterMm: row.meltPoolDiameterMm,
        meltPoolDepthMm: row.meltPoolDepthMm,
        flameHeightMm: row.flameHeightMm,
        soot: row.soot,
        notes: optionalText(row.notes),
      }),
    };
  });
}

/**
 * Resolves the editor's wick. A library wick must exist and be a wick; its
 * name is snapshotted, except that a candle whose material is unchanged keeps
 * the name it already stored (the name used at the time of the test).
 */
async function resolveWick(
  db: CandleDatabase,
  candle: BurnCandleInput,
  existing: BurnCandle | undefined,
): Promise<BurnWick> {
  const wick = candle.wick;
  if ("materialId" in wick) {
    if (existing && existing.wick.materialId === wick.materialId) return existing.wick;
    const material = await db.materials.get(wick.materialId);
    if (!material) throw notFound("Material", wick.materialId);
    if (material.type !== "wick") {
      throw new DataError("invalid", `Material ${material.id} is not a wick.`);
    }
    return { materialId: material.id, name: material.name.trim() };
  }
  return { materialId: null, name: typeof wick.text === "string" ? wick.text.trim() : "" };
}

async function buildCandles(
  db: CandleDatabase,
  input: readonly BurnCandleInput[],
  existing: BurnSession | undefined,
  newId: () => string,
): Promise<BurnCandle[]> {
  const stored = new Map((existing?.candles ?? []).map((candle) => [candle.id, candle]));
  const seen = new Set<string>();
  const candles: BurnCandle[] = [];
  for (const row of input) {
    let id: string;
    let before: BurnCandle | undefined;
    if (row.id !== undefined) {
      before = stored.get(row.id);
      if (!before) throw new DataError("invalid", `Candle ${row.id} is not in this session.`);
      if (seen.has(row.id)) throw new DataError("invalid", `Candle ${row.id} is listed twice.`);
      id = row.id;
    } else {
      id = newId();
    }
    seen.add(id);
    candles.push({
      id,
      label: typeof row.label === "string" ? row.label.trim() : row.label,
      wick: await resolveWick(db, row, before),
      burns: buildBurns(row.burns ?? [], before, newId),
      ...present({
        coldThrow: optionalText(row.coldThrow),
        hotThrow: optionalText(row.hotThrow),
        notes: optionalText(row.notes),
      }),
    });
  }
  return candles;
}

/**
 * Checks the milestone link and returns the cure plan to write (with the
 * milestone marked done on `testedOn`), or undefined when nothing changes.
 */
async function linkMilestone(
  db: CandleDatabase,
  session: BurnSession,
  timestamp: string,
  previousMilestoneId: string | null = null,
): Promise<CurePlan | undefined> {
  const milestoneId = session.milestoneId;
  if (milestoneId === null) return undefined;
  const plan = await db.curePlans.get(session.batchId);
  const milestone = plan?.milestones.find((m) => m.id === milestoneId);
  if (!plan || !milestone || milestone.kind !== "burnTest") {
    throw new DataError("invalid", `Milestone ${milestoneId} is not a planned burn test of this batch.`);
  }
  const others = await db.burnSessions.where("milestoneId").equals(milestoneId).toArray();
  // A link the session already had is kept even if a merge restore left a
  // second session on the same milestone (M-1); only a new link must be free.
  const isNewLink = milestoneId !== previousMilestoneId;
  if (isNewLink && others.some((other) => other.id !== session.id)) {
    throw new DataError("invalid", `Milestone ${milestoneId} is already linked to another burn test.`);
  }
  if (milestone.doneOn === session.testedOn) return undefined;
  return parseRecord(
    CurePlanSchema,
    {
      ...plan,
      milestones: plan.milestones.map((m) => (m.id === milestoneId ? { ...m, doneOn: session.testedOn } : m)),
      updatedAt: timestamp,
    },
    "cure plan",
  );
}

/**
 * Integration QA: a burn test is never dated before its batch was made (the
 * editor already refuses it; this keeps the rule when a screen does not).
 * The date's format is the schema's job, so only a well-formed date is compared.
 */
function checkTestedOn(testedOn: unknown, batch: Batch): void {
  if (typeof testedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(testedOn) && testedOn < batch.producedOn) {
    throw new DataError(
      "invalid",
      `Burn test date ${testedOn} is before batch ${batch.id} was made (${batch.producedOn}).`,
    );
  }
}

/** The editable part of a session, ready for the schema. */
async function editable(
  db: CandleDatabase,
  input: BurnSessionInput,
  existing: BurnSession | undefined,
  newId: () => string,
) {
  return {
    testedOn: input.testedOn,
    milestoneId: input.milestoneId ?? null,
    candles: await buildCandles(db, input.candles ?? [], existing, newId),
    ...present({
      label: optionalText(input.label),
      conclusion: optionalText(input.conclusion),
      notes: optionalText(input.notes),
    }),
  };
}

export function createBurnSessionsRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): BurnSessionsRepo {
  /** Joins sessions with their batch, formula, version and photo count. Damaged links are left out. */
  async function withSources(sessions: BurnSession[]): Promise<BurnSessionListItem[]> {
    const batchIds = [...new Set(sessions.map((s) => s.batchId))];
    const batches = (await db.batches.bulkGet(batchIds)).filter((b): b is Batch => b !== undefined);
    const versionIds = [...new Set(batches.map((b) => b.versionId))];
    const formulaIds = [...new Set(batches.map((b) => b.formulaId))];
    const [versions, formulas] = await Promise.all([
      db.formulaVersions.bulkGet(versionIds),
      db.formulas.bulkGet(formulaIds),
    ]);
    const batchById = new Map(batches.map((b) => [b.id, b]));
    const versionById = new Map(
      versions.filter((v): v is FormulaVersion => v !== undefined).map((v) => [v.id, v]),
    );
    const formulaById = new Map(
      formulas.filter((f): f is Formula => f !== undefined).map((f) => [f.id, f]),
    );
    const items: BurnSessionListItem[] = [];
    for (const session of sessions) {
      const batch = batchById.get(session.batchId);
      const version = batch ? versionById.get(batch.versionId) : undefined;
      const formula = batch ? formulaById.get(batch.formulaId) : undefined;
      if (!batch || !version || !formula) continue;
      const photoCount = await db.burnPhotos.where("sessionId").equals(session.id).count();
      items.push({ session, batch, formula, version, photoCount });
    }
    return items;
  }

  const readTables = () => [db.burnSessions, db.burnPhotos, db.batches, db.formulaVersions, db.formulas];

  return {
    list: () =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const sessions = (await db.burnSessions.toArray()).sort(sessionOrder);
          return withSources(sessions);
        }),
      ),

    listByBatch: (batchId) =>
      guard(() =>
        db.transaction("r", readTables(), async () => {
          const sessions = (await db.burnSessions.where("batchId").equals(batchId).toArray()).sort(sessionOrder);
          return withSources(sessions);
        }),
      ),

    get: (id) =>
      guard(() =>
        db.transaction("r", [...readTables(), db.curePlans], async () => {
          const session = await db.burnSessions.get(id);
          if (!session) return undefined;
          const [item] = await withSources([session]);
          if (!item) return undefined;
          let milestone = null;
          if (session.milestoneId !== null) {
            const plan = await db.curePlans.get(session.batchId);
            const found = plan?.milestones.find((m) => m.id === session.milestoneId);
            milestone = found && found.kind === "burnTest" ? found : null;
          }
          return { ...item, milestone };
        }),
      ),

    burnTestOptions: (batchId) =>
      guard(() =>
        db.transaction("r", [db.curePlans, db.burnSessions], async () => {
          const plan = await db.curePlans.get(batchId);
          if (!plan) return [];
          const sessions = await db.burnSessions.where("batchId").equals(batchId).toArray();
          const linkedBy = new Map<string, string>();
          for (const s of sessions) if (s.milestoneId !== null) linkedBy.set(s.milestoneId, s.id);
          return plan.milestones
            .filter((m) => m.kind === "burnTest")
            .sort((a, b) => a.offsetDays - b.offsetDays || a.id.localeCompare(b.id))
            .map((milestone) => ({ milestone, linkedSessionId: linkedBy.get(milestone.id) ?? null }));
        }),
      ),

    create: (request) =>
      guard(() =>
        db.transaction("rw", [db.burnSessions, db.batches, db.materials, db.curePlans, db.meta], async () => {
          // Idempotent: a retry with the same id writes nothing.
          const already = await db.burnSessions.get(request.sessionId);
          if (already) return { session: already, created: false };
          const batch = await db.batches.get(request.batchId);
          if (!batch) throw notFound("Batch", request.batchId);
          checkTestedOn(request.testedOn, batch);
          const timestamp = now();
          const session = parseRecord(
            BurnSessionSchema,
            {
              id: request.sessionId,
              batchId: request.batchId,
              ...(await editable(db, request, undefined, newId)),
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            "burn session",
          );
          const plan = await linkMilestone(db, session, timestamp);
          await db.burnSessions.add(session);
          if (plan) await db.curePlans.put(plan);
          await bumpChangeCounter(db);
          return { session, created: true };
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", [db.burnSessions, db.batches, db.materials, db.curePlans, db.meta], async () => {
          const existing = await db.burnSessions.get(id);
          if (!existing) throw notFound("Burn session", id);
          const batch = await db.batches.get(existing.batchId);
          if (!batch) throw notFound("Batch", existing.batchId);
          // A test date already stored is kept as it is (a restore can bring
          // one in, M-2); only a changed date must follow the rule.
          if (input.testedOn !== existing.testedOn) checkTestedOn(input.testedOn, batch);
          const timestamp = now();
          const session = parseRecord(
            BurnSessionSchema,
            {
              // Identity and the batch link are copied, never taken from input.
              id: existing.id,
              batchId: existing.batchId,
              ...(await editable(db, input, existing, newId)),
              createdAt: existing.createdAt,
              updatedAt: timestamp,
            },
            "burn session",
          );
          const plan = await linkMilestone(db, session, timestamp, existing.milestoneId);
          await db.burnSessions.put(session);
          if (plan) await db.curePlans.put(plan);
          await bumpChangeCounter(db);
          return session;
        }),
      ),

    deletionImpact: (id) =>
      guard(() =>
        db.transaction("r", [db.burnPhotos, db.correctiveExperiments], async () => ({
          photos: await db.burnPhotos.where("sessionId").equals(id).count(),
          experiments: await db.correctiveExperiments.where("burnSessionIds").equals(id).count(),
        })),
      ),

    delete: (id) =>
      guard(() =>
        db.transaction("rw", [db.burnSessions, db.burnPhotos, db.correctiveExperiments, db.meta], async () => {
          if (!(await db.burnSessions.get(id))) throw notFound("Burn session", id);
          // CandleFix: a burn test a corrective experiment lists is part of
          // that experiment's history; remove it from the experiment first.
          const experiments = await db.correctiveExperiments.where("burnSessionIds").equals(id).count();
          if (experiments > 0) {
            throw new DataError("in-use", `Burn test ${id} is listed by ${experiments} corrective experiment(s).`);
          }
          await db.burnPhotos.where("sessionId").equals(id).delete();
          await db.burnSessions.delete(id);
          await bumpChangeCounter(db);
        }),
      ),
  };
}

/** Sessions of a batch whose link points at a milestone not in `keep`. Used by the cure-plan cascade. */
export async function unlinkSessions(
  db: CandleDatabase,
  batchId: string,
  keep: ReadonlySet<string>,
  timestamp: string,
): Promise<void> {
  const sessions = await db.burnSessions.where("batchId").equals(batchId).toArray();
  for (const session of sessions) {
    if (session.milestoneId === null || keep.has(session.milestoneId)) continue;
    await db.burnSessions.put(
      parseRecord(BurnSessionSchema, { ...session, milestoneId: null, updatedAt: timestamp }, "burn session"),
    );
  }
}

