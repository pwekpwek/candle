import { FormulaSchema } from "@/lib/schemas";
import type { FormulaVersion } from "@/lib/types";
import type { CandleDatabase, FormulaListItem, FormulasRepo } from "./contract";
import { guard, notFound, parseRecord } from "./errors";
import { bumpChangeCounter } from "./meta";

export function createFormulasRepo(db: CandleDatabase, now: () => string): FormulasRepo {
  return {
    list: () =>
      guard(async () => {
        const formulas = await db.formulas.toArray();
        const versions: FormulaVersion[] = await db.formulaVersions
          .where("[formulaId+number]")
          .anyOf(formulas.map((f) => [f.id, f.latestVersionNumber]))
          .toArray();
        const latest = new Map(versions.map((v) => [`${v.formulaId}#${v.number}`, v]));
        const items: FormulaListItem[] = [];
        for (const formula of formulas) {
          const latestVersion = latest.get(`${formula.id}#${formula.latestVersionNumber}`);
          // Saving is one transaction, so a formula without its latest version
          // row cannot come out of the data layer. If damaged data ever
          // produces one, leave it out rather than hand the screen a hole.
          if (latestVersion) items.push({ formula, latestVersion });
        }
        return items.sort(
          (a, b) =>
            b.formula.updatedAt.localeCompare(a.formula.updatedAt) ||
            a.formula.id.localeCompare(b.formula.id),
        );
      }),

    get: (id) => guard(() => db.formulas.get(id)),

    updateDetails: (id, details) =>
      guard(() =>
        db.transaction("rw", db.formulas, db.meta, async () => {
          const existing = await db.formulas.get(id);
          if (!existing) throw notFound("Formula", id);
          const rest: Record<string, unknown> = { ...existing };
          delete rest.notes;
          const notes = typeof details.notes === "string" ? details.notes.trim() : details.notes;
          const updated = parseRecord(
            FormulaSchema,
            {
              ...rest,
              name: typeof details.name === "string" ? details.name.trim() : details.name,
              ...(notes ? { notes } : {}),
              updatedAt: now(),
            },
            "formula",
          );
          await db.formulas.put(updated);
          await bumpChangeCounter(db);
          return updated;
        }),
      ),

    setArchived: (id, archived) =>
      guard(() =>
        db.transaction("rw", db.formulas, db.meta, async () => {
          const existing = await db.formulas.get(id);
          if (!existing) throw notFound("Formula", id);
          const timestamp = now();
          const updated = parseRecord(
            FormulaSchema,
            { ...existing, archivedAt: archived ? timestamp : null, updatedAt: timestamp },
            "formula",
          );
          await db.formulas.put(updated);
          await bumpChangeCounter(db);
          return updated;
        }),
      ),

    deletionImpact: (id) =>
      guard(async () => ({
        versions: await db.formulaVersions.where("formulaId").equals(id).count(),
        measurements: await db.measurements.where("formulaId").equals(id).count(),
      })),

    deletePermanently: (id) =>
      guard(() =>
        db.transaction(
          "rw",
          [db.formulas, db.formulaVersions, db.measurements, db.drafts, db.meta],
          async () => {
            if (!(await db.formulas.get(id))) throw notFound("Formula", id);
            await db.measurements.where("formulaId").equals(id).delete();
            await db.formulaVersions.where("formulaId").equals(id).delete();
            await db.drafts.delete(id);
            await db.formulas.delete(id);
            await bumpChangeCounter(db);
          },
        ),
      ),
  };
}
