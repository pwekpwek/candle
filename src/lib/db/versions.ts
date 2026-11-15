import { computePlan } from "@/lib/gramguard";
import type { PlanInput, ValidatedRow } from "@/lib/gramguard";
import { FormulaSchema, FormulaVersionSchema } from "@/lib/schemas";
import { CALC_VERSION } from "@/lib/types";
import type {
  Component,
  Formula,
  FormulaVersion,
  LinkedMaterial,
  Material,
  MaterialSnapshot,
  MaterialType,
} from "@/lib/types";
import type {
  CandleDatabase,
  MetaRepo,
  SaveVersionRequest,
  SaveVersionResult,
  VersionsRepo,
} from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** The details of a library material as a snapshot. Absent keys stay absent. */
function snapshotOf(material: Material): MaterialSnapshot {
  const snapshot: MaterialSnapshot = { type: material.type, name: material.name };
  if (material.supplier !== undefined) snapshot.supplier = material.supplier;
  if (material.wax !== undefined) snapshot.wax = { ...material.wax };
  if (material.wick !== undefined) snapshot.wick = { ...material.wick };
  if (material.vessel !== undefined) snapshot.vessel = { ...material.vessel };
  return snapshot;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? undefined : trimmed;
}

/** Snapshots of every material the parent version used, by material id. */
function parentSnapshots(parent: FormulaVersion | undefined): Map<string, MaterialSnapshot> {
  const found = new Map<string, MaterialSnapshot>();
  if (!parent) return found;
  const { waxes, oils, wick, vessel } = parent.inputs;
  for (const row of [...waxes, ...oils]) found.set(row.materialId, row.snapshot);
  if (wick) found.set(wick.materialId, wick.snapshot);
  if (vessel) found.set(vessel.materialId, vessel.snapshot);
  return found;
}

export function createVersionsRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
  meta: MetaRepo,
): VersionsRepo {
  async function saveInTransaction(request: SaveVersionRequest): Promise<SaveVersionResult> {
    const { versionId, target, origin, parentVersionId, scale, input, draftKey } = request;

    // 1. Idempotent: an existing version is returned and nothing is written.
    const already = await db.formulaVersions.get(versionId);
    if (already) {
      const formula = await db.formulas.get(already.formulaId);
      if (!formula) throw notFound("Formula", already.formulaId);
      return { formula, version: already, created: false };
    }

    // Request shape.
    if (target.kind === "new") {
      if (origin !== "initial" || parentVersionId !== null || scale !== null) {
        throw new DataError("invalid", "A new formula's first version is initial, with no parent or scale.");
      }
    } else {
      if (origin !== "revision" && origin !== "scaled") {
        throw new DataError("invalid", "A version added to a formula is a revision or a scaled copy.");
      }
      if (parentVersionId === null) {
        throw new DataError("invalid", "A revision or scaled copy needs a parent version.");
      }
      if (origin === "scaled" && scale === null) {
        throw new DataError("invalid", "A scaled version needs its scale.");
      }
      if (origin === "revision" && scale !== null) {
        throw new DataError("invalid", "A revision has no scale.");
      }
    }

    // 2. The formula and the next number.
    const timestamp = now();
    const existingFormula = await db.formulas.get(target.formulaId);
    let formula: Formula;
    let number: number;
    let parent: FormulaVersion | undefined;
    if (target.kind === "new") {
      if (existingFormula) throw new DataError("invalid", `Formula ${target.formulaId} already exists.`);
      formula = parseRecord(
        FormulaSchema,
        {
          id: target.formulaId,
          name: typeof input.name === "string" ? input.name.trim() : input.name,
          latestVersionNumber: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
        },
        "formula",
      );
      number = 1;
    } else {
      if (!existingFormula) throw notFound("Formula", target.formulaId);
      parent = parentVersionId ? await db.formulaVersions.get(parentVersionId) : undefined;
      if (!parent || parent.formulaId !== existingFormula.id) {
        throw new DataError("invalid", "The parent version does not belong to this formula.");
      }
      number = existingFormula.latestVersionNumber + 1;
      formula = parseRecord(
        FormulaSchema,
        { ...existingFormula, latestVersionNumber: number, updatedAt: timestamp },
        "formula",
      );
    }

    // 3. Components and snapshots.
    const library = new Map<string, Material>();
    const wanted = [
      ...input.waxes.map((row) => row.materialId),
      ...input.oils.map((row) => row.materialId),
      ...(input.wickId ? [input.wickId] : []),
      ...(input.vesselId ? [input.vesselId] : []),
    ];
    for (const material of await db.materials.bulkGet([...new Set(wanted)])) {
      if (material) library.set(material.id, material);
    }
    const fallback = parentSnapshots(parent);

    const snapshotFor = (materialId: string, type: MaterialType): MaterialSnapshot => {
      const material = library.get(materialId);
      const snapshot = material ? snapshotOf(material) : fallback.get(materialId);
      if (!snapshot) {
        throw new DataError("invalid", `Material ${materialId} is not in the library or the parent version.`);
      }
      if (snapshot.type !== type) {
        throw new DataError("invalid", `Material ${materialId} is not of type ${type}.`);
      }
      return snapshot;
    };
    const component = (row: ValidatedRow, type: MaterialType): Component => ({
      componentId: newId(),
      materialId: row.materialId,
      snapshot: snapshotFor(row.materialId, type),
      partsX100: row.partsX100,
    });
    const linked = (materialId: string | null, type: MaterialType): LinkedMaterial | null =>
      materialId === null ? null : { materialId, snapshot: snapshotFor(materialId, type) };

    const waxes = input.waxes.map((row) => component(row, "wax"));
    const oils = input.oils.map((row) => component(row, "fragranceOil"));
    const wick = linked(input.wickId, "wick");
    const vessel = linked(input.vesselId, "vessel");

    // 4. Targets from the engine.
    const planInput: PlanInput = {
      sizing: input.sizing,
      fragranceBp: input.fragranceBp,
      basis: input.basis,
      precisionMg: input.precisionMg,
      waxes: waxes.map((row) => ({ componentId: row.componentId, partsX100: row.partsX100 })),
      oils: oils.map((row) => ({ componentId: row.componentId, partsX100: row.partsX100 })),
    };
    let result: ReturnType<typeof computePlan>;
    try {
      result = computePlan(planInput);
    } catch (error) {
      if (error instanceof RangeError) {
        throw new DataError("invalid", `The calculation refused the input. ${error.message}`);
      }
      throw error;
    }
    if (!result.ok) {
      throw new DataError("calculation", `The plan failed (${result.reason}).`);
    }
    const { plan } = result;

    // 5. Write.
    const notes = optionalText(input.notes);
    const changeNote = optionalText(input.changeNote);
    const version: FormulaVersion = parseRecord(
      FormulaVersionSchema,
      {
        id: versionId,
        formulaId: target.formulaId,
        number,
        origin,
        parentVersionId,
        scale,
        ...(changeNote !== undefined ? { changeNote } : {}),
        createdAt: timestamp,
        inputs: {
          sizing: input.sizing,
          fragranceBp: input.fragranceBp,
          basis: input.basis,
          precisionMg: input.precisionMg,
          waxes,
          oils,
          wick,
          vessel,
          ...(notes !== undefined ? { notes } : {}),
        },
        targets: {
          totalMg: plan.totalMg,
          waxTotalMg: plan.waxTotalMg,
          fragranceTotalMg: plan.fragranceTotalMg,
          components: [...plan.waxes, ...plan.oils].map((row) => ({
            componentId: row.componentId,
            targetMg: row.targetMg,
          })),
        },
        calcVersion: CALC_VERSION,
      },
      "version",
    );

    await db.formulaVersions.add(version);
    await db.formulas.put(formula);
    if (draftKey !== null) await db.drafts.delete(draftKey);
    await bumpChangeCounter(db);
    return { formula, version, created: true };
  }

  return {
    listByFormula: (formulaId) =>
      guard(async () => {
        const rows = await db.formulaVersions.where("formulaId").equals(formulaId).toArray();
        return rows.sort((a, b) => b.number - a.number);
      }),

    get: (id) => guard(() => db.formulaVersions.get(id)),

    save: async (request) => {
      const result = await guard(() =>
        db.transaction(
          "rw",
          [db.formulas, db.formulaVersions, db.materials, db.drafts, db.meta],
          () => saveInTransaction(request),
        ),
      );
      if (result.created) {
        // DATA-14: asked after the commit, never awaited, never allowed to fail the save.
        try {
          meta.requestPersistence().catch(() => undefined);
        } catch {
          // ignored
        }
      }
      return result;
    },
  };
}
