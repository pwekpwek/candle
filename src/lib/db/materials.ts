import { MaterialSchema } from "@/lib/schemas";
import type { Material } from "@/lib/types";
import type { CandleDatabase, MaterialInput, MaterialsRepo } from "./contract";
import { DataError, guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

/** Trims a string; a blank one becomes undefined. A non-string is left for the schema to refuse. */
function cleanOptional(value: string | undefined): string | undefined {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Copies the defined entries only, and returns undefined when none are left. */
function compact<T extends object>(entries: T): T | undefined {
  const kept = Object.fromEntries(
    Object.entries(entries).filter(([, value]) => value !== undefined),
  );
  return Object.keys(kept).length === 0 ? undefined : (kept as T);
}

/**
 * The editable fields of a material, in their cleanest valid shape: strings
 * trimmed, blank optionals and empty detail objects left out, and only the
 * details that belong to the material's type kept (a wick never carries wax
 * details, an oil carries none).
 */
function editableFields(input: MaterialInput) {
  const fields: Pick<Material, "name" | "supplier" | "notes" | "wax" | "wick" | "vessel"> = {
    name: typeof input.name === "string" ? input.name.trim() : input.name,
  };
  const supplier = cleanOptional(input.supplier);
  const notes = cleanOptional(input.notes);
  if (supplier !== undefined) fields.supplier = supplier;
  if (notes !== undefined) fields.notes = notes;

  if (input.type === "wax") {
    const wax = compact({
      maxFragranceBp: input.wax?.maxFragranceBp,
      maxFragranceBasis: input.wax?.maxFragranceBasis,
    });
    if (wax) fields.wax = wax;
  } else if (input.type === "wick") {
    const wick = compact({ size: cleanOptional(input.wick?.size) });
    if (wick) fields.wick = wick;
  } else if (input.type === "vessel") {
    const vessel = compact({
      capacityMl: input.vessel?.capacityMl,
      defaultFillMg: input.vessel?.defaultFillMg,
    });
    if (vessel) fields.vessel = vessel;
  }
  return fields;
}

/** Builds and validates a new material record. Shared with `example.prepare`. */
export function buildMaterial(input: MaterialInput, id: string, timestamp: string): Material {
  return parseRecord(
    MaterialSchema,
    {
      id,
      type: input.type,
      ...editableFields(input),
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
    "material",
  );
}

function byName(a: Material, b: Material): number {
  return (
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id)
  );
}

export function createMaterialsRepo(
  db: CandleDatabase,
  now: () => string,
  newId: () => string,
): MaterialsRepo {
  return {
    list: (filter) =>
      guard(async () => {
        const all = await db.materials.toArray();
        return all
          .filter((m) => (filter?.includeArchived ? true : m.archivedAt === null))
          .filter((m) => (filter?.type ? m.type === filter.type : true))
          .sort(byName);
      }),

    get: (id) => guard(() => db.materials.get(id)),

    create: (input) =>
      guard(() =>
        db.transaction("rw", db.materials, db.meta, async () => {
          const material = buildMaterial(input, newId(), now());
          await db.materials.add(material);
          await bumpChangeCounter(db);
          return material;
        }),
      ),

    update: (id, input) =>
      guard(() =>
        db.transaction("rw", db.materials, db.meta, async () => {
          const existing = await db.materials.get(id);
          if (!existing) throw notFound("Material", id);
          if (input.type !== existing.type) {
            throw new DataError("invalid", "A material's type cannot change.");
          }
          const updated = parseRecord(
            MaterialSchema,
            {
              id: existing.id,
              type: existing.type,
              ...editableFields(input),
              createdAt: existing.createdAt,
              updatedAt: now(),
              archivedAt: existing.archivedAt,
            },
            "material",
          );
          await db.materials.put(updated);
          await bumpChangeCounter(db);
          return updated;
        }),
      ),

    setArchived: (id, archived) =>
      guard(() =>
        db.transaction("rw", db.materials, db.meta, async () => {
          const existing = await db.materials.get(id);
          if (!existing) throw notFound("Material", id);
          const timestamp = now();
          const updated = parseRecord(
            MaterialSchema,
            { ...existing, archivedAt: archived ? timestamp : null, updatedAt: timestamp },
            "material",
          );
          await db.materials.put(updated);
          await bumpChangeCounter(db);
          return updated;
        }),
      ),

    usageCounts: () =>
      guard(async () => {
        const formulasByMaterial = new Map<string, Set<string>>();
        await db.formulaVersions.each((version) => {
          const { waxes, oils, wick, vessel } = version.inputs;
          const ids = [
            ...waxes.map((row) => row.materialId),
            ...oils.map((row) => row.materialId),
            ...(wick ? [wick.materialId] : []),
            ...(vessel ? [vessel.materialId] : []),
          ];
          for (const materialId of ids) {
            const formulas = formulasByMaterial.get(materialId) ?? new Set<string>();
            formulas.add(version.formulaId);
            formulasByMaterial.set(materialId, formulas);
          }
        });
        return new Map([...formulasByMaterial].map(([id, set]) => [id, set.size]));
      }),
  };
}
